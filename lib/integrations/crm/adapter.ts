import "server-only";
import type { Lead } from "@prisma/client";
import { deliverLeadToCrm, type CrmDeliveryResult, type CrmEvent } from "@/lib/integrations/crm-webhook";
import { importListingsFromCrm, type ListingImportResult } from "./listing-import";
import { getProvider, needsCredential, type CrmProvider } from "@/lib/integrations/providers";

/**
 * Contratto unico di un connettore CRM: le due direzioni che un gestionale
 * immobiliare può offrire a un'agenzia.
 *
 * Non è una nuova implementazione: `exportLead` è `deliverLeadToCrm` (già in
 * produzione, invariato) e `importListings` è la sincronizzazione annunci
 * introdotta in `listing-import.ts`. Questo modulo è il punto di ingresso
 * unico da cui il resto dell'app — rotte, cron, futuri connettori — parla a
 * "il CRM dell'agenzia" senza dover sapere quale delle due funzioni sotto sta
 * chiamando né come il provider scelto si autentica.
 */
export interface CRMIntegrationAdapter {
  readonly provider: CrmProvider;
  /** Verso il gestionale: un lead qualificato lascia PropertyTech. */
  exportLead(lead: Lead, event: CrmEvent): Promise<CrmDeliveryResult>;
  /** Dal gestionale: gli annunci in portafoglio entrano in PropertyTech. */
  importListings(organizationId: string): Promise<ListingImportResult>;
}

/** Adapter per il gestionale collegato dall'organizzazione (ripiega su webhook generico). */
export function getCrmIntegrationAdapter(providerId: string | null | undefined): CRMIntegrationAdapter {
  const provider = getProvider(providerId);

  return {
    provider,
    exportLead: (lead, event) => deliverLeadToCrm(lead, event),
    importListings: (organizationId) => importListingsFromCrm(organizationId),
  };
}

/**
 * Vero quando questo provider ha un concetto di "portafoglio immobili" da
 * leggere. Zapier, Make e il nostro webhook generico sono canali di
 * consegna, non gestionali con un'API propria: riusa lo stesso criterio con
 * cui la UI decide se mostrare i campi della credenziale.
 */
export function supportsListingImport(provider: CrmProvider): boolean {
  return needsCredential(provider);
}

export type { CrmDeliveryResult, CrmEvent, ListingImportResult };
