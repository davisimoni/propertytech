import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrganizationByFeedToken } from "@/lib/listings/feed-token";
import { buildPortalFeed } from "@/lib/listings/portal-xml";
import { PUBLISHED_STATUSES } from "@/lib/listings/property-fields";
import { SITE_URL } from "@/lib/seo";

/**
 * Feed XML pubblico del portafoglio, per i portali immobiliari.
 *
 *     GET /api/feed/xml?token=ptf_...
 *
 * È la controparte automatica di `/api/properties/xml`, che resta il download
 * manuale dell'agente collegato. La differenza non è cosmetica: quella rotta
 * richiede una sessione, e un crawler di Immobiliare.it non ne ha una — senza
 * questo endpoint il feed poteva solo essere scaricato a mano e ricaricato a
 * mano sul pannello del portale, che è esattamente il lavoro che il feed
 * dovrebbe togliere.
 *
 * Non è protetta da paywall di piano, di proposito. Un gate qui non
 * negherebbe una schermata: farebbe rispondere a vuoto un URL già configurato
 * sul pannello del portale, e un feed che torna vuoto non "blocca" l'agenzia —
 * le **cancella gli annunci pubblicati**. Una conseguenza del genere non può
 * essere l'effetto collaterale di un downgrade.
 */

// Il portafoglio cambia quando l'agente carica un immobile: una copia in cache
// mostrerebbe sul portale una casa già venduta.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const organization = await findOrganizationByFeedToken(token);

  if (!organization) {
    // Il token non finisce nel log nemmeno quando è sbagliato: un refuso in
    // configurazione scriverebbe in chiaro, negli archivi, il segreto vero di
    // un'altra agenzia.
    console.warn("[feed/xml] Richiesta rifiutata: token assente o non valido");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    // organizationId nel filtro, sempre: è il token ad averla determinata, e
    // un feed che mescolasse due agenzie pubblicherebbe gli immobili di una
    // sotto il nome dell'altra (CLAUDE.md §5).
    //
    // Solo gli stati pubblicabili: bozze, venduti e archiviati non devono
    // comparire sui portali. `RESERVED` invece si', perche' una proposta
    // accettata non e' un rogito: ritirare l'annuncio durante la trattativa
    // lascerebbe l'agenzia senza alternative se salta.
    //
    // E' anche il motivo per cui `status` nasce `ACTIVE` di default: con un
    // default diverso questa riga avrebbe ritirato dalla pubblicazione, in
    // silenzio, ogni immobile gia' in portafoglio alla prima rilettura.
    where: { organizationId: organization.id, status: { in: [...PUBLISHED_STATUSES] } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  // Portafoglio vuoto: si risponde con un documento valido e senza annunci,
  // non con un 404. Per un feed ricorrente le due cose dicono l'opposto —
  // "nessun immobile da pubblicare" contro "il feed è rotto" — e il secondo
  // fa disattivare l'integrazione al portale.
  const xml = buildPortalFeed(properties, {
    agencyName: organization.legalName || organization.agencyName || "",
    // Da SITE_URL e non da `request.url`: gli URL delle foto finiscono in un
    // documento che scarica un server terzo, e un host preso dagli header
    // della richiesta e' influenzabile da chi la richiesta la manda.
    origin: SITE_URL,
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      // Niente Content-Disposition: qui il file non va scaricato da una
      // persona, va letto da una macchina.
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      // L'URL contiene un segreto: se finisce in un sitemap o in un referrer
      // non deve comunque diventare un risultato di ricerca.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
