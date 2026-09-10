import { Suspense } from "react";
import { auth } from "@/auth";
import { RadarBoard } from "@/components/radar/radar-board";
import { InfoTip } from "@/components/shared/info-tip";

/**
 * Il nome dell'agenzia si legge qui e scende come proprieta': i componenti
 * client non hanno accesso alla sessione, e il copy da pubblicare esce
 * firmato — senza nome finirebbe con una firma vuota sotto un post.
 */
export default async function RadarPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
          Analisi &amp; Due Diligence Aste
          <InfoTip label="Una perizia giudiziaria sta fra le trenta e le centoventi pagine. Leggerla tutta per trovare occupazione, difformità e vincoli è il lavoro che di solito si rimanda; qui è un caricamento, e i conti sul margine li fa il simulatore." />
        </h1>
        {/* Il nome dice cosa fa il modulo, non come si chiamava.

            "Radar" faceva pensare a un programma che gira per il web a cercare
            aste da solo: chi si aspettava quello apriva la pagina, non trovava
            nessun risultato precaricato e concludeva che fosse rotta. Qui non
            si cerca: si analizza un lotto che l'agente ha gia' trovato. */}
        <p className="text-sm text-muted-foreground">
          Carica la perizia di un lotto e ottieni stato occupazionale, difformità, vincoli, costi di
          sanatoria e i conti sul margine. Non cerca le aste al posto tuo: analizza quelle che porti
          tu, e ti dice se vale la pena rilanciare.
        </p>
      </div>

      {/* RadarBoard legge `?nuovo=perizia` per aprire subito la dropzone
          quando si arriva da un link diretto: serve un confine Suspense. */}
      <Suspense>
        <RadarBoard nomeAgenzia={session?.user?.agencyName ?? "la tua agenzia"} />
      </Suspense>
    </div>
  );
}
