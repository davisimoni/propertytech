"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import Supercluster from "supercluster";
import "leaflet/dist/leaflet.css";
import type { RadarItem } from "./radar-board";

/**
 * Mappa delle opportunità del Radar.
 *
 * # Perché Leaflet e non Mapbox
 *
 * Mapbox richiede un token e fattura a consumo, e i suoi server stanno negli
 * Stati Uniti. Leaflet con le tessere OpenStreetMap non richiede né chiave né
 * contratto, e le tessere arrivano dall'infrastruttura della OpenStreetMap
 * Foundation, in Europa — coerente con la residenza dei dati del resto della
 * piattaforma.
 *
 * # Perché Leaflet "nudo" e non react-leaflet
 *
 * `react-leaflet` alla versione 5 richiede React 19, mentre il progetto è su
 * React 18: si dovrebbe fissare la 4 e ricordarsene a ogni aggiornamento. In
 * più, il raggruppamento dei punti richiede comunque di gestire i marcatori a
 * mano a ogni spostamento della mappa, quindi il livello di astrazione in
 * mezzo non farebbe risparmiare niente e aggiungerebbe una dipendenza da
 * tenere allineata a due librerie invece che a una.
 *
 * # Perché il raggruppamento
 *
 * Un'agenzia che segue duecento lotti su una provincia produce duecento
 * marcatori sovrapposti: la mappa diventa illeggibile prima ancora di
 * diventare lenta. Supercluster li aggrega per livello di zoom e ricalcola a
 * ogni spostamento, mostrando un solo cerchio col conteggio dove i punti sono
 * troppo vicini.
 */

/** Centro sull'Italia, quando non c'è ancora nulla da inquadrare. */
const CENTRO_ITALIA: [number, number] = [42.5, 12.5];

const COLORI = {
  VERDE: "#10B981",
  GIALLO: "#F59E0B",
  ROSSO: "#EF4444",
  /** Perizia non ancora caricata o non riuscita: grigio, non verde. Il
   *  silenzio non e' una rassicurazione, come per il semaforo in scheda. */
  IGNOTO: "#94A3B8",
} as const;

function coloreDi(item: RadarItem): string {
  if (item.appraisal?.status !== "PRONTA") return COLORI.IGNOTO;
  return COLORI[item.appraisal.risk];
}

const euro = (v: number) => new Intl.NumberFormat("it-IT").format(v);

type Punto = GeoJSON.Feature<GeoJSON.Point, { itemId: string; colore: string }>;

export function RadarMap({
  items,
  onOpenItem,
}: {
  items: RadarItem[];
  onOpenItem: (id: string) => void;
}) {
  const contenitore = useRef<HTMLDivElement>(null);
  const mappa = useRef<LeafletMap | null>(null);
  const marcatori = useRef<Marker[]>([]);
  const [pronta, setPronta] = useState(false);

  const conCoordinate = useMemo(
    () => items.filter((i) => i.latitude !== null && i.longitude !== null),
    [items]
  );

  const indice = useMemo(() => {
    const punti: Punto[] = conCoordinate.map((item) => ({
      type: "Feature",
      properties: { itemId: item.id, colore: coloreDi(item) },
      geometry: { type: "Point", coordinates: [item.longitude!, item.latitude!] },
    }));

    const cluster = new Supercluster<{ itemId: string; colore: string }>({
      radius: 60,
      maxZoom: 16,
    });
    cluster.load(punti);
    return cluster;
  }, [conCoordinate]);

  /** Ridisegna i marcatori per la porzione di mappa attualmente visibile. */
  const disegna = useCallback(async () => {
    const L = (await import("leaflet")).default;
    const map = mappa.current;
    if (!map) return;

    marcatori.current.forEach((m) => m.remove());
    marcatori.current = [];

    const b = map.getBounds();
    const gruppi = indice.getClusters(
      [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      Math.round(map.getZoom())
    );

    for (const gruppo of gruppi) {
      // `noUncheckedIndexedAccess` rende ogni indice `number | undefined`:
      // una coordinata mancante e' un punto che non si puo' collocare, e
      // disegnarlo a [0,0] metterebbe un pin nel Golfo di Guinea.
      const [lng, lat] = gruppo.geometry.coordinates;
      if (lng === undefined || lat === undefined) continue;
      const props = gruppo.properties as { cluster?: boolean; point_count?: number; itemId?: string; colore?: string };

      if (props.cluster) {
        const quanti = props.point_count ?? 0;
        const lato = quanti < 10 ? 32 : quanti < 50 ? 40 : 48;

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:${lato}px;height:${lato}px;border-radius:9999px;background:rgba(0,102,255,.85);color:#fff;display:flex;align-items:center;justify-content:center;font:600 13px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${quanti}</div>`,
            iconSize: [lato, lato],
            iconAnchor: [lato / 2, lato / 2],
          }),
        }).addTo(map);

        marker.on("click", () => {
          // Zoom fino al livello che scompone questo gruppo: aprire un popup
          // su un aggregato non direbbe di quale lotto si sta parlando.
          const id = (gruppo as { id?: number }).id;
          const zoom = id !== undefined ? indice.getClusterExpansionZoom(id) : map.getZoom() + 2;
          map.setView([lat, lng], zoom);
        });

        marcatori.current.push(marker);
        continue;
      }

      const item = conCoordinate.find((i) => i.id === props.itemId);
      if (!item) continue;

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:18px;height:18px;border-radius:9999px;background:${props.colore};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(map);

      marker.bindPopup(popupHtml(item), { maxWidth: 300 });
      marker.on("popupopen", () => {
        // Il pulsante vive dentro l'HTML del popup, fuori dall'albero React:
        // l'aggancio si fa qui, quando l'elemento esiste davvero.
        document
          .getElementById(`radar-apri-${item.id}`)
          ?.addEventListener("click", () => onOpenItem(item.id), { once: true });
      });

      marcatori.current.push(marker);
    }
  }, [indice, conCoordinate, onOpenItem]);

  // --- Creazione della mappa, una volta sola -------------------------------
  useEffect(() => {
    let annullato = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (annullato || !contenitore.current || mappa.current) return;

      const map = L.map(contenitore.current, {
        center: CENTRO_ITALIA,
        zoom: 6,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // L'attribuzione è una condizione della licenza ODbL, non un vezzo.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mappa.current = map;
      map.on("moveend zoomend", () => void disegna());
      setPronta(true);
    })();

    return () => {
      annullato = true;
      mappa.current?.remove();
      mappa.current = null;
    };
    // Creata una volta: il ridisegno dei punti è gestito dall'effetto sotto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Inquadratura e ridisegno quando cambiano i dati --------------------
  useEffect(() => {
    if (!pronta || !mappa.current) return;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mappa.current;
      if (!map) return;

      if (conCoordinate.length > 0) {
        const limiti = L.latLngBounds(
          conCoordinate.map((i) => [i.latitude!, i.longitude!] as [number, number])
        );
        map.fitBounds(limiti, { padding: [40, 40], maxZoom: 14 });
      }

      void disegna();
    })();
  }, [pronta, conCoordinate, disegna]);

  const senzaCoordinate = items.length - conCoordinate.length;

  return (
    <div className="space-y-2">
      <div
        ref={contenitore}
        className="h-[28rem] w-full overflow-hidden rounded-xl border border-border"
        // Leaflet misura il contenitore alla creazione: senza un'altezza
        // esplicita la mappa nasce alta zero e non mostra nulla.
        style={{ background: "var(--muted, #f1f5f9)" }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legenda colore={COLORI.VERDE} testo="Rischio basso" />
        <Legenda colore={COLORI.GIALLO} testo="Da verificare" />
        <Legenda colore={COLORI.ROSSO} testo="Rischio alto" />
        <Legenda colore={COLORI.IGNOTO} testo="Perizia non caricata" />
        {senzaCoordinate > 0 && (
          <span>
            {senzaCoordinate}{" "}
            {senzaCoordinate === 1 ? "lotto senza coordinate" : "lotti senza coordinate"}: non
            compaiono sulla mappa.
          </span>
        )}
      </div>
    </div>
  );
}

function Legenda({ colore, testo }: { colore: string; testo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full border border-white"
        style={{ background: colore }}
        aria-hidden="true"
      />
      {testo}
    </span>
  );
}

/**
 * Contenuto del popup.
 *
 * HTML come stringa perché Leaflet non conosce React. I valori che arrivano
 * dal database vengono neutralizzati: un comune o una nota contengono testo
 * scritto da una persona, e inserirlo grezzo in `innerHTML` è una XSS
 * sull'applicazione dell'agenzia.
 */
function popupHtml(item: RadarItem): string {
  const esc = (v: string) =>
    v.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
    );

  const riferimento = item.kind === "ASTA" ? item.basePriceEur : item.previousPriceEur;
  const sconto =
    riferimento && riferimento > item.priceEur
      ? Math.round(((riferimento - item.priceEur) / riferimento) * 100)
      : null;

  const criteri =
    item.appraisal?.status === "PRONTA" && item.appraisal.riskReasons.length > 0
      ? `<ul style="margin:6px 0 0;padding-left:16px;color:#475569">${item.appraisal.riskReasons
          .map((r) => `<li style="margin-bottom:2px">${esc(r)}</li>`)
          .join("")}</ul>`
      : "";

  const semaforo =
    item.appraisal?.status === "PRONTA"
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${coloreDi(item)}22;color:${coloreDi(item)};font-weight:600;font-size:11px">${
          { VERDE: "Rischio basso", GIALLO: "Da verificare", ROSSO: "Rischio alto" }[
            item.appraisal.risk
          ]
        }</span>`
      : `<span style="font-size:11px;color:#64748b">Perizia non ancora analizzata</span>`;

  return `
    <div style="font:14px system-ui;min-width:220px">
      <div style="font-weight:600;margin-bottom:2px">${esc(item.comune)}${
        item.zona ? ` (${esc(item.zona)})` : ""
      }</div>
      <div style="color:#475569;margin-bottom:6px">
        ${euro(item.priceEur)} €${item.kind === "ASTA" ? " (offerta minima)" : ""} · ${item.squareMeters} mq
        ${sconto !== null ? `<br><span style="color:#10B981;font-weight:600">−${sconto}% sul ${item.kind === "ASTA" ? "valore di perizia" : "prezzo precedente"}</span>` : ""}
      </div>
      ${semaforo}
      ${criteri}
      <div style="margin:8px 0 6px;color:#475569">
        ${item._count.matches === 0 ? "Nessun lead in target" : `<strong>${item._count.matches}</strong> ${item._count.matches === 1 ? "lead in target" : "lead in target"}`}
      </div>
      <button id="radar-apri-${item.id}" type="button"
        style="width:100%;padding:6px 10px;border:0;border-radius:8px;background:#0066FF;color:#fff;font-weight:600;font-size:12px;cursor:pointer">
        Apri la scheda
      </button>
    </div>`;
}
