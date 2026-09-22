"use client";

import { Suspense, useState } from "react";
import { MessageCircle, Sparkles, Wand2 } from "lucide-react";
import { InfoTip } from "@/components/shared/info-tip";
import { ModuleWithHistory } from "@/components/history/module-with-history";
import { SocialGenerator } from "@/components/social/social-generator";
import { CommentsPanel } from "@/components/social/comments-panel";
import { SocialConnectionBadge } from "@/components/social/publish-button";
import { cn } from "@/lib/utils";

type Scheda = "genera" | "commenti";

const SCHEDE: { id: Scheda; label: string; icon: typeof Wand2 }[] = [
  { id: "genera", label: "Genera contenuti", icon: Wand2 },
  { id: "commenti", label: "Commenti Social", icon: MessageCircle },
];

/*
 * "use client": l'empty state passa `icon: Sparkles` (una funzione) e
 * `onSecondary` (una funzione) a `ModuleWithHistory`, un Client Component.
 * Nessun lavoro server-only c'era prima qui (niente `auth()`, niente
 * `metadata`), quindi il passaggio non toglie nulla.
 */
export default function SocialPage() {
  const [scheda, setScheda] = useState<Scheda>("genera");
  /*
   * I commenti si montano alla prima apertura e poi restano.
   *
   * Montarli subito farebbe partire una chiamata a Meta a ogni visita della
   * pagina, anche a chi viene solo a generare un annuncio. Smontarli al
   * cambio scheda farebbe ricaricare tutto ogni volta che si torna, e
   * perderebbe la risposta a metà scrittura: stessa scelta già fatta per la
   * Cronologia dentro ModuleWithHistory.
   */
  const [commentiMontati, setCommentiMontati] = useState(false);

  function apri(prossima: Scheda) {
    if (prossima === "commenti") setCommentiMontati(true);
    setScheda(prossima);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
            Social &amp; Annunci
            <InfoTip label="Scrivere a mano l'annuncio per i portali, il post social e lo script del Reel per lo stesso immobile è lo stesso lavoro fatto tre volte. Qui è una generazione sola: tre formati, coerenti fra loro, da un'unica fonte." />
          </h1>
          <p className="text-sm text-muted-foreground">
            Parti da un immobile che hai già, da un annuncio esistente, da una tua istruzione o
            da zero: ottieni il testo per i portali, il post social e lo script del video Reel.
          </p>
        </div>
        {/* Discreto e in alto: dice se si potra' pubblicare direttamente,
            prima che l'agente generi qualcosa e lo scopra alla fine. */}
        <SocialConnectionBadge />
      </div>

      {/* Scorrevole in orizzontale sul telefono, come le schede delle
          Impostazioni: due etichette lunghe su uno schermo stretto non ci
          stanno affiancate, e andare a capo spezzerebbe la riga dei pulsanti. */}
      <div
        role="tablist"
        aria-label="Sezioni di Social e Annunci"
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:snap-none sm:px-0"
      >
        {SCHEDE.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`social-tab-${id}`}
            aria-selected={scheda === id}
            aria-controls={`social-panel-${id}`}
            onClick={() => apri(id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors md:mouse:min-h-0",
              scheda === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div
        id="social-panel-genera"
        role="tabpanel"
        aria-labelledby="social-tab-genera"
        hidden={scheda !== "genera"}
      >
        <ModuleWithHistory
          kind="SOCIAL"
          workLabel="Genera"
          emptyHint="Gli annunci e i post che generi restano qui, pronti da ricopiare."
          emptyState={{
            icon: Sparkles,
            title: "Nessun annuncio generato",
            description:
              "Da un link, da un immobile già in portafoglio, da una tua istruzione o da zero: l'AI scrive il testo per i portali, il post per Facebook e Instagram e lo script del Reel in un clic.",
            primaryLabel: "Genera il tuo primo annuncio",
            secondaryLabel: "Prova con un esempio",
            /*
             * Navigazione VERA (`window.location`), non il router client.
             *
             * SocialGenerator legge `?fonte=` e `?demo=` solo all'apertura —
             * un `useState` lazy, non un effetto che segue ogni cambio — e
             * questa scheda e' gia' montata (la Cronologia e' solo nascosta,
             * non smontata: vedi ModuleWithHistory). Una navigazione soffice
             * sulla stessa rotta cambierebbe l'URL senza rimontare nulla, e il
             * prompt di esempio non comparirebbe mai.
             */
            onSecondary: () => {
              window.location.href = "/social?fonte=prompt&demo=1";
            },
          }}
        >
          {/* SocialGenerator legge `?fonte=` e `?demo=` dalla query per aprire
              una scheda precisa quando si arriva da un link diretto: serve un
              confine Suspense, stesso pattern già in uso per PlanGrid in
              Impostazioni. */}
          <Suspense>
            <SocialGenerator />
          </Suspense>
        </ModuleWithHistory>
      </div>

      {commentiMontati && (
        <div
          id="social-panel-commenti"
          role="tabpanel"
          aria-labelledby="social-tab-commenti"
          hidden={scheda !== "commenti"}
        >
          <CommentsPanel />
        </div>
      )}
    </div>
  );
}
