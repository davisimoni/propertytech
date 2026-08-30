import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { auth } from "@/auth";
import { LegalList, LegalPage, LegalSection, LEGAL_ENTITY } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = pageMetadata({
  title: "Termini di Servizio",
  description:
    "Condizioni d'uso di PropertyTech: crediti, abbonamenti, obblighi dell'agenzia e limitazione di responsabilità.",
  path: "/termini",
});

export default async function TerminiPage() {
  const session = await auth();

  return (
    <LegalPage
      isLoggedIn={Boolean(session?.user)}
      title="Termini e Condizioni di Servizio"
      intro={`Questi termini regolano l'accesso e l'uso di ${BRAND.name}, servizio SaaS rivolto ad agenzie immobiliari e professionisti del settore. Creando un account accetti quanto segue.`}
    >
      <LegalSection title="1. Oggetto del servizio">
        <p>
          {BRAND.name} mette a disposizione strumenti basati su intelligenza artificiale per la
          qualificazione dei contatti via WhatsApp, l&apos;estrazione di dati da documenti
          immobiliari, la generazione di contenuti per annunci e social e la redazione di report per
          i proprietari. Il servizio è offerto in modalità &quot;software come servizio&quot;, senza
          cessione di licenze d&apos;uso permanenti.
        </p>
      </LegalSection>

      <LegalSection title="2. Account e requisiti">
        <LegalList
          items={[
            "Il servizio è riservato a soggetti che operano in ambito professionale (B2B). Non è destinato ai consumatori.",
            "Le credenziali sono personali: l'agenzia è responsabile della loro custodia e di ogni attività svolta tramite il proprio account.",
            "I dati forniti in fase di registrazione devono essere veritieri e mantenuti aggiornati.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Piani, crediti e limiti d'uso">
        <p>
          L&apos;uso del servizio è misurato in crediti, differenziati per tipo di attività
          (conversazioni WhatsApp, analisi documentali, note vocali). Ogni piano include una
          dotazione:
        </p>
        <LegalList
          items={Object.values(PLANS).map((plan) => {
            const price = plan.priceEurMonthly === null ? "gratuito" : `${plan.priceEurMonthly}€/mese`;
            const docs =
              plan.ocrDocumentsLimit === null
                ? "analisi documentali illimitate"
                : `${plan.ocrDocumentsLimit} analisi documentali`;
            return `${plan.name} (${price}): ${plan.waConversationsLimit} conversazioni WhatsApp${
              plan.id === "trial" ? " complessive" : " al mese"
            }, ${docs}.`;
          })}
        />
        <LegalList
          items={[
            "I crediti dei piani a pagamento si rinnovano a ogni periodo di fatturazione e non sono cumulabili con quelli non utilizzati nel periodo precedente.",
            "I crediti del piano Trial sono complessivi e non si rinnovano.",
            "Al raggiungimento del limite le funzioni che consumano crediti vengono sospese fino al rinnovo o all'upgrade. Il controllo avviene prima dell'esecuzione dell'operazione.",
            "Alcuni moduli sono inclusi esclusivamente in determinati piani e non sono acquistabili separatamente a consumo.",
          ]}
        />
        <p>
          <strong className="text-foreground">Avvisi di consumo.</strong> Al superamento
          dell&apos;80% e del 90% della dotazione di un contatore, e al suo esaurimento, inviamo una
          comunicazione al Titolare dell&apos;account. Ogni soglia genera un solo avviso per periodo
          di fatturazione. Gli avvisi sono un servizio di cortesia: la responsabilità di monitorare
          il consumo resta dell&apos;Agenzia, e il mancato recapito di un avviso — per una casella
          piena, un filtro antispam o un indirizzo non più valido — non dà diritto a rimborsi né
          proroghe.
        </p>
        <p>
          <strong className="text-foreground">Operazioni che non consumano crediti.</strong> Non
          sono conteggiati: i promemoria di appuntamento, i messaggi di conferma di cancellazione,
          le risposte ai comandi di servizio e l&apos;invio di una proposta immobiliare a un
          contatto con cui la conversazione è già stata avviata.
        </p>
      </LegalSection>

      <LegalSection title="4. Prova gratuita">
        <p>
          Il piano Trial non richiede l&apos;inserimento di una carta di credito, non si converte
          automaticamente in un piano a pagamento e non prevede alcun addebito. Al termine dei
          crediti inclusi puoi scegliere se attivare un piano oppure lasciare l&apos;account inattivo.
        </p>
      </LegalSection>

      <LegalSection title="5. Abbonamenti, pagamenti e disdetta">
        <LegalList
          items={[
            "Gli abbonamenti sono mensili e si rinnovano automaticamente fino a disdetta.",
            "I pagamenti sono gestiti da Stripe. Non trattiamo né conserviamo i dati della tua carta.",
            "I prezzi sono espressi in euro e si intendono al netto di IVA e imposte applicabili.",
            "Puoi disdire in qualsiasi momento: il servizio resta attivo fino alla fine del periodo già pagato, senza rimborsi per le frazioni non utilizzate salvo diversa previsione di legge.",
            "Eventuali variazioni di prezzo sono comunicate con almeno 30 giorni di preavviso e si applicano dal rinnovo successivo.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Obblighi dell'agenzia">
        <p>
          Rispetto ai dati che carichi o che il servizio raccoglie per tuo conto, agisci come
          titolare del trattamento. In particolare ti impegni a:
        </p>
        <LegalList
          items={[
            "Disporre di una base giuridica valida per contattare i tuoi lead e per trattare i dati contenuti nei documenti che carichi.",
            "Non utilizzare il servizio per comunicazioni non sollecitate al di fuori dei casi consentiti dalla normativa applicabile.",
            "Rispettare le condizioni d'uso di Meta per WhatsApp Business, incluse le regole sui messaggi avviati dall'azienda.",
            "Non caricare contenuti illeciti, né dati per i quali non sei autorizzato al trattamento.",
            "Verificare gli output generati dall'AI prima di utilizzarli verso terzi.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6-bis. Uso consentito del servizio di messaggistica">
        <p>
          Il servizio è progettato per <strong className="text-foreground">rispondere</strong> a
          contatti che scrivono per primi all&apos;Agenzia. L&apos;Agenzia è l&apos;unica
          responsabile del contenuto dei messaggi inviati dal proprio numero e del rispetto delle
          condizioni d&apos;uso di WhatsApp e di Meta, incluse le regole sui messaggi avviati
          dall&apos;azienda e sull&apos;uso di elenchi di contatti.
        </p>
        <p>
          Adottiamo misure tecniche per ridurre il rischio che il numero collegato venga
          classificato come automazione — ritardo di risposta compatibile con la digitazione umana e
          limite agli invii verso lo stesso contatto — ma{" "}
          <strong className="text-foreground">nessuna misura tecnica può rendere conforme un uso
          che non lo è</strong>: le decisioni di Meta sui singoli numeri restano fuori dal nostro
          controllo e non sono a noi imputabili.
        </p>
        <p>
          <strong className="text-foreground">Sospensione per uso non conforme.</strong> L&apos;uso
          della piattaforma per invii massivi non sollecitati, liste fredde o altre attività in
          violazione delle policy di Meta comporta la sospensione immediata dell&apos;account,{" "}
          <strong className="text-foreground">senza diritto al rimborso dei crediti residui né dei
          ratei di abbonamento non goduti</strong>. La sospensione è comunicata all&apos;indirizzo
          del Titolare dell&apos;account con l&apos;indicazione della condotta contestata.
        </p>
        <p>
          Il collegamento del numero tramite codice QR utilizza un client non ufficiale.
          L&apos;Agenzia ne prende atto e accetta che Meta possa limitare o sospendere i numeri che
          ne fanno uso: per un impiego intensivo e continuativo raccomandiamo WhatsApp Cloud API.
        </p>
      </LegalSection>

      <LegalSection title="7. Natura degli output generati dall'AI">
        <p>
          I contenuti prodotti dal servizio — dati estratti dai documenti, annunci, post, script e
          report — sono <strong className="text-foreground">proposte automatiche</strong> soggette a
          verifica. Possono contenere imprecisioni od omissioni, specialmente su documenti poco
          leggibili o audio di scarsa qualità. Non costituiscono consulenza legale, fiscale,
          notarile o di stima immobiliare, e non sostituiscono il controllo sulle fonti ufficiali. La
          responsabilità sulla correttezza di quanto pubblicato o comunicato a terzi resta
          dell&apos;agenzia.
        </p>
        <p>
          Ogni contenuto generato che l&apos;agente può mostrare o inoltrare a terzi riporta
          un&apos;avvertenza sulla sua origine automatica. L&apos;avvertenza è parte integrante del
          contenuto: rimuoverla prima di trasmetterlo a un cliente o a un proprietario è una scelta
          dell&apos;agenzia, che se ne assume le conseguenze.
        </p>
        <p>
          <strong className="text-foreground">Manleva.</strong> L&apos;Agenzia tiene indenne{" "}
          {LEGAL_ENTITY.name} da pretese di terzi derivanti da contenuti generati dal servizio e
          diffusi, pubblicati o comunicati dall&apos;Agenzia senza la verifica di cui sopra — a
          titolo esemplificativo: un dato catastale errato riportato in un annuncio, una valutazione
          o una descrizione non corrispondente allo stato dell&apos;immobile, un messaggio inviato a
          un destinatario che non aveva titolo per riceverlo.
        </p>
        <p>
          <strong className="text-foreground">Uso di WhatsApp.</strong> L&apos;Agenzia risponde del
          contenuto dei messaggi inviati dal proprio numero e del rispetto delle condizioni d&apos;uso
          di Meta, incluse le regole sui messaggi avviati dall&apos;azienda. Il collegamento tramite
          codice QR utilizza un client non ufficiale: Meta può sospendere o limitare i numeri che ne
          fanno uso, e questa eventualità non è imputabile a {LEGAL_ENTITY.name}. Per un impiego
          intensivo e continuativo raccomandiamo WhatsApp Cloud API.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilità del servizio e dipendenze esterne">
        <p>
          Il servizio si appoggia a fornitori terzi (messaggistica, modelli di AI, pagamenti,
          hosting). Interruzioni, modifiche o limitazioni imposte da tali fornitori possono incidere
          sulla disponibilità di singole funzioni. Ci impegniamo a garantire la continuità con la
          diligenza professionale richiesta, senza tuttavia assicurare un funzionamento ininterrotto
          o privo di errori. Gli interventi di manutenzione programmata sono comunicati con
          ragionevole preavviso.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitazione di responsabilità">
        <p>
          Nei limiti consentiti dalla legge applicabile, la nostra responsabilità complessiva verso
          l&apos;agenzia è limitata all&apos;importo effettivamente corrisposto nei dodici mesi
          precedenti l&apos;evento da cui deriva la richiesta. Non rispondiamo di mancati guadagni,
          perdita di opportunità commerciali, mandati non acquisiti o danni indiretti. Nulla in
          questi termini esclude la responsabilità per dolo o colpa grave, né i diritti inderogabili
          previsti dalla legge.
        </p>
      </LegalSection>

      <LegalSection title="10. Sospensione e chiusura dell'account">
        <p>
          Possiamo sospendere o chiudere un account in caso di mancato pagamento, uso in violazione
          di questi termini o attività che comprometta la sicurezza della piattaforma o di terzi. Ove
          possibile la sospensione è preceduta da un avviso. Puoi richiedere in qualsiasi momento la
          chiusura del tuo account e l&apos;esportazione dei dati scrivendo a{" "}
          {LEGAL_ENTITY.email}.
        </p>
      </LegalSection>

      <LegalSection title="11. Proprietà intellettuale">
        <p>
          La piattaforma, il marchio {BRAND.name} e il software restano di titolarità del fornitore.
          I dati che carichi e i contenuti generati a partire da essi restano tuoi: puoi usarli,
          modificarli e pubblicarli liberamente nell&apos;ambito della tua attività.
        </p>
      </LegalSection>

      <LegalSection title="12. Modifiche ai termini">
        <p>
          Possiamo aggiornare questi termini per ragioni tecniche, normative o di evoluzione del
          servizio. Le modifiche sostanziali sono comunicate via email con almeno 30 giorni di
          preavviso; la prosecuzione dell&apos;uso dopo tale termine ne comporta l&apos;accettazione.
        </p>
      </LegalSection>

      <LegalSection title="13. Legge applicabile e foro competente">
        <p>
          Il rapporto è regolato dalla legge italiana. Per le controversie è competente il foro della
          sede del fornitore, salvo diversa previsione inderogabile di legge.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
