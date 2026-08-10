"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

/**
 * Accordion delle domande frequenti.
 *
 * Le risposte sono sempre nel DOM e vengono solo nascoste visivamente: se
 * fossero smontate quando chiuse, i crawler che non eseguono le interazioni
 * non le troverebbero, e il markup FAQPage non corrisponderebbe al contenuto
 * visibile.
 */
export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-20 border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Blocco di testa centrato e con larghezza propria, più stretta
            dell'elenco: il titolo resta compatto sopra le schede invece di
            allargarsi fino ai bordi della colonna. */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Domande frequenti
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Le risposte alle obiezioni che ci fanno più spesso
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Quello che gli agenti immobiliari ci chiedono prima di attivare la prova gratuita.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;

            return (
              <div
                key={item.question}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card transition-all duration-200",
                  isOpen ? "border-primary/40 shadow-sm" : "border-border"
                )}
              >
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-all duration-200 hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium text-foreground">{item.question}</span>

                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-180 text-primary"
                      )}
                    />
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="px-5 pb-4"
                >
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm">
          <Link href="/register" className="font-medium text-primary hover:underline">
            Inizia la prova gratuita
          </Link>
        </p>
      </div>
    </section>
  );
}
