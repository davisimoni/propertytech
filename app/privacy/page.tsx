import type { Metadata } from "next";
import { auth } from "@/auth";
import { LegalList, LegalPage, LegalSection, LEGAL_ENTITY } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Privacy Policy — ${BRAND.name}`,
  description:
    "Come PropertyTech tratta i dati personali di agenzie immobiliari, contatti e documenti catastali, ai sensi del GDPR.",
};

export default async function PrivacyPage() {
  const session = await auth();

  return (
    <LegalPage
      isLoggedIn={Boolean(session?.user)}
      title="Informativa Privacy"
      intro={`Questa informativa descrive come ${BRAND.name} tratta i dati personali nell'ambito del servizio SaaS rivolto alle agenzie immobiliari, ai sensi del Regolamento (UE) 2016/679 (GDPR).`}
    >
      <LegalSection title="1. Titolare del trattamento">
        <p>
          Il titolare è {LEGAL_ENTITY.name}. Per esercitare i tuoi diritti o richiedere chiarimenti
          puoi scrivere a {LEGAL_ENTITY.email}.
        </p>
      </LegalSection>

      <LegalSection title="2. Due ruoli distinti: titolare e responsabile">
        <p>
          Il rapporto con i dati cambia a seconda di chi riguardano, ed è la distinzione più
          importante di questo documento:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Dati dell&apos;agenzia cliente</strong> (email,
              password, nome agenzia, dati di fatturazione): trattati da {BRAND.name} in qualità di{" "}
              <strong className="text-foreground">titolare</strong>.
            </>,
            <>
              <strong className="text-foreground">Dati caricati dall&apos;agenzia</strong> (contatti
              dei potenziali acquirenti, proprietari, documenti catastali, note vocali): trattati in
              qualità di <strong className="text-foreground">responsabile del trattamento</strong>{" "}
              per conto dell&apos;agenzia, che ne resta titolare. È l&apos;agenzia a dover disporre
              di una base giuridica valida verso i propri contatti.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Categorie di dati trattati">
        <LegalList
          items={[
            "Dati di account: email, password cifrata, nome dell'agenzia, piano attivo.",
            "Dati di contatto dei lead: nome, numero di telefono, portale di provenienza, immobile di interesse e contenuto delle conversazioni WhatsApp.",
            "Dati contenuti nei documenti caricati: nomi, cognomi, codici fiscali, quote di proprietà e riferimenti catastali estratti da visure, atti, planimetrie e APE.",
            "Note vocali post-visita e relative trascrizioni, che possono contenere dati di terzi (venditori e potenziali acquirenti).",
            "Dati di utilizzo: crediti consumati, log tecnici necessari alla sicurezza e alla diagnostica.",
          ]}
        />
        <p>
          Non trattiamo né conserviamo dati di carte di credito: i pagamenti sono gestiti
          integralmente da Stripe, che agisce come titolare autonomo per i dati di pagamento. Nei
          nostri sistemi restano solo identificativi opachi.
        </p>
      </LegalSection>

      <LegalSection title="4. Finalità e basi giuridiche">
        <LegalList
          items={[
            "Erogazione del servizio e gestione dell'account — esecuzione del contratto (art. 6.1.b GDPR).",
            "Fatturazione e adempimenti fiscali — obbligo legale (art. 6.1.c GDPR).",
            "Sicurezza della piattaforma, prevenzione degli abusi e diagnostica — legittimo interesse (art. 6.1.f GDPR).",
            "Trattamento dei dati dei lead e dei documenti — su istruzione documentata dell'agenzia cliente, in qualità di responsabile (art. 28 GDPR).",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Comunicazione automatizzata via WhatsApp">
        <p>
          Il primo messaggio inviato dall&apos;assistente a un nuovo contatto contiene sempre
          l&apos;informativa breve e l&apos;indicazione per l&apos;opt-out. Chi risponde{" "}
          <strong className="text-foreground">STOP</strong> viene immediatamente escluso da ogni
          comunicazione automatica successiva, e l&apos;esclusione resta registrata in modo
          permanente per quel contatto: nemmeno una nuova richiesta proveniente dai portali riattiva
          l&apos;invio.
        </p>
      </LegalSection>

      <LegalSection title="6. Note vocali e trascrizione dei report post-visita">
        <p>
          Le note vocali registrate dall&apos;agente dopo una visita sono trattate esclusivamente
          per convertire il parlato in testo e generare il report destinato al proprietario
          dell&apos;immobile.
        </p>
        <p>
          <strong className="text-foreground">
            Il file audio non viene mai salvato nei nostri archivi:
          </strong>{" "}
          resta in memoria per il tempo tecnicamente necessario alla trascrizione e viene poi
          scartato. Di quell&apos;elaborazione conserviamo il solo testo trascritto e il report che
          ne deriva, per il tempo in cui l&apos;agenzia mantiene attivo il proprio account.
        </p>
        <p>
          La conversione è affidata a un fornitore esterno che agisce come sub-responsabile del
          trattamento, vincolato da accordo ai sensi dell&apos;<strong className="text-foreground">art. 28 GDPR</strong>{" "}
          a trattare l&apos;audio unicamente per eseguire la trascrizione su nostra istruzione,
          senza riutilizzarlo per finalità proprie. Il trattamento è limitato a quanto necessario e
          al tempo minimo indispensabile, secondo i principi di minimizzazione e di limitazione
          della conservazione (art. 5.1.c ed e GDPR).
        </p>
        <p>
          Le registrazioni possono contenere dati di persone non presenti al momento della
          registrazione — proprietari, potenziali acquirenti, terzi citati dall&apos;agente.
          L&apos;agenzia, che di questi dati è titolare, deve informarli e disporre di una base
          giuridica valida prima di utilizzare la funzione.
        </p>
      </LegalSection>

      <LegalSection title="7. Conservazione dei dati">
        <LegalList
          items={[
            "Dati di account: per la durata del rapporto contrattuale e per i termini di legge successivi alla chiusura.",
            "Lead e conversazioni: finché l'agenzia mantiene attivo l'account o fino a cancellazione richiesta.",
            "Registrazioni audio delle note vocali: mai conservate. Resta il solo testo trascritto insieme al report generato (vedi sezione 6).",
            "Log tecnici: per il periodo necessario a garantire sicurezza e continuità del servizio.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Dove vengono trattati i dati">
        <p>
          L&apos;infrastruttura applicativa e il database sono collocati in{" "}
          <strong className="text-foreground">Unione Europea</strong>. Quando un fornitore tratta
          dati al di fuori dello Spazio Economico Europeo, il trasferimento avviene solo in presenza
          di garanzie adeguate ai sensi degli artt. 44 e seguenti del GDPR (clausole contrattuali
          standard o decisione di adeguatezza).
        </p>
      </LegalSection>

      <LegalSection title="9. Fornitori che trattano dati per nostro conto">
        <p>
          Ci avvaliamo di responsabili esterni per erogare il servizio, tra cui il fornitore di
          hosting e database, Stripe per i pagamenti, Meta (WhatsApp Cloud API) per la messaggistica,
          Anthropic per l&apos;elaborazione dei contenuti tramite modelli di intelligenza artificiale
          e, ove attivato, un fornitore di trascrizione vocale. L&apos;elenco aggiornato e completo è
          disponibile su richiesta scrivendo a {LEGAL_ENTITY.email}.
        </p>
      </LegalSection>

      <LegalSection title="10. Elaborazione tramite intelligenza artificiale">
        <p>
          I contenuti caricati vengono inviati a modelli di AI per l&apos;estrazione dei dati, la
          generazione dei testi e la redazione dei report. Il servizio non assume decisioni
          automatizzate che producano effetti giuridici sugli interessati: gli output sono proposte
          che l&apos;agente rivede e approva prima di ogni utilizzo.
        </p>
      </LegalSection>

      <LegalSection title="11. Isolamento tra agenzie">
        <p>
          Ogni agenzia accede esclusivamente ai propri dati. La separazione è applicata a livello di
          interrogazione al database su ogni richiesta, non solo tramite controlli
          nell&apos;interfaccia.
        </p>
      </LegalSection>

      <LegalSection title="12. I tuoi diritti">
        <p>
          Puoi esercitare i diritti previsti dagli artt. 15-22 GDPR: accesso, rettifica,
          cancellazione, limitazione, portabilità e opposizione. Se i dati riguardano un contatto
          gestito da un&apos;agenzia cliente, la richiesta va rivolta all&apos;agenzia, che ne è
          titolare; noi la supportiamo nell&apos;evasione. Hai inoltre diritto di proporre reclamo al
          Garante per la protezione dei dati personali.
        </p>
      </LegalSection>

      <LegalSection title="13. Modifiche">
        <p>
          Eventuali aggiornamenti sono pubblicati su questa pagina con l&apos;indicazione della data
          di revisione. Nel caso di modifiche sostanziali le agenzie clienti vengono avvisate via
          email.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
