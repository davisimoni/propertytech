import type { Metadata } from "next";
import { auth } from "@/auth";
import { LegalList, LegalPage, LegalSection, LEGAL_ENTITY } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";
import { DPA_EFFECTIVE_DATE, DPA_VERSION } from "@/lib/compliance";

export const metadata: Metadata = {
  title: `Accordo sul Trattamento dei Dati (DPA) — ${BRAND.name}`,
  description:
    "Accordo ex art. 28 GDPR fra l'agenzia immobiliare, titolare del trattamento, e PropertyTech, responsabile del trattamento.",
};

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

      <LegalSection title="6. Riservatezza e sicurezza">
        <LegalList
          items={[
            "Il personale autorizzato al trattamento è vincolato alla riservatezza.",
            "Le password sono conservate esclusivamente in forma cifrata; i dati delle carte di pagamento non transitano mai dai nostri sistemi.",
            "Ogni agenzia accede unicamente ai propri dati: la separazione è applicata a livello di interrogazione al database, non con soli controlli d'interfaccia.",
            "Le registrazioni audio delle note vocali sono elaborate in memoria ed eliminate al termine della trascrizione.",
            "Le credenziali di integrazione fornite dall'Agenzia sono conservate per il solo funzionamento delle integrazioni richieste.",
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
