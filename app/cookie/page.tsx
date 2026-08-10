import type { Metadata } from "next";
import { auth } from "@/auth";
import { LegalList, LegalPage, LegalSection, LEGAL_ENTITY } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Cookie Policy — ${BRAND.name}`,
  description: "Quali cookie e tecnologie simili utilizza PropertyTech e come gestirli.",
};

export default async function CookiePage() {
  const session = await auth();

  return (
    <LegalPage
      isLoggedIn={Boolean(session?.user)}
      title="Cookie Policy"
      intro={`${BRAND.name} usa il numero minimo di cookie necessario a far funzionare il servizio. Non utilizziamo cookie pubblicitari né di profilazione, e non condividiamo dati con circuiti pubblicitari.`}
    >
      <LegalSection title="1. Cosa sono i cookie">
        <p>
          I cookie sono piccoli file salvati dal browser durante la navigazione. Insieme ad essi
          questa pagina considera anche tecnologie equivalenti, come il <em>local storage</em>, che
          salvano dati sul tuo dispositivo con finalità analoghe.
        </p>
      </LegalSection>

      <LegalSection title="2. Cookie tecnici necessari">
        <p>
          Sono indispensabili per erogare il servizio e non richiedono consenso preventivo ai sensi
          dell&apos;art. 122 del Codice Privacy.
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Cookie di sessione</strong> — mantengono
              l&apos;accesso autenticato tra una pagina e l&apos;altra. Senza di essi dovresti
              inserire le credenziali a ogni schermata. Sono gestiti dalla libreria di autenticazione
              e scadono con la sessione o alla disconnessione.
            </>,
            <>
              <strong className="text-foreground">Cookie di sicurezza</strong> — proteggono i form da
              richieste fraudolente (CSRF) e presidiano il flusso di accesso, incluso quello tramite
              Google.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Preferenze salvate sul tuo dispositivo">
        <p>
          Alcune impostazioni sono conservate nel local storage del browser, non trasmesse ai nostri
          server e non usate per identificarti:
        </p>
        <LegalList
          items={[
            "Tema chiaro o scuro selezionato dall'interfaccia.",
            "Chiusura della guida introduttiva in dashboard, per non riproporla a ogni accesso.",
          ]}
        />
        <p>Puoi rimuoverle in qualsiasi momento svuotando i dati del sito dal tuo browser.</p>
      </LegalSection>

      <LegalSection title="4. Cookie di profilazione e pubblicitari">
        <p>
          Non ne utilizziamo. Non sono presenti pixel di tracciamento, retargeting pubblicitario o
          strumenti di analisi comportamentale di terze parti. Per questo motivo non compare alcun
          banner di consenso: non c&apos;è nulla per cui chiederlo.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookie di terze parti">
        <p>
          Durante l&apos;accesso tramite Google, il provider può impostare propri cookie sui suoi
          domini per gestire l&apos;autenticazione. Analogamente, la procedura di pagamento è servita
          da Stripe, che applica i propri cookie tecnici e antifrode. Tali cookie sono regolati dalle
          rispettive informative, sulle quali non abbiamo controllo.
        </p>
      </LegalSection>

      <LegalSection title="6. Come gestire i cookie">
        <p>
          Puoi bloccare o eliminare i cookie dalle impostazioni del tuo browser. Tieni presente che
          disattivare i cookie tecnici impedisce di restare autenticati e rende il servizio
          inutilizzabile.
        </p>
      </LegalSection>

      <LegalSection title="7. Aggiornamenti">
        <p>
          Se in futuro introdurremo strumenti di analisi o altre tecnologie soggette a consenso,
          questa pagina sarà aggiornata e verrà attivato un banner per la raccolta del consenso prima
          della loro installazione. Per domande: {LEGAL_ENTITY.email}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
