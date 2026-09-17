import type { Metadata } from "next";
import { auth } from "@/auth";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Cancellazione dei dati",
  description:
    "Come scollegare PropertyTech da Facebook e Instagram e come richiedere la cancellazione dei dati del tuo account.",
  path: "/data-deletion",
});

/**
 * Istruzioni pubbliche per la cancellazione dei dati.
 *
 * Meta chiede un indirizzo pubblico che spieghi come cancellare i dati
 * ottenuti tramite Facebook; serve anche all'esercizio del diritto di
 * cancellazione (art. 17 GDPR), che riguarda molto più dei soli dati Facebook.
 * Le due cose sono tenute distinte perché cancellare il collegamento social e
 * cancellare l'account sono operazioni diverse, con conseguenze diverse.
 */
export default async function DataDeletionPage() {
  const session = await auth();

  return (
    <LegalPage
      isLoggedIn={Boolean(session?.user)}
      title="Cancellazione dei dati"
      lastUpdated="17 settembre 2026"
      intro={`Qui trovi come rimuovere i dati che ${BRAND.name} ha ottenuto da Facebook e Instagram, e come chiedere la cancellazione completa dell'account e di tutti i dati dell'agenzia.`}
    >
      <LegalSection title="1. Dati ottenuti da Facebook e Instagram">
        <p>
          Collegando una Pagina Facebook conserviamo solo ciò che serve a pubblicare per conto
          dell&apos;agenzia:
        </p>
        <LegalList
          items={[
            "Identificativo e nome della Pagina Facebook.",
            "Identificativo e nome utente del profilo Instagram Business collegato alla Pagina, se presente.",
            "Il token di pubblicazione della Pagina, conservato cifrato.",
            "L'identificativo dell'utente Facebook che ha autorizzato il collegamento.",
          ]}
        />
        <p>
          Non leggiamo i messaggi della Pagina, non scarichiamo la lista dei follower e non
          accediamo ai dati personali delle persone che interagiscono con i post.
        </p>
      </LegalSection>

      <LegalSection title="2. Come rimuovere questi dati">
        <p>
          <strong className="text-foreground">Dalla piattaforma.</strong> Accedi a{" "}
          {BRAND.name}, apri Impostazioni, scheda Integrazioni &amp; CRM, e premi
          &quot;Scollega&quot; nel riquadro dei social. Il collegamento, il profilo Instagram e il
          token vengono eliminati subito.
        </p>
        <p>
          <strong className="text-foreground">Da Facebook.</strong> Apri Facebook, vai in
          Impostazioni e privacy, Impostazioni, App e siti web, seleziona {BRAND.name} e premi
          Rimuovi. Facebook ci invia una richiesta di cancellazione e i dati indicati al punto 1
          vengono eliminati automaticamente. Al termine Facebook ti mostra un codice di conferma e
          un link dove verificarne lo stato.
        </p>
      </LegalSection>

      <LegalSection title="3. Cancellazione dell'account e di tutti i dati">
        <p>
          La rimozione del collegamento social non cancella l&apos;account {BRAND.name} né i dati
          dell&apos;agenzia (contatti, immobili, documenti, conversazioni). Per quelli scrivi a{" "}
          <a href={`mailto:${BRAND.email}`} className="text-primary hover:underline">
            {BRAND.email}
          </a>{" "}
          dall&apos;indirizzo email dell&apos;account, indicando il nome dell&apos;agenzia.
        </p>
        <LegalList
          items={[
            "Rispondiamo entro 30 giorni, come previsto dall'art. 12 GDPR.",
            "La cancellazione riguarda l'intero account: lead, immobili, documenti, report e conversazioni.",
            "Restano solo i dati che siamo tenuti a conservare per legge, come i documenti fiscali relativi alle fatture emesse, per il periodo previsto dalla normativa.",
            "Prima della cancellazione puoi esportare i tuoi dati dalla piattaforma: i lead in CSV dalla pipeline e gli immobili dal portafoglio.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Altri diritti">
        <p>
          Oltre alla cancellazione puoi chiedere accesso, rettifica, limitazione, portabilità e
          opposizione al trattamento. Le modalità sono descritte nell&apos;informativa privacy, che
          indica anche il titolare del trattamento e il diritto di reclamo al Garante per la
          protezione dei dati personali.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
