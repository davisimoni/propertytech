"use client";

import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { ModuleWithHistory } from "@/components/history/module-with-history";
import { SocialGenerator } from "@/components/social/social-generator";
import { SocialConnectionBadge } from "@/components/social/publish-button";

/*
 * "use client": l'empty state passa `icon: Sparkles` (una funzione) e
 * `onSecondary` (una funzione) a `ModuleWithHistory`, un Client Component.
 * Nessun lavoro server-only c'era prima qui (niente `auth()`, niente
 * `metadata`), quindi il passaggio non toglie nulla.
 */
export default function SocialPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Social &amp; Annunci</h1>
          <p className="text-sm text-muted-foreground">
            Parti da un immobile che hai già, da un annuncio esistente, da una tua istruzione o
            da zero: ottieni il testo per i portali, il post social e lo script del video Reel.
          </p>
        </div>
        {/* Discreto e in alto: dice se si potra' pubblicare direttamente,
            prima che l'agente generi qualcosa e lo scopra alla fine. */}
        <SocialConnectionBadge />
      </div>

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
  );
}
