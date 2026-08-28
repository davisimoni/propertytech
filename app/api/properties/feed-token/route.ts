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
  const organizationId = await requireOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
 * Revoca il token: l'URL diventa immediatamente 401.
 *
 * È anche il modo di ruotarlo dopo una fuga di notizie — si revoca e si
 * riattiva, ottenendo un segreto nuovo. Due passaggi anziché un pulsante
 * "rigenera" perché la conseguenza sia esplicita: finché non si aggiorna il
 * pannello del portale, il feed resta muto e gli annunci vengono ritirati.
 */
export async function DELETE() {
  const organizationId = await requireOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { listingFeedToken: null },
  });

  return NextResponse.json({ token: null });
}
