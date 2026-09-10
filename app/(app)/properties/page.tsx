import { auth } from "@/auth";
import { PropertyPortfolio } from "@/components/properties/property-portfolio";
import { InfoTip } from "@/components/shared/info-tip";

/**
 * Il ruolo si legge qui e scende come proprieta': i componenti client non
 * hanno accesso alla sessione, e senza il ruolo mostrerebbero all'agente
 * comandi che il server rifiuta con un 403.
 */
export default async function PropertiesPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
          Portafoglio Immobili
          <InfoTip label="L'archivio degli immobili che hai in incarico. Da qui esce il feed XML per i portali e parte lo Smart Matching, che a ogni nuovo immobile controlla quali lead già qualificati rientrano nei suoi parametri." />
        </h1>
        <p className="text-sm text-muted-foreground">
          Gli immobili salvati dal modulo annunci, con i lead qualificati che corrispondono alle
          loro caratteristiche.
        </p>
      </div>

      <PropertyPortfolio currentRole={session?.user?.role ?? "AGENT"} />
    </div>
  );
}
