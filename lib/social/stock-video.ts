import "server-only";
import { randomUUID } from "node:crypto";
import { readSecret } from "@/lib/env";
import { MAX_VIDEO_BYTES } from "@/lib/social/media-limits";
import { putObject, readStorageConfig } from "@/lib/storage/object-storage";

/**
 * Video verticale di corredo per un post, preso dall'archivio stock di Pexels.
 *
 * # Stock, non generato: la differenza conta
 *
 * Questo modulo **non genera** video: li cerca in un archivio di riprese
 * libere e ne deposita una copia nel nostro bucket. Il nome del modulo lo dice
 * perché la distinzione non è accademica: un video generato si può chiedere su
 * misura, uno stock è una ripresa che esiste già e mostra un luogo reale che
 * non è quello dell'annuncio.
 *
 * # Perché le ricerche sono curate e non libere
 *
 * Perché la ricerca sbagliata è quella che funziona troppo bene. Cercare
 * "trilocale Milano Navigli" su un archivio stock restituisce l'interno di un
 * appartamento qualunque: bello, verticale, perfetto per un Reel — e
 * completamente ingannevole se il post riguarda un immobile preciso. Chi guarda
 * pensa di vedere quella casa.
 *
 * Le ricerche partono quindi da un elenco curato di temi **di contesto** — la
 * città, le chiavi, i documenti, la stretta di mano, chi cammina per strada —
 * scelto dalle parole del post. Nessuna query punta a interni abitativi, e non
 * per prudenza generica: è la sola forma in cui un video stock può stare sotto
 * un annuncio immobiliare senza mentire.
 *
 * # Quando l'agente chiede proprio gli interni
 *
 * È la richiesta che mette in tensione le due cose: «video esplorativo degli
 * interni» dice esattamente cosa si vuole, e questo archivio potrebbe darlo.
 * Restituire un salotto arredato sarebbe la risposta più obbediente e la più
 * dannosa — un tour di stanze sotto un annuncio si legge come quelle stanze, e
 * nessuna didascalia lo disinnesca.
 *
 * Quella richiesta non viene quindi né esaudita né ignorata: si risponde con
 * il **dettaglio** invece dell'ambiente. Le chiavi nella serratura, la luce che
 * entra da una finestra, una planimetria sul tavolo, un particolare
 * architettonico: sono riprese che stanno dentro l'intento — sono "interni",
 * non sono la città — e che nessuno può confondere con la visita a un
 * appartamento preciso. È un compromesso dichiarato, non una svista: chi vuole
 * far vedere le stanze vere ha il caricamento dal computer, e l'avviso sotto
 * gli allegati lo dice.
 *
 * # Perché il file passa dal nostro bucket
 *
 * Perché a scaricarlo, in pubblicazione, sono i server di Meta, e l'indirizzo
 * di Pexels non è sotto il nostro controllo. Una copia nostra è anche l'unico
 * modo di rispettare il tetto di dimensione che la firma prefirmata impone al
 * resto degli allegati.
 */

const ENDPOINT = "https://api.pexels.com/videos/search";
const TIMEOUT_RICERCA_MS = 15_000;
const TIMEOUT_SCARICO_MS = 60_000;

/** Quanti candidati valutare prima di arrendersi. */
const MAX_CANDIDATI = 4;

export interface VideoStock {
  url: string;
  type: "video/mp4";
  /** Da dichiarare all'agente: è materiale d'archivio, non l'immobile. */
  fonte: "pexels";
  /** Autore della ripresa: la licenza non lo impone, la correttezza sì. */
  autore: string | null;
}

/**
 * Le ricerche da provare, in ordine, per un dato tema.
 *
 * Ogni voce è di **contesto**: nessuna punta a un interno abitativo, che
 * sarebbe la ripresa più facile da confondere con l'immobile in vendita.
 * L'ultima è il ripiego che funziona sempre.
 */
function ricerchePerTema(tema: string): string[] {
  const t = tema.toLowerCase();

  /*
   * Confronto a inizio di parola, non sottostringa.
   *
   * Con `includes` bastava una parola che ne contenesse un'altra per dirottare
   * il tema, ed e' successo: **"catastale" contiene "asta"**, quindi un post
   * su una visura finiva nel ramo delle aste giudiziarie. Lo stesso valeva per
   * "internet" e "intern". Il danno era modesto — una ripresa di scrivania al
   * posto di un'altra — ma la regola era sbagliata, e la prossima parola
   * aggiunta all'elenco poteva pescare peggio.
   *
   * Il confine va davanti e solo davanti: le voci qui sotto sono radici volute
   * (`stanz` prende stanza e stanze, `camer` prende camera e camere), mentre una
   * coincidenza in mezzo a un'altra parola non conta piu'. E' scritto con
   * `String.raw` per un motivo che morde in silenzio: in un template literal
   * normale `\b` non e' il confine di parola, e' il carattere backspace, e la
   * regex non corrisponderebbe piu' a nulla — ogni tema finirebbe nel ripiego
   * generico senza un errore da nessuna parte.
   */
  const ha = (...parole: string[]) =>
    new RegExp(String.raw`\b(${parole.join("|")})`).test(t);

  /*
   * Questo ramo sta per primo, e non per importanza del tema.
   *
   * Sta per primo perché è l'unico che esiste per **evitare un danno**, mentre
   * gli altri scelgono solo la ripresa più adatta. Se un post dice «tour interni
   * dell'attico», il ramo del terrazzo qui sotto vincerebbe e consegnerebbe un
   * balcone con vista città: azzeccato sul tema, e mostrato sotto la parola
   * "attico" diventa il balcone di quell'attico. Fra l'essere azzeccati e il
   * non mentire, decide il secondo.
   *
   * `interni` e `interno` sono scritti per esteso di proposito: la radice
   * "intern" prenderebbe anche "internet" e "internazionale", che con le stanze
   * non hanno niente a che fare.
   */
  if (
    ha(
      "interni",
      "interno",
      "stanz",
      "camer",
      "soggiorno",
      "salone",
      "cucina",
      "bagno",
      "ambienti",
      "tour",
      "visita virtuale",
      "metri quadri"
    )
  ) {
    return [
      "chiavi porta serratura",
      "luce sole finestra tenda",
      "planimetria progetto tavolo",
      "dettaglio architettonico scala",
      // Una in più delle altre liste: queste query sono strette, e se cadono
      // tutte il ripiego generico è meglio di nessun video.
      "città architettura",
    ];
  }

  if (ha("asta", "tribunale", "perizia", "giudiziari")) {
    return ["documenti firma scrivania", "architettura tribunale città", "città architettura"];
  }
  if (ha("mutuo", "banca", "finanziamento", "offerta", "proposta")) {
    return ["stretta di mano ufficio", "firma contratto documenti", "città architettura"];
  }
  if (ha("documenti", "visura", "catast", "rogito", "notaio", "burocrazia")) {
    return ["documenti scrivania penna", "scrivania ufficio lavoro", "città architettura"];
  }
  if (ha("whatsapp", "messaggi", "lead", "contatti", "telefono")) {
    return ["persona smartphone città", "smartphone mani città", "città architettura"];
  }
  if (ha("chiavi", "consegna", "acquisto", "venduto", "rogitato")) {
    return ["chiavi casa mano", "porta ingresso palazzo", "città architettura"];
  }
  if (ha("terrazzo", "balcone", "vista", "attico", "panorama")) {
    return ["skyline città tramonto", "balcone vista città", "città architettura"];
  }

  // Predefinito: il contesto urbano, che sta bene su qualunque post
  // immobiliare senza raccontare nulla di falso su un immobile preciso.
  return ["facciata palazzo città", "quartiere residenziale strada", "città architettura"];
}

interface FilePexels {
  link: string;
  width: number;
  height: number;
  file_type: string;
  quality: string;
}

interface VideoPexels {
  video_files?: FilePexels[];
  user?: { name?: string };
}

/**
 * Il file più adatto a un Reel fra quelli di un video: verticale, MP4, e non
 * più grande del tetto che vale per tutti gli allegati.
 */
function scegliFile(video: VideoPexels): FilePexels | null {
  const candidati = (video.video_files ?? [])
    .filter((file) => file.file_type === "video/mp4" && file.height > file.width)
    // Dal più piccolo al più grande fra quelli abbastanza definiti: un 4K
    // verticale supera i cento megabyte e non aggiunge nulla su un telefono.
    .filter((file) => file.height >= 960)
    .sort((a, b) => a.height - b.height);

  return candidati[0] ?? null;
}

/**
 * Cerca, scarica e deposita un video verticale. `null` quando non è possibile.
 *
 * Non lancia mai: il testo del post è la ragione per cui l'agente ha premuto
 * "Genera", e un archivio che non risponde non deve portarselo via.
 */
export async function recuperaVideoStock(
  organizationId: string,
  tema: string
): Promise<VideoStock | null> {
  const apiKey = readSecret("PEXELS_API_KEY");
  const storage = readStorageConfig();

  if (!apiKey || !storage) {
    console.info("[social/video] Recupero saltato", {
      chiave: Boolean(apiKey),
      storage: Boolean(storage),
    });
    return null;
  }

  for (const query of ricerchePerTema(tema)) {
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set("query", query);
      url.searchParams.set("orientation", "portrait");
      url.searchParams.set("per_page", String(MAX_CANDIDATI));
      // L'archivio indicizza anche in italiano: senza questo, una query
      // italiana restituisce risultati casuali.
      url.searchParams.set("locale", "it-IT");

      const ricerca = await fetch(url, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(TIMEOUT_RICERCA_MS),
      });

      if (!ricerca.ok) {
        console.error("[social/video] Ricerca rifiutata", { status: ricerca.status, query });
        continue;
      }

      const corpo = (await ricerca.json().catch(() => null)) as { videos?: VideoPexels[] } | null;

      for (const video of corpo?.videos ?? []) {
        const file = scegliFile(video);
        if (!file) continue;

        const scarico = await fetch(file.link, {
          signal: AbortSignal.timeout(TIMEOUT_SCARICO_MS),
        });
        if (!scarico.ok) continue;

        const bytes = Buffer.from(await scarico.arrayBuffer());

        // Il tetto è quello di tutti gli allegati: un file oltre non
        // passerebbe comunque la firma del caricamento diretto.
        if (bytes.length > MAX_VIDEO_BYTES) {
          console.info("[social/video] Candidato troppo pesante", {
            mb: Math.round(bytes.length / (1024 * 1024)),
          });
          continue;
        }

        const objectKey = `${organizationId}/social/stock-${randomUUID()}.mp4`;
        const pubblico = await putObject(storage, objectKey, bytes, "video/mp4");

        return {
          url: pubblico,
          type: "video/mp4",
          fonte: "pexels",
          autore: video.user?.name ?? null,
        };
      }
    } catch (error) {
      console.error("[social/video] Recupero non riuscito", {
        query,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  return null;
}
