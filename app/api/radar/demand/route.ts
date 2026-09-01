import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Domanda degli acquirenti per zona, con coordinate.
 *
 * # Da dove viene il dato
 *
 * Da `Lead.preferredZone`, che è testo libero: due agenti scrivono "Vignola"
 * e "vignola centro" per la stessa area. Le zone si raggruppano su una chiave
 * normalizzata e si contano i lead per ciascuna.
 *
 * # Perché le coordinate sono in cache
 *
 * Geocodificare a ogni apertura della mappa significherebbe decine di chiamate
 * a un servizio gratuito per un dato che non cambia mai: "Vignola" sta dov'è.
 * `RadarZoneDemand` conserva il risultato, comprese le ricerche fallite —
 * altrimenti una zona scritta in modo strano verrebbe ricercata invano a ogni
 * caricamento.
 *
 * # Cosa NON esce da qui
 *
 * Nomi, telefoni e budget dei lead non compaiono: solo una zona e un numero.
 * Una mappa di calore serve a vedere dove c'è domanda, non chi la esprime, e
 * un pallino che si può cliccare per risalire a una persona sarebbe un dato
 * personale messo su una mappa senza motivo.
 */

export const maxDuration = 60;

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Tetto per apertura: la politica d'uso chiede una richiesta al secondo. */
const MAX_NUOVE_ZONE = 5;

async function geocodifica(zona: string): Promise<{ lat: number; lon: number } | null> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", zona);
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PropertyTech/1.0 (supporto@propertytechsolutions.net)",
        "Accept-Language": "it",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const dati = (await response.json()) as { lat?: string; lon?: string }[];
    const primo = dati[0];
    return primo?.lat && primo?.lon ? { lat: Number(primo.lat), lon: Number(primo.lon) } : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const organizationId = session.user.organizationId;

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      qualificationStatus: { not: "OPT_OUT" },
      preferredZone: { not: null },
    },
    select: { preferredZone: true },
  });

  // Raggruppamento sulla chiave normalizzata, conservando la prima grafia
  // incontrata come etichetta leggibile.
  const conteggi = new Map<string, { label: string; leads: number }>();
  for (const lead of leads) {
    const label = (lead.preferredZone ?? "").trim();
    if (label.length < 2) continue;
    const key = label.toLowerCase();
    const riga = conteggi.get(key);
    if (riga) riga.leads++;
    else conteggi.set(key, { label, leads: 1 });
  }

  if (conteggi.size === 0) return NextResponse.json({ zones: [] });

  const inCache = await prisma.radarZoneDemand.findMany({
    where: { organizationId, zoneKey: { in: [...conteggi.keys()] } },
  });
  const cache = new Map(inCache.map((z) => [z.zoneKey, z]));

  // Solo le zone mai cercate, e poche per volta: le successive arrivano alla
  // prossima apertura, invece di far aspettare l'agente davanti a una mappa
  // vuota mentre si interroga un servizio esterno venti volte.
  const daRisolvere = [...conteggi.entries()].filter(([key]) => !cache.has(key));

  for (const [key, { label }] of daRisolvere.slice(0, MAX_NUOVE_ZONE)) {
    const posizione = await geocodifica(label);
    const riga = await prisma.radarZoneDemand.upsert({
      where: { organizationId_zoneKey: { organizationId, zoneKey: key } },
      create: {
        organizationId,
        zoneKey: key,
        label,
        latitude: posizione?.lat ?? null,
        longitude: posizione?.lon ?? null,
      },
      update: {},
    });
    cache.set(key, riga);
  }

  const zones = [...conteggi.entries()]
    .map(([key, { label, leads }]) => {
      const posizione = cache.get(key);
      return posizione?.latitude != null && posizione.longitude != null
        ? { label, leads, latitude: posizione.latitude, longitude: posizione.longitude }
        : null;
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

  return NextResponse.json({
    zones,
    // Quante zone restano da geocodificare: la mappa lo dice, invece di
    // mostrare una domanda parziale come se fosse tutta.
    pending: Math.max(0, daRisolvere.length - MAX_NUOVE_ZONE),
  });
}
