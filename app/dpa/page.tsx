import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { auth } from "@/auth";
import { LegalList, LegalPage, LegalSection, LEGAL_ENTITY } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";
import { DPA_EFFECTIVE_DATE, DPA_VERSION } from "@/lib/compliance";

export const metadata: Metadata = pageMetadata({
  title: "Accordo sul Trattamento dei Dati (DPA)",
  description:
    "Accordo ex art. 28 GDPR fra l'agenzia immobiliare, titolare del trattamento, e PropertyTech, responsabile del trattamento.",
  path: "/dpa",
});

export default async function DpaPage() {
  const session = await auth();

  return (
    <LegalPage
      isLoggedIn={Boolean(session?.user)}
      title="Accordo sul Trattamento dei Dati (DPA)"
      intro={`Questo accordo, ai sensi dell'art. 28 del Regolamento (UE) 2016/679, disciplina il trattamento dei dati personali che l'agenzia cliente carica su ${BRAND.name} o che il servizio raccoglie per suo conto. Costituisce parte integrante dei Termini di Servizio ed è accettato al momento della creazione dell'account.`}
    >
      <LegalSection title="Versione dell'accordo">
        <p>
          Versione <strong className="text-foreground">{DPA_VERSION}</strong>, in vigore dal{" "}
          {DPA_EFFECTIVE_DATE}. L&apos;istante di accettazione e la versione accettata sono
          registrati sull&apos;account dell&apos;agenzia e consultabili in Impostazioni.
        </p>
      </LegalSection>

      <LegalSection title="1. Ruoli delle parti">
        <p>
          L&apos;<strong className="text-foreground">Agenzia</strong> è il titolare del trattamento:
          determina finalità e mezzi, e risponde della base giuridica verso i propri contatti.{" "}
          <strong className="text-foreground">{LEGAL_ENTITY.name}</strong> è il responsabile del
          trattamento e agisce esclusivamente su istruzione documentata dell&apos;Agenzia.
        </p>
        <p>
          Per i dati dell&apos;account dell&apos;Agenzia (email, credenziali, fatturazione){" "}
          {LEGAL_ENTITY.name} agisce invece in qualità di titolare autonomo, come descritto
          nell&apos;Informativa Privacy.
        </p>
      </LegalSection>

      <LegalSection title="2. Proprietà dei dati">
        <p>
          I dati caricati dall&apos;Agenzia e quelli generati per suo conto restano di{" "}
          <strong className="text-foreground">esclusiva proprietà dell&apos;Agenzia</strong>.{" "}
          {LEGAL_ENTITY.name} non acquisisce su di essi alcun diritto ulteriore rispetto a quanto
          strettamente necessario a erogare il servizio.
        </p>
      </LegalSection>

      <LegalSection title="3. Oggetto, durata e categorie">
        <LegalList
          items={[
            "Oggetto: erogazione delle funzionalità di qualificazione lead, estrazione dati documentali, generazione di contenuti e reportistica post-visita.",
            "Durata: per tutta la vigenza del contratto di servizio.",
            "Categorie di interessati: potenziali acquirenti, proprietari e venditori di immobili, agenti dell'Agenzia.",
            "Categorie di dati: dati identificativi e di contatto, codici fiscali, quote di proprietà e riferimenti catastali, contenuto delle conversazioni, trascrizioni delle note vocali.",
          ]}
        />
        <p>
          Il servizio non è destinato al trattamento di categorie particolari di dati ex art. 9
          GDPR. L&apos;Agenzia si impegna a non caricare tali dati.
        </p>
      </LegalSection>

      <LegalSection title="4. Istruzioni del titolare">
        <p>
          {LEGAL_ENTITY.name} tratta i dati unicamente per erogare il servizio e per le finalità
          impartite dall&apos;Agenzia tramite l&apos;uso della piattaforma.{" "}
          <strong className="text-foreground">
            I dati non vengono utilizzati per finalità proprie del fornitore, né per addestrare
            modelli di intelligenza artificiale pubblici o di terzi.
          </strong>
        </p>
      </LegalSection>

      <LegalSection title="5. Ubicazione dei dati">
        <p>
          L&apos;infrastruttura applicativa e il database sono collocati in{" "}
          <strong className="text-foreground">Unione Europea</strong>. Eventuali trattamenti da
          parte di sub-responsabili al di fuori dello Spazio Economico Europeo avvengono solo in
          presenza di garanzie adeguate ex artt. 44 e seguenti GDPR.
        </p>
      </LegalSection>

      <LegalSection title="6. Misure tecniche e organizzative (art. 32 GDPR)">
        <p>
          Le misure elencate qui sotto sono quelle effettivamente implementate nella piattaforma,
          non un elenco di intenzioni. Sono descritte con la specificità che serve a renderle
          verificabili in sede di audit.
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Cifratura in transito</strong> — tutte le
              comunicazioni avvengono su TLS. La piattaforma non espone endpoint in chiaro.
            </>,
            <>
              <strong className="text-foreground">Cifratura a riposo dei segreti</strong> — il token
              di accesso WhatsApp e le chiavi API dei gestionali sono cifrati in AES-256-GCM prima
              di essere scritti. Un valore <em>non</em> cifrato viene rifiutato in lettura e non
              usato come ripiego: la protezione non è aggirabile ripristinando un backup precedente.
            </>,
            <>
              <strong className="text-foreground">Password</strong> — conservate solo come hash
              bcrypt. I token di invito e di recupero password esistono nel database unicamente
              come impronta SHA-256, non ricostruibile.
            </>,
            <>
              <strong className="text-foreground">Isolamento multi-tenant</strong> — ogni tabella
              con dati di agenzia porta la colonna{" "}
              <code className="text-foreground">organizationId</code>, e il filtro è applicato
              <em> nella clausola di interrogazione</em>, non con un controllo a valle. Un
              identificativo appartenente a un&apos;altra agenzia semplicemente non restituisce
              righe, invece di restituirle e affidarsi a un controllo che qualcuno potrebbe
              dimenticare.
            </>,
            <>
              <strong className="text-foreground">Separazione dei ruoli</strong> — le operazioni che
              riguardano l&apos;agenzia nel suo insieme (abbonamento, identità, scheda agenzia, feed
              verso i portali) sono riservate al Titolare dell&apos;account. I collaboratori
              operano su lead, immobili, documenti e report.
            </>,
            <>
              <strong className="text-foreground">Prevenzione dell&apos;enumerazione degli
              account</strong> — la richiesta di recupero password restituisce sempre la stessa
              risposta, che l&apos;indirizzo esista o meno, così l&apos;endpoint non può essere
              usato per accertare quali email siano registrate. Nemmeno un guasto interno modifica
              la risposta.
            </>,
            <>
              <strong className="text-foreground">Autenticazione delle integrazioni</strong> — i
              webhook in ingresso sono autenticati con confronto a tempo costante e sono{" "}
              <em>fail-closed</em>: in assenza del segreto configurato rifiutano chiunque, invece di
              restare aperti.
            </>,
            <>
              <strong className="text-foreground">Registrazioni audio</strong> — elaborate in
              memoria ed eliminate al termine della trascrizione. Non vengono mai scritte su disco.
            </>,
            <>
              <strong className="text-foreground">Minimizzazione nei log</strong> — non registriamo
              il testo dei messaggi, il contenuto dei documenti né le credenziali. I numeri di
              telefono compaiono troncati; gli indirizzi IP sono troncati e trasformati in impronta
              prima di essere conservati.
            </>,
            <>
              <strong className="text-foreground">Avviso di accesso</strong> — un accesso da un
              dispositivo mai visto genera una notifica all&apos;indirizzo dell&apos;utente.
            </>,
            "Il personale autorizzato al trattamento è vincolato alla riservatezza.",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Sub-responsabili">
        <p>
          L&apos;Agenzia autorizza il ricorso a sub-responsabili per hosting e database, pagamenti,
          messaggistica WhatsApp, elaborazione tramite modelli di AI ed eventuale trascrizione
          vocale. L&apos;elenco aggiornato è disponibile scrivendo a {LEGAL_ENTITY.email}. Le
          variazioni sono comunicate con ragionevole preavviso e l&apos;Agenzia può opporsi
          recedendo dal servizio.
        </p>
      </LegalSection>

      <LegalSection title="8. Assistenza al titolare">
        <p>
          {LEGAL_ENTITY.name} assiste l&apos;Agenzia nel dare seguito alle richieste degli
          interessati (accesso, rettifica, cancellazione, portabilità, opposizione) e nel rispetto
          degli obblighi di sicurezza, valutazione d&apos;impatto e consultazione preventiva, nella
          misura in cui tali adempimenti dipendano dai dati trattati sulla piattaforma.
        </p>
      </LegalSection>

      <LegalSection title="9. Violazioni dei dati">
        <p>
          In caso di violazione che coinvolga i dati dell&apos;Agenzia, {LEGAL_ENTITY.name} la
          informa senza ingiustificato ritardo, fornendo le informazioni necessarie
          all&apos;eventuale notifica all&apos;autorità di controllo.
        </p>
      </LegalSection>

      <LegalSection title="10. Restituzione e cancellazione">
        <p>
          Alla cessazione del servizio l&apos;Agenzia può richiedere l&apos;esportazione dei dati.
          Su richiesta, o decorsi i termini di conservazione, i dati vengono cancellati salvo
          obblighi di legge che ne impongano la conservazione.
        </p>
      </LegalSection>

      <LegalSection title="11. Audit">
        <p>
          Su richiesta motivata, {LEGAL_ENTITY.name} mette a disposizione le informazioni necessarie
          a dimostrare il rispetto degli obblighi previsti dall&apos;art. 28 GDPR e consente
          verifiche concordate, con modalità che non compromettano la sicurezza degli altri clienti.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
