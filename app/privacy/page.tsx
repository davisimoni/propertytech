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
            <>
              <strong className="text-foreground">Cronologia delle conversazioni WhatsApp</strong> —
              finché l&apos;agenzia mantiene attivo l&apos;account. Eliminando un contatto dalla
              scheda, la conversazione viene cancellata insieme a lui, nello stesso istante e senza
              copie residue.
            </>,
            <>
              <strong className="text-foreground">Registrazioni audio</strong> — mai conservate. Il
              file viene trascritto e scartato; resta il solo testo (vedi sezione 6).
            </>,
            <>
              <strong className="text-foreground">Appuntamenti e promemoria</strong> — restano
              collegati al contatto. Cancellando il contatto, lo slot in agenda torna libero.
            </>,
            <>
              <strong className="text-foreground">Documenti del fascicolo</strong> — dieci anni, come
              impone l&apos;art. 31 del D.Lgs. 231/2007 ai soggetti obbligati. Il termine è calcolato
              all&apos;acquisizione e non blocca una richiesta di cancellazione: l&apos;agenzia resta
              titolare dei propri atti e decide.
            </>,
            <>
              <strong className="text-foreground">Link di recupero password</strong> — un&apos;ora, e
              utilizzabili una sola volta. Del link resta nel database la sola impronta
              crittografica, non ricostruibile.
            </>,
            <>
              <strong className="text-foreground">Dispositivi riconosciuti</strong> — per avvisarti
              di un accesso da un dispositivo nuovo conserviamo un&apos;impronta crittografica di
              browser e rete, non l&apos;indirizzo IP. L&apos;indirizzo viene troncato prima di
              essere trasformato in impronta: non è possibile risalire da essa al dispositivo o agli
              spostamenti di una persona.
            </>,
            "Log tecnici: per il periodo necessario a garantire sicurezza e continuità del servizio. Non registriamo il testo dei messaggi né il contenuto dei documenti; i numeri di telefono compaiono troncati.",
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

      <LegalSection title="9. Sub-responsabili: chi tratta i dati per nostro conto">
        <p>
          Per erogare il servizio ci avvaliamo dei fornitori elencati qui sotto, tutti nominati
          responsabili ai sensi dell&apos;art. 28 GDPR. L&apos;elenco è completo e aggiornato:
          quando cambia, l&apos;agenzia viene informata prima che il nuovo fornitore entri in
          servizio, con facoltà di opporsi.
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Vercel Inc.</strong> — hosting
              dell&apos;applicazione ed esecuzione delle funzioni. Le funzioni sono vincolate alla
              regione di Francoforte (<code className="text-foreground">fra1</code>): il calcolo
              avviene in UE. Il fornitore è statunitense e aderisce all&apos;EU-U.S. Data Privacy
              Framework; il trasferimento è inoltre coperto da clausole contrattuali standard.
            </>,
            <>
              <strong className="text-foreground">Supabase</strong> — database PostgreSQL che
              custodisce lead, immobili, documenti e conversazioni. Istanza collocata nella regione
              <code className="text-foreground"> eu-central-1</code> (Francoforte, Germania).
            </>,
            <>
              <strong className="text-foreground">Anthropic PBC</strong> — modelli di intelligenza
              artificiale per la qualificazione su WhatsApp, il filtro di pertinenza dei messaggi,
              l&apos;estrazione dei dati dai documenti, la generazione degli annunci e dei report
              post-visita. Fornitore statunitense, trasferimento coperto da clausole contrattuali
              standard. I contenuti non sono usati per addestrare modelli.
            </>,
            <>
              <strong className="text-foreground">Fornitore di trascrizione vocale</strong>{" "}
              (compatibile OpenAI Whisper, configurabile) — converte in testo le note vocali
              ricevute su WhatsApp e quelle dettate dall&apos;agente dopo una visita. Attivo solo se
              l&apos;agenzia ha configurato il servizio; senza configurazione le note vocali non
              vengono elaborate.
            </>,
            <>
              <strong className="text-foreground">Meta Platforms Ireland Ltd.</strong> — WhatsApp
              Cloud API, per ricevere e inviare i messaggi di qualificazione. In alternativa
              l&apos;agenzia può collegare il proprio numero tramite codice QR: in quel caso la
              sessione è custodita da un microservizio ospitato su{" "}
              <strong className="text-foreground">Render</strong> (regione di Francoforte), che
              tiene aperta la connessione e non conserva il contenuto dei messaggi.
            </>,
            <>
              <strong className="text-foreground">Resend</strong> — spedizione delle email di
              servizio: invito ai collaboratori, avviso di lead qualificato, soglie di consumo,
              scadenza degli incarichi, recupero password. Il corpo di questi messaggi può contenere
              nome, telefono e budget di un contatto.
            </>,
            <>
              <strong className="text-foreground">Stripe Payments Europe Ltd.</strong> — pagamenti,
              abbonamenti e fatturazione. <strong className="text-foreground">Nessun dato di carta
              transita dai nostri sistemi</strong>: conserviamo solo identificativi opachi
              (<code className="text-foreground">stripeCustomerId</code>,{" "}
              <code className="text-foreground">stripeSubscriptionId</code>).
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Elaborazione tramite intelligenza artificiale">
        <p>
          I contenuti caricati vengono inviati a modelli di AI per l&apos;estrazione dei dati, la
          generazione dei testi e la redazione dei report. Il servizio non assume decisioni
          automatizzate che producano effetti giuridici sugli interessati: gli output sono proposte
          che l&apos;agente rivede e approva prima di ogni utilizzo.
        </p>
      </LegalSection>

      <LegalSection title="10-bis. Filtro di pertinenza dei messaggi">
        <p>
          Ogni messaggio in arrivo passa da una valutazione automatica che stabilisce se riguarda
          l&apos;attività dell&apos;agenzia. I messaggi palesemente estranei — conversazioni
          personali, pubblicità, numeri sbagliati — non ricevono risposta automatica e, dopo due
          messaggi consecutivi di questo tipo, l&apos;assistente si sospende da solo su quel
          contatto. È un trattamento minimizzante: serve a <em>non</em> scrivere a chi non ha
          chiesto nulla.
        </p>
        <p>
          La valutazione non produce effetti giuridici e non nega alcun servizio: nel dubbio il
          messaggio passa e la conversazione prosegue normalmente.
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
