"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Images,
  Loader2,
  Play,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/listings/property-images";
import { downscaleToDataUrl } from "@/lib/listings/downscale";
import { useToast } from "@/components/shared/toast-provider";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_SOCIAL_MEDIA,
  MAX_VIDEO_BYTES,
  isAllowedVideoMimeType,
  kindFromExtension,
} from "@/lib/social/media-limits";
import { cn } from "@/lib/utils";

/**
 * Foto da allegare al post social.
 *
 * # Perché due strade e non una
 *
 * Perché sono due momenti diversi. Le foto dell'immobile esistono già in
 * portafoglio — ricaricarle a mano per pubblicare lo stesso appartamento è
 * lavoro doppio — ma un post non è sempre un annuncio: una locandina, una foto
 * scattata al volo o una grafica per una campagna non stanno in nessuna scheda,
 * e senza il caricamento locale l'agenzia dovrebbe inventarsi un immobile finto
 * per pubblicarle.
 *
 * # Foto sempre, video quando c'è dove metterli
 *
 * La pubblicazione dei video su Meta è implementata (Reel con attesa
 * dell'elaborazione su Instagram, `/videos` su Facebook). Quello che manca è la
 * strada per far **arrivare** il file: senza object storage un MP4 finirebbe
 * come data URI in PostgreSQL, e l'indirizzo che daremmo a Meta sarebbe una
 * nostra funzione che restituisce base64 — per un video, un rifiuto a
 * pubblicazione avviata.
 *
 * Quindi il pannello chiede alla rotta cosa sa accettare (`GET
 * /api/social/media`) e lo dice **prima** che l'agente scelga il file. Un
 * pulsante che accetta e poi fallisce è peggio di un pulsante che dichiara il
 * proprio limite: il primo fa perdere il lavoro già fatto sul testo.
 *
 * Il tetto dei video oggi è basso (`MAX_VIDEO_BYTES`) e non per scelta nostra:
 * il file passa nel corpo JSON di una funzione serverless, che accetta 4,5 MB.
 * Sale quando il caricamento andrà diretto al bucket.
 */

/**
 * Carica un video **direttamente nel bucket**, senza passare dal nostro server.
 *
 * # Perché non una `fetch`
 *
 * Perché `fetch` non riporta l'avanzamento di un caricamento, e qui i file
 * arrivano a decine di megabyte da una connessione mobile: senza una
 * percentuale, mezzo minuto di silenzio sembra un blocco e l'agente ricarica
 * la pagina a metà trasferimento. `XMLHttpRequest` è più vecchio ma è l'unico
 * che espone `upload.onprogress`.
 *
 * # Perché nessuna credenziale qui dentro
 *
 * L'indirizzo è già firmato dal server e vale quindici minuti per quel singolo
 * file, di quella dimensione esatta: il browser non ha niente da autenticare e
 * non riceve nessuna chiave.
 */
function caricaSulBucket(
  file: File,
  uploadUrl: string,
  onAvanzamento: (percentuale: number) => void
): Promise<void> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = new XMLHttpRequest();
    richiesta.open("PUT", uploadUrl, true);

    richiesta.upload.onprogress = (evento) => {
      if (evento.lengthComputable) {
        onAvanzamento(Math.round((evento.loaded / evento.total) * 100));
      }
    };

    richiesta.onload = () =>
      richiesta.status >= 200 && richiesta.status < 300
        ? risolvi()
        : rifiuta(new Error(`HTTP ${richiesta.status}`));
    richiesta.onerror = () => rifiuta(new Error("rete non disponibile"));
    richiesta.ontimeout = () => rifiuta(new Error("tempo scaduto"));

    // Dieci minuti: un file da cento megabyte su una connessione mobile lenta
    // ci mette piu' del minuto che il browser userebbe di suo.
    richiesta.timeout = 10 * 60 * 1000;
    richiesta.send(file);
  });
}

interface ImmobileConFoto {
  id: string;
  reference: string;
  title: string;
  images: string[];
}

/**
 * Anteprima di un allegato video.
 *
 * # Perché non basta il primo fotogramma
 *
 * Perché un fotogramma fermo **è** una foto: chi guarda la griglia vede due
 * riquadri identici e allega al post un video credendo di allegare una seconda
 * immagine. Poi pubblica, Meta lo tratta come Reel, e la scoperta arriva sul
 * profilo dell'agenzia. Il movimento è l'unico segnale che si capisce senza
 * leggere niente, e per questo l'anteprima parte da sola.
 *
 * # Muto non è un dettaglio
 *
 * È la condizione per partire: nessun browser fa partire da solo un video con
 * audio, quindi senza `muted` l'autoplay verrebbe **bloccato** e resteremmo
 * esattamente al fotogramma fermo di prima. Vale anche come cortesia — la
 * griglia può contenerne più di uno — ma il motivo tecnico viene prima.
 *
 * # Quando il movimento non arriva
 *
 * Due casi, e portano allo stesso posto. Chi ha chiesto meno animazioni dal
 * sistema operativo non deve ricevere un video che si muove in loop senza
 * averlo chiesto; e l'autoplay può essere negato comunque — risparmio
 * energetico su iOS, impostazioni del browser — senza che noi lo sappiamo in
 * anticipo. In entrambi i casi il riquadro resta fermo, quindi il segnale deve
 * esserci anche da fermo: il simbolo di riproduzione al centro compare proprio
 * quando il video **non** sta andando, ed è un pulsante vero, che lo avvia.
 * L'etichetta in alto a destra invece non se ne va mai: sopravvive al fermo
 * immagine, alla riproduzione e allo screenshot che l'agente manda al collega.
 */
function AnteprimaVideo({ url, etichetta }: { url: string; etichetta: string }) {
  const riferimento = useRef<HTMLVideoElement>(null);
  const [inRiproduzione, setInRiproduzione] = useState(false);
  /* `null` finché non si sa: si legge solo nel browser, e partire dal valore
     sbagliato farebbe muovere per un istante ciò che deve stare fermo. */
  const [movimentoRidotto, setMovimentoRidotto] = useState<boolean | null>(null);

  useEffect(() => {
    const ridotto = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    setMovimentoRidotto(ridotto);
    if (ridotto) return;

    /*
     * L'avvio va chiesto, non solo dichiarato.
     *
     * `autoPlay` conta nel momento in cui il browser comincia a caricare la
     * risorsa. Qui l'attributo arriva **dopo**, perche' la preferenza di
     * movimento si legge solo nel browser e questo componente viene reso anche
     * sul server: il primo render esce senza autoplay, il caricamento parte
     * cosi', e l'attributo aggiunto subito dopo trova la frittata fatta. Senza
     * questa chiamata l'anteprima resterebbe ferma proprio dove il fotogramma
     * fermo e' il problema da risolvere.
     */
    const nodo = riferimento.current;
    if (!nodo) return;

    /*
     * Muto imposto sulla proprieta', non solo dichiarato nel JSX.
     *
     * Su React 18 `muted` e' l'unico attributo di `<video>` che non viene
     * riflesso in modo garantito sul nodo DOM: e' un baco noto, e qui
     * costerebbe caro in silenzio. Un video non muto non viene avviato da
     * nessun browser, quindi l'esito non sarebbe "audio a sorpresa" — sarebbe
     * l'anteprima ferma, cioe' di nuovo il problema di partenza, senza errori
     * da nessuna parte a dire perche'.
     */
    nodo.muted = true;
    nodo.play().catch(() => {});
  }, []);

  function avvia() {
    const nodo = riferimento.current;
    if (!nodo) return;
    // Muto anche qui: e' la condizione perche' `play()` non venga rifiutato,
    // e chi tocca una miniatura in una lista non si aspetta dell'audio.
    nodo.muted = true;
    // Il rifiuto non va gestito: se non parte resta il simbolo, che è
    // esattamente quello che serviva. `catch` vuoto solo per non far salire
    // una promise rifiutata in console a ogni tocco.
    nodo.play().catch(() => {});
  }

  return (
    <>
      <video
        ref={riferimento}
        src={url}
        muted
        playsInline
        // Non prima di sapere cosa preferisce chi guarda.
        autoPlay={movimentoRidotto === false}
        loop={movimentoRidotto === false}
        preload="metadata"
        aria-label={`${etichetta} (video)`}
        onPlay={() => setInRiproduzione(true)}
        onPause={() => setInRiproduzione(false)}
        onEnded={() => setInRiproduzione(false)}
        onClick={avvia}
        className="aspect-square w-full bg-black object-cover"
      />

      {/* Grande quanto basta per il pollice, non quanto il riquadro: le frecce
          e il cestino stanno nella barra in basso e devono restare toccabili. */}
      {!inRiproduzione && (
        <button
          type="button"
          onClick={avvia}
          aria-label={`Riproduci ${etichetta}`}
          className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/30 transition-colors duration-200 hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
        </button>
      )}
    </>
  );
}

export function MediaAttachments({
  media,
  onChange,
  generatiDaAi = [],
}: {
  media: string[];
  onChange: (next: string[]) => void;
  /**
   * Gli allegati prodotti dall'AI, da dichiarare come tali.
   *
   * Non è una gentilezza: un'immagine generata che finisce sotto un annuncio
   * senza essere riconoscibile è il primo passo verso un post che mostra una
   * casa diversa da quella in vendita. L'etichetta serve a chi pubblica, che
   * spesso non è chi ha premuto "Genera".
   */
  generatiDaAi?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mostraPortafoglio, setMostraPortafoglio] = useState(false);
  /* `null` finché non si sa: l'interfaccia non deve promettere i video prima
     di aver chiesto, né escluderli mentre la risposta è in arrivo. */
  const [videoAmmessi, setVideoAmmessi] = useState<boolean | null>(null);
  /** Percentuale del video in corso: `null` quando non si sta caricando. */
  const [avanzamento, setAvanzamento] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/social/media")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => setVideoAmmessi(Boolean(dati?.videoSupported)))
      // In dubbio si resta alle foto: è la sola ipotesi che non produce un
      // errore a pubblicazione avviata.
      .catch(() => setVideoAmmessi(false));
  }, []);

  const rimanenti = MAX_SOCIAL_MEDIA - media.length;
  const tipiAccettati = [
    ...ALLOWED_IMAGE_MIME_TYPES,
    ...(videoAmmessi ? ALLOWED_VIDEO_MIME_TYPES : []),
  ].join(",");

  async function carica(files: FileList | File[]) {
    const scelti = Array.from(files).slice(0, Math.max(0, rimanenti));
    if (scelti.length === 0) {
      showToast(`Puoi allegare al massimo ${MAX_SOCIAL_MEDIA} foto.`, "error");
      return;
    }

    setIsBusy(true);
    const aggiunti: string[] = [];

    try {
      for (const file of scelti) {
        const isVideo = file.type.startsWith("video/");

        if (isVideo && !videoAmmessi) {
          showToast(
            "Per allegare video serve l'archivio esterno, non ancora attivo. Le foto funzionano.",
            "error"
          );
          continue;
        }

        if (isVideo && !isAllowedVideoMimeType(file.type)) {
          showToast(`${file.name}: formato video non supportato (MP4 o MOV).`, "error");
          continue;
        }

        if (isVideo && file.size > MAX_VIDEO_BYTES) {
          showToast(
            `${file.name}: il video supera ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB.`,
            "error"
          );
          continue;
        }

        if (!isVideo && !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
          showToast(`${file.name}: formato non supportato (JPG, PNG o WebP).`, "error");
          continue;
        }

        /*
         * Due strade, per due pesi diversi.
         *
         * La foto passa dal canvas (che la ridimensiona) e dal nostro server:
         * mezzo megabyte ci sta comodo nel corpo di una richiesta. Il video no,
         * e non per scelta: il corpo di una funzione serverless si ferma a
         * 4,5 MB. Quindi il video va diretto al bucket con un indirizzo che il
         * server firma senza mai vedere i byte.
         *
         * Un canvas su un video, poi, restituirebbe un fotogramma: lo
         * trasformerebbe in un'immagine senza dirlo a nessuno.
         */
        if (isVideo) {
          const permesso = await fetch("/api/social/media/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentType: file.type, byteSize: file.size }),
          });
          const datiPermesso = await permesso.json().catch(() => ({}));

          if (!permesso.ok) {
            showToast(datiPermesso.message ?? "Caricamento non riuscito.", "error");
            continue;
          }

          try {
            setAvanzamento(0);
            await caricaSulBucket(file, datiPermesso.uploadUrl as string, setAvanzamento);
            aggiunti.push(datiPermesso.publicUrl as string);
          } catch {
            showToast(`${file.name}: caricamento del video non riuscito.`, "error");
          } finally {
            setAvanzamento(null);
          }
          continue;
        }

        const dataUrl = await downscaleToDataUrl(file);
        const response = await fetch("/api/social/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          showToast(body.message ?? "Caricamento non riuscito.", "error");
          continue;
        }

        aggiunti.push(body.url as string);
      }

      if (aggiunti.length > 0) onChange([...media, ...aggiunti]);
    } catch {
      showToast("Non è stato possibile leggere il file.", "error");
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function rimuovi(indice: number) {
    onChange(media.filter((_, i) => i !== indice));
  }

  /*
   * Riordino con le frecce, non trascinando.
   *
   * Il trascinamento su touch confligge con lo scorrimento della pagina, ed è
   * proprio da telefono che l'agente prepara un post fra un appuntamento e
   * l'altro. Due frecce funzionano ovunque e si usano anche da tastiera.
   */
  function sposta(indice: number, direzione: -1 | 1) {
    const destinazione = indice + direzione;
    if (destinazione < 0 || destinazione >= media.length) return;
    const next = [...media];
    const corrente = next[indice];
    const altro = next[destinazione];
    if (corrente === undefined || altro === undefined) return;
    next[indice] = altro;
    next[destinazione] = corrente;
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Allegati multimediali</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Instagram non pubblica post di solo testo: senza allegati resta disponibile il solo
            Facebook.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {media.length} / {MAX_SOCIAL_MEDIA}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMostraPortafoglio(true)}
          disabled={isBusy || rimanenti <= 0}
          className="btn-outline text-xs disabled:opacity-50"
        >
          <Images className="h-3.5 w-3.5" />
          Seleziona da Portafoglio Immobili
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy || rimanenti <= 0}
          className="btn-outline text-xs disabled:opacity-50"
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {avanzamento === null ? "Carica dal computer" : `Carico il video… ${avanzamento}%`}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={tipiAccettati}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && carica(e.target.files)}
        />
      </div>

      {/* Area di trascinamento: la stessa zona accetta anche il rilascio. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) void carica(e.dataTransfer.files);
        }}
        className={cn(
          "mt-3 rounded-lg border border-dashed px-3 py-6 text-center text-xs transition-colors duration-200",
          isDragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground"
        )}
      >
        {videoAmmessi
          ? `Trascina qui foto o video, oppure usa i pulsanti sopra. JPG, PNG, WebP, MP4 o MOV (max ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB per video).`
          : "Trascina qui le foto, oppure usa i pulsanti sopra. JPG, PNG o WebP."}
      </div>

      {/* La barra solo mentre un video sale: su una connessione mobile sono
          decine di secondi, e senza un segnale che avanza sembra bloccato. */}
      {avanzamento !== null && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-300"
              style={{ width: `${avanzamento}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Caricamento del video: {avanzamento}%
          </p>
        </div>
      )}

      {videoAmmessi === false && (
        <p className="mt-2 text-xs text-muted-foreground">
          I video non sono ancora allegabili su questo ambiente: manca l&apos;archivio esterno dove
          Meta va a scaricarli. La pubblicazione dei Reel è già pronta e si attiva da sé quando
          l&apos;archivio viene configurato.
        </p>
      )}

      {media.length > 0 && (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {media.map((url, indice) => (
              <li
                key={`${url}-${indice}`}
                className="group relative overflow-hidden rounded-lg border border-border"
              >
                {/* Il tipo si ricava dall'estensione dell'indirizzo del bucket:
                    e' l'unica forma con cui un video puo' arrivare qui, perche'
                    gli indirizzi `/api/social/media/<id>` — senza estensione —
                    sono sempre e solo foto (`kind: "image"` in entrambi i rami
                    della rotta che li crea). */}
                {kindFromExtension(url) === "video" ? (
                  <AnteprimaVideo url={url} etichetta={`Allegato ${indice + 1}`} />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={url}
                    alt={`Allegato ${indice + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                )}

                {kindFromExtension(url) === "video" && (
                  <span className="pointer-events-none absolute right-1 top-1 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    <VideoIcon className="h-2.5 w-2.5" aria-hidden="true" />
                    Video
                  </span>
                )}

                {/* Etichetta precisa, non generica: l'immagine e' generata,
                    il video viene da un archivio stock. Chiamarli entrambi
                    "AI" sarebbe comodo e falso, e chi pubblica ha il diritto
                    di sapere quale delle due cose ha in mano. */}
                {generatiDaAi.includes(url) && (
                  <span className="absolute bottom-8 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {kindFromExtension(url) === "video" ? "Video stock" : "Immagine AI"}
                  </span>
                )}

                {indice === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Copertina
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1 py-1">
                  <button
                    type="button"
                    onClick={() => sposta(indice, -1)}
                    disabled={indice === 0}
                    aria-label="Sposta indietro"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rimuovi(indice)}
                    aria-label="Rimuovi"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-status-blocked/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => sposta(indice, 1)}
                    disabled={indice === media.length - 1}
                    aria-label="Sposta avanti"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Il primo allegato è la copertina del post. Usa le frecce per riordinarli.
          </p>

          {/*
            L'avvertenza compare solo quando c'e' un media prodotto da noi, e dice
            la cosa che conta: non raffigura l'immobile. Un post che lo presenta
            come la casa in vendita e' pubblicita' ingannevole, e a rispondere e'
            l'agenzia, non noi.

            La frase sul tour compare solo col video, perche' e' col video che
            nasce l'equivoco: una grafica astratta nessuno la prende per una
            stanza, una ripresa in movimento si'. E soprattutto un prompt puo'
            aver chiesto proprio "video degli interni": chi lo ha scritto
            crede di aver ottenuto quello, ed e' l'unico momento in cui
            possiamo dirgli che no, e cosa fare invece.
          */}
          {media.some((url) => generatiDaAi.includes(url)) && (
            <div className="mt-2 rounded-lg border border-status-pending/35 bg-status-pending/5 px-3 py-2 text-xs leading-relaxed text-foreground">
              <p>
                I media prodotti automaticamente sono{" "}
                <strong>contenuti concettuali di corredo</strong> e non raffigurano
                l&apos;immobile, nemmeno quando l&apos;hai chiesto nel prompt: la grafica la
                genera l&apos;AI, il video viene da un archivio di riprese libere e mostra un
                luogo reale che non è quello dell&apos;annuncio.
              </p>
              {media.some(
                (url) => generatiDaAi.includes(url) && kindFromExtension(url) === "video"
              ) && (
                <p className="mt-1.5">
                  <strong>Non è un tour dell&apos;immobile.</strong> Per far vedere le stanze
                  vere serve un video girato lì dentro: caricalo da &laquo;Carica dal
                  computer&raquo;.
                </p>
              )}
              <p className="mt-1.5">
                Le foto vere stanno in &laquo;Seleziona da Portafoglio Immobili&raquo;. Un post
                che fa passare un altro luogo per la casa in vendita è pubblicità ingannevole, e
                a rispondere è l&apos;agenzia.
              </p>
            </div>
          )}
        </>
      )}

      {mostraPortafoglio && (
        <PortfolioPicker
          rimanenti={rimanenti}
          giaScelte={media}
          onPick={(urls) => onChange([...media, ...urls])}
          onClose={() => setMostraPortafoglio(false)}
        />
      )}
    </div>
  );
}

/**
 * Sceglie fra le foto già caricate sulle schede immobile.
 *
 * Mostra solo gli immobili che hanno almeno una foto: elencare schede vuote
 * farebbe scorrere l'intero portafoglio per scoprire che non c'è niente da
 * prendere.
 */
function PortfolioPicker({
  rimanenti,
  giaScelte,
  onPick,
  onClose,
}: {
  rimanenti: number;
  giaScelte: string[];
  onPick: (urls: string[]) => void;
  onClose: () => void;
}) {
  const [immobili, setImmobili] = useState<ImmobileConFoto[] | null>(null);
  const [selezione, setSelezione] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => {
        const elenco = (dati?.properties ?? []) as ImmobileConFoto[];
        setImmobili(
          Array.isArray(elenco) ? elenco.filter((p) => (p.images?.length ?? 0) > 0) : []
        );
      })
      .catch(() => setImmobili([]));
  }, []);

  function commuta(url: string) {
    setSelezione((corrente) =>
      corrente.includes(url)
        ? corrente.filter((u) => u !== url)
        : corrente.length < rimanenti
          ? [...corrente, url]
          : corrente
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scegli le foto dal portafoglio"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Foto dal Portafoglio Immobili</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {immobili === null ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Caricamento…
          </p>
        ) : immobili.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nessun immobile in portafoglio ha fotografie. Caricale dalla scheda dell&apos;immobile,
            oppure usa &laquo;Carica dal computer&raquo;.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {immobili.map((immobile) => (
              <div key={immobile.id}>
                <p className="text-xs font-semibold text-foreground">
                  {immobile.reference} &middot; {immobile.title}
                </p>
                <ul className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {immobile.images.map((url) => {
                    const scelta = selezione.includes(url);
                    const gia = giaScelte.includes(url);
                    return (
                      <li key={url}>
                        <button
                          type="button"
                          onClick={() => !gia && commuta(url)}
                          disabled={gia}
                          aria-pressed={scelta}
                          className={cn(
                            "relative block w-full overflow-hidden rounded-lg border-2 transition-all duration-200",
                            gia
                              ? "cursor-not-allowed border-border opacity-40"
                              : scelta
                                ? "border-primary"
                                : "border-transparent hover:border-primary/40"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                          {gia && (
                            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] text-white">
                              già allegata
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selezione.length} selezionate &middot; puoi aggiungerne ancora {rimanenti}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline text-xs">
              Annulla
            </button>
            <button
              type="button"
              disabled={selezione.length === 0}
              onClick={() => {
                onPick(selezione);
                onClose();
              }}
              className="btn-brand text-xs disabled:opacity-50"
            >
              Aggiungi al post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
