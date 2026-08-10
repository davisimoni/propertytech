/**
 * Service worker di PropertyTech.
 *
 * DELIBERATAMENTE CONSERVATIVO, ed è la decisione più importante di questo file.
 *
 * La piattaforma è multi-tenant e ogni schermata mostra dati di clienti reali:
 * nomi, telefoni, codici fiscali estratti dalle visure. Un service worker che
 * mettesse in cache le risposte delle API o le pagine autenticate creerebbe due
 * problemi seri:
 *
 *  1. su un telefono condiviso, o dopo un cambio account, la cache potrebbe
 *     restituire i dati dell'agenzia precedente — una violazione
 *     dell'isolamento fra tenant (CLAUDE.md §5) che nessun controllo lato
 *     server potrebbe intercettare, perché la richiesta al server non parte;
 *  2. un agente vedrebbe una pipeline vecchia senza accorgersene, e su un lead
 *     appena arrivato la differenza fra "adesso" e "dieci minuti fa" è tutta.
 *
 * Perciò qui si mette in cache **solo** ciò che è immutabile e pubblico: i file
 * con hash in `/_next/static/`, gli asset statici e poco altro. Tutto il resto
 * va in rete, sempre.
 */

/**
 * Alzare questa versione svuota le cache precedenti all'attivazione.
 * Va fatto ogni volta che cambia un asset servito con lo stesso nome — le
 * icone, per esempio: senza, chi ha già visitato continuerebbe a vedere quella
 * vecchia perché gli asset sono serviti dalla cache prima che dalla rete.
 */
const VERSION = "v3";
const STATIC_CACHE = `pt-static-${VERSION}`;

/** Risorse che rendono utile l'apertura offline: solo pagine pubbliche. */
const PRECACHE = ["/offline", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // `catch`: se una risorsa manca, l'installazione non deve fallire e
      // lasciare l'app senza service worker.
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/** Vero solo per ciò che è immutabile e non contiene dati di nessuno. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;

  // File con hash nel nome: cambiano nome a ogni build, quindi non diventano
  // mai obsoleti.
  if (url.pathname.startsWith("/_next/static/")) return true;

  return /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET: mettere in cache una POST non ha senso e le richieste di
  // modifica devono sempre raggiungere il server.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Le API non passano mai dalla cache: è lì che vivono i dati dei tenant.
  if (url.pathname.startsWith("/api/")) return;

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            // Solo le risposte complete e valide finiscono in cache: una 206 o
            // una risposta opaca salvata renderebbe la pagina rotta al
            // caricamento successivo.
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigazione: sempre dalla rete. Senza connessione si mostra la pagina di
  // cortesia, che non contiene dati di nessuno.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match("/offline");
        if (offline) return offline;

        // Se anche il precaricamento è fallito — installazione interrotta,
        // spazio esaurito — `caches.match` restituisce `undefined`, e passarlo
        // a `respondWith` fa fallire la richiesta con l'errore di rete del
        // browser. Meglio una pagina minima nostra che quella di Chrome.
        return new Response(
          `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sei offline</title>
<style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
font-family:system-ui,-apple-system,sans-serif;background:#F8FAFC;color:#031735;padding:24px}
div{max-width:20rem;text-align:center}h1{font-size:1.125rem;margin:0 0 .5rem}
p{font-size:.875rem;line-height:1.5;color:#475569;margin:0}</style></head>
<body><div><h1>Sei offline</h1>
<p>Non riusciamo a raggiungere PropertyTech. Controlla la connessione: i tuoi lead sono al sicuro
e li ritrovi appena torni online.</p></div></body></html>`,
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      })
    );
  }
});

/**
 * Svuotamento della cache su richiesta dell'app (al logout).
 *
 * Anche se in cache finiscono solo asset statici, uscire dall'account deve
 * lasciare il dispositivo pulito: è ciò che un'agenzia si aspetta quando
 * presta il telefono a un collaboratore.
 */
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});
