import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateFeedToken } from "@/lib/listings/feed-token";

/**
 * Attivazione e revoca del token con cui i portali prelevano il feed XML.
 *
 * Il token torna al browser in chiaro, a differenza delle credenziali del
 * gestionale che la UI mostra mascherate. Non è un'incoerenza: quelle sono
 * credenziali **di un sistema terzo**, che noi custodiamo per conto
 * dell'agenzia; questo è un segreto **nostro**, che esiste solo per essere
 * incollato nel pannello di Immobiliare.it. Mostrarlo mascherato lo renderebbe
 * semplicemente inutilizzabile.
 */

async function requireOrganizationId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.organizationId ?? null;
}

/** Stato corrente: `null` finché il feed non è stato attivato. */
export async function GET() {
  const organizationId = await requireOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { listingFeedToken: true },
  });

  return NextResponse.json({ token: organization?.listingFeedToken ?? null });
}

/**
 * Attiva il feed.
 *
 * Idempotente di proposito: se un token esiste già viene restituito
 * invariato, invece di generarne uno nuovo. Un secondo clic sul pulsante —
 * o due schede aperte — non deve invalidare l'URL che l'agenzia ha appena
 * finito di configurare sul portale.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  /*
   * Anche l'attivazione è del titolare, come revoca e rotazione.
   *
   * Mancava: l'interfaccia nascondeva già il pulsante a un collaboratore
   * ("Il feed verso i portali lo attiva il titolare"), ma la rotta accettava
   * la chiamata diretta. Nascondere un comando non è autorizzarlo, e qui il
   * comando pubblica l'intero portafoglio dell'agenzia verso l'esterno.
   */
  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' attivare il feed verso i portali." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;

  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { listingFeedToken: true },
  });

  if (existing?.listingFeedToken) {
    return NextResponse.json({ token: existing.listingFeedToken });
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { listingFeedToken: generateFeedToken() },
    select: { listingFeedToken: true },
  });

  return NextResponse.json({ token: updated.listingFeedToken });
}

/**
 * Ruota il token in un colpo: il vecchio URL diventa 401, il nuovo funziona.
 *
 * # Perché un passaggio e non due
 *
 * Prima la rotazione si faceva revocando e riattivando, e quei due passaggi
 * erano una scelta: rendere esplicita la conseguenza. Ma fra i due c'è una
 * finestra in cui il feed non risponde ad alcun token, e un feed che non
 * risponde **non "blocca" l'agenzia: le fa ritirare gli annunci** alla prima
 * rilettura del portale. Il pericolo da sventare non era la fretta di chi
 * clicca, era quella finestra. Una sola `update` non ce l'ha, e l'avviso
 * esplicito è passato dov'è utile: nella conferma in interfaccia.
 *
 * Niente controllo di collisione sul valore generato: 24 byte casuali sono
 * 192 bit, e il vincolo unico sulla colonna farebbe comunque fallire la
 * scrittura invece di sovrascrivere il token di qualcun altro.
 */
export async function PUT() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Stessa ragione della revoca: cambiare il token ferma il feed di TUTTA
  // l'agenzia finché il pannello del portale non viene aggiornato.
  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' rigenerare il feed verso i portali." },
      { status: 403 }
    );
  }

  const updated = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { listingFeedToken: generateFeedToken() },
    select: { listingFeedToken: true },
  });

  return NextResponse.json({ token: updated.listingFeedToken });
}

/**
 * Revoca il token: l'URL diventa immediatamente 401 e il feed tace.
 *
 * Serve a spegnere la sincronizzazione, non a ruotare il segreto — per quello
 * c'è `PUT`, che non lascia il feed muto nel frattempo.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Revocare il token ferma il feed verso i portali per TUTTA l'agenzia: gli
  // annunci vengono ritirati alla rilettura successiva. Non e' una modifica
  // che puo' fare chi gestisce un singolo immobile.
  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' revocare il feed verso i portali." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { listingFeedToken: null },
  });

  return NextResponse.json({ token: null });
}
