"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { ShareActions } from "@/components/shared/share-actions";
import { ListingImport, type ImportedListingView } from "@/components/social/listing-import";
import { PropertyExportPanel } from "@/components/social/property-export-panel";
import { AiDisclaimer } from "@/components/shared/ai-disclaimer";
import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { TONE_LABELS, TONE_OPTIONS, type SocialContent, type ToneOfVoice } from "@/lib/ai/social-schema";
import { LISTING_PROGRESS, ProgressMessages } from "@/components/shared/progress-messages";
import { cn } from "@/lib/utils";

type TabId = "portal" | "social" | "reel";

const TABS: { id: TabId; label: string }[] = [
  { id: "portal", label: "Annuncio Portali" },
  { id: "social", label: "Post Social" },
  { id: "reel", label: "Script Video Reel/TikTok" },
];

function reelToPlainText(reel: SocialContent["reelScript"]): string {
  const scenes = reel.scenes
    .map((scene) => `[${scene.timeRange}] ${scene.voiceover}\n  Ripresa: ${scene.visual}`)
    .join("\n\n");
  return `HOOK: ${reel.hook}\n\n${scenes}\n\nCALL TO ACTION: ${reel.callToAction}`;
}

/** Il disclaimer deve viaggiare col testo copiato, non restare solo a video:
 *  è ciò che l'agente incolla su Instagram o nel portale (CLAUDE.md §5). */
function withDisclaimer(text: string): string {
  return `${text}\n\n---\n${AI_DISCLAIMER_SHORT}`;
}

export function SocialGenerator() {
  const [propertyTitle, setPropertyTitle] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  /**
   * Il testo incollato vive qui e non dentro `ListingImport` perché serve a
   * due pulsanti: "Compila i campi", che lo trasforma nei campi qui sotto, e
   * "Genera", che può inviarlo direttamente all'AI. Le due strade sono
   * alternative, non in sequenza.
   */
  const [rawText, setRawText] = useState("");
  const [tone, setTone] = useState<ToneOfVoice>("professionale");
  const [content, setContent] = useState<SocialContent | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("portal");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedPlan, setLockedPlan] = useState<string | null>(null);
  /** Annuncio importato da link, se presente: precompila i campi per i portali. */
  const [imported, setImported] = useState<ImportedListingView | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Si manda ciò che c'è: i campi se compilati, il testo grezzo se
        // l'agente ha saltato la compilazione, entrambi se ha corretto i
        // campi partendo da un testo — in quel caso il server dà la
        // precedenza ai campi rivisti.
        body: JSON.stringify({
          ...(propertyTitle.trim() ? { propertyTitle: propertyTitle.trim() } : {}),
          ...(keyPoints.trim() ? { keyPoints: keyPoints.trim() } : {}),
          ...(rawText.trim() ? { rawText: rawText.trim() } : {}),
          tone,
        }),
      });

      if (response.status === 402) {
        const body = await response.json();
        setLockedPlan(body.requiredPlan ?? "Enterprise");
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Generazione non riuscita. Riprova.");
        return;
      }

      setContent(body.content as SocialContent);
      setActiveTab("portal");
    } catch {
      setError("Errore di rete durante la generazione.");
    } finally {
      setIsGenerating(false);
    }
  }

  // Basta UNA delle due sorgenti: i campi compilati a mano oppure il testo
  // incollato. Le stesse soglie del server (lib/ai/social-schema.ts), così il
  // pulsante non si accende su un payload che verrebbe poi rifiutato.
  const hasFields = propertyTitle.trim().length >= 3 && keyPoints.trim().length >= 10;
  const hasRawText = rawText.trim().length >= 30;
  const canGenerate = hasFields || hasRawText;

  return (
    <div className="space-y-6">
      <ListingImport
        rawText={rawText}
        onRawTextChange={setRawText}
        onImported={(listing) => {
          setPropertyTitle(listing.propertyTitle);
          setKeyPoints(listing.keyPoints);
          setImported(listing);
          setError(null);
        }}
        onLocked={() => setLockedPlan("Enterprise")}
      />

      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">Dati dell&apos;immobile</h2>
        {/* Chiarisce che questa sezione è una delle due strade, non un
            passaggio obbligato dopo la casella di testo qui sopra. */}
        <p className="mt-1 text-sm text-muted-foreground">
          Compilali a mano, oppure lasciali vuoti e genera direttamente dal testo incollato sopra.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="property-title" className="text-xs font-medium text-muted-foreground">
              Titolo Immobile
            </label>
            <input
              id="property-title"
              type="text"
              value={propertyTitle}
              onChange={(event) => setPropertyTitle(event.target.value)}
              placeholder="Trilocale ristrutturato in Via Roma"
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label htmlFor="key-points" className="text-xs font-medium text-muted-foreground">
              Punti chiave
            </label>
            <textarea
              id="key-points"
              value={keyPoints}
              onChange={(event) => setKeyPoints(event.target.value)}
              rows={4}
              placeholder="Trilocale, 80mq, ristrutturato 2023, zona centrale, 250.000€, balcone abitabile, terzo piano con ascensore, classe energetica C"
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Scrivi liberamente: l&apos;AI userà solo i dati che inserisci, senza inventarne altri.
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Tono di voce</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTone(option)}
                  aria-pressed={tone === option}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    tone === option
                      ? "bg-brand-gradient text-white shadow-sm"
                      : "border border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {TONE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-blocked">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? "Generazione in corso…" : "Genera annuncio, post e Reel"}
          </button>

          {/* I messaggi ruotano sotto il pulsante e non dentro: cambiando
              lunghezza farebbero saltare la larghezza del bottone a ogni giro. */}
          {isGenerating && <ProgressMessages messages={LISTING_PROGRESS} className="block" />}
        </div>
      </section>

      {content && (
        <section className="rounded-xl border border-border bg-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground">Output Generati</h2>

          <div
            role="tablist"
            aria-label="Formati generati"
            className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  activeTab === tab.id
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {activeTab === "portal" && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {content.portalListing.title}
                  </h3>
                  <ShareActions
                    text={withDisclaimer(`${content.portalListing.title}\n\n${content.portalListing.body}`)}
                    copyLabel="Copia Testo"
                  />
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {content.portalListing.body}
                </p>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Parole chiave SEO locali</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {content.portalListing.seoKeywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "social" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <ShareActions
                    text={withDisclaimer(
                      `${content.socialPost.caption}\n\n${content.socialPost.hashtags
                        .map((tag) => `#${tag}`)
                        .join(" ")}`
                    )}
                    copyLabel="Copia Testo"
                  />
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {content.socialPost.caption}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {content.socialPost.hashtags.map((tag) => (
                    <span key={tag} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "reel" && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Hook (primi 3 secondi)</p>
                    <p className="text-sm font-semibold text-foreground">{content.reelScript.hook}</p>
                  </div>
                  <ShareActions
                    text={withDisclaimer(reelToPlainText(content.reelScript))}
                    copyLabel="Copia Testo"
                  />
                </div>

                  {/* Storyboard impilato su mobile: le tre colonne a 520px
                      minimi costringevano a scorrere di lato proprio mentre si
                      legge il copione, che è quando serve vederlo tutto. */}
                  <ul className="space-y-2 md:hidden">
                    {content.reelScript.scenes.map((scene, index) => (
                      <li key={index} className="rounded-lg border border-border p-3">
                        <p className="text-xs font-semibold text-primary">{scene.timeRange}</p>
                        <p className="mt-1 text-sm text-foreground">{scene.voiceover}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{scene.visual}</p>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Tempo</th>
                        <th className="px-3 py-2 font-medium">Voce dell&apos;agente</th>
                        <th className="px-3 py-2 font-medium">Indicazione di ripresa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {content.reelScript.scenes.map((scene, index) => (
                        <tr key={index} className="border-b border-border last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                            {scene.timeRange}
                          </td>
                          <td className="px-3 py-2 text-foreground">{scene.voiceover}</td>
                          <td className="px-3 py-2 text-muted-foreground">{scene.visual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">Call to action</p>
                  <p className="text-sm text-foreground">{content.reelScript.callToAction}</p>
                </div>
              </div>
            )}
          </div>

          <AiDisclaimer className="mt-5" />
        </section>
      )}

      {/* Compare a valle della generazione: la descrizione del feed è il testo
          per i portali appena prodotto dall'AI. */}
      {content && (
        <PropertyExportPanel
          propertyTitle={propertyTitle}
          description={content.portalListing.body}
          imported={imported}
        />
      )}

      {lockedPlan && (
        <UpgradeLimitModal
          feature="social"
          reason="not_in_plan"
          requiredPlan={lockedPlan}
          onNavigateAway={() => setLockedPlan(null)}
        />
      )}
    </div>
  );
}
