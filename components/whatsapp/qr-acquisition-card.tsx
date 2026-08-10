"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Printer, QrCode } from "lucide-react";
import {
  buildWhatsAppQrLink,
  DEFAULT_QR_MESSAGE,
  MAX_QR_MESSAGE_LENGTH,
  QR_LINK_MESSAGES,
} from "@/lib/whatsapp/qr-link";
import type { WhatsAppConfigView } from "@/lib/whatsapp/view-types";

/**
 * QR di acquisizione notizie.
 *
 * Non serve a collegare il numero dell'agenzia — la Cloud API di Meta non
 * prevede l'abbinamento via QR — ma a farsi scrivere dai clienti: chi lo
 * inquadra apre WhatsApp sul numero dell'agenzia con il messaggio già scritto,
 * il bot risponde e la notizia entra in pipeline già qualificata.
 */
export function QrAcquisitionCard() {
  const [message, setMessage] = useState(DEFAULT_QR_MESSAGE);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // La card legge il numero da sé invece di riceverlo dal pannello di
  // connessione: resta indipendente, e il genitore la rimonta dopo un
  // collegamento riuscito per farle rileggere il dato.
  useEffect(() => {
    fetch("/api/whatsapp/config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: WhatsAppConfigView | null) => setPhoneNumber(data?.phoneNumber ?? null))
      .finally(() => setIsLoading(false));
  }, []);

  const link = useMemo(() => buildWhatsAppQrLink(phoneNumber, message), [phoneNumber, message]);

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // L'anteprima arriva dal server, che legge il numero dal database: il codice
  // mostrato è lo stesso che verrà scaricato e stampato.
  const previewSrc = `/api/whatsapp/qr?format=svg&message=${encodeURIComponent(message)}`;
  const downloadSrc = `/api/whatsapp/qr?format=png&message=${encodeURIComponent(message)}`;

  if (!link.ok) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="h-4 w-4 text-primary" />
          QR per acquisire notizie
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{QR_LINK_MESSAGES[link.reason]}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <QrCode className="h-4 w-4 text-primary" />
        QR per acquisire notizie
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Stampalo in vetrina, sui cartelli degli immobili o sui volantini. Chi lo inquadra apre
        WhatsApp sul tuo numero con il messaggio già scritto: l&apos;assistente risponde in pochi
        secondi e la notizia arriva in pipeline già qualificata.
      </p>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- l'SVG è
            generato al volo dalla nostra API e cambia a ogni modifica del
            messaggio: non è un asset ottimizzabile da next/image. */}
        <img
          src={previewSrc}
          alt={`QR code che apre WhatsApp sul numero ${link.phone}`}
          className="h-44 w-44 shrink-0 self-center rounded-lg border border-border bg-white p-2 sm:self-start"
        />

        <div className="min-w-0 flex-1">
          <label htmlFor="qr-message" className="text-xs font-medium text-muted-foreground">
            Messaggio precompilato
          </label>
          <textarea
            id="qr-message"
            rows={3}
            value={message}
            maxLength={MAX_QR_MESSAGE_LENGTH}
            onChange={(event) => setMessage(event.target.value)}
            className="input-field mt-1"
            aria-describedby="qr-message-hint"
          />
          <p id="qr-message-hint" className="mt-1 text-xs text-muted-foreground">
            È il testo che il cliente si trova già scritto. Se stampi il QR sul cartello di un
            immobile, aggiungi il riferimento: comparirà nella scheda della notizia.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <a href={downloadSrc} download className="btn-brand">
              <Download className="h-4 w-4" />
              Scarica PNG
            </a>
            <button type="button" onClick={() => window.print()} className="btn-outline">
              <Printer className="h-4 w-4" />
              Stampa
            </button>
          </div>

          <p className="mt-3 break-all text-xs text-muted-foreground">
            Destinazione: <span className="font-medium text-foreground">{link.url}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
