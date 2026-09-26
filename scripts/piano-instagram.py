"""
Piano editoriale Instagram di PropertyTech, pronto per Predis.ai.

# Perché un secondo piano e non una modifica del primo

Perché sono due strumenti diversi. `piano-editoriale.py` produce un piano
multi-piattaforma con LinkedIn al centro: post lunghi, tono da articolo,
pubblico che legge in orario d'ufficio. Questo è Instagram-first, costruito
attorno a quattro colonne che lì non esistono — pilastro, leva psicologica,
obiettivo e il testo che va stampato sulla grafica — e attorno a un prompt
pensato per il pulsante «Create New» di Predis.ai.

Tenerli separati costa un file in più. Fonderli costerebbe un piano che non
serve bene a nessuna delle due piattaforme.

# Cosa NON c'è dentro, e perché

**Nessun caso cliente e nessuna testimonianza inventati.** I pilastri «Case
Study» e «Social Proof» esistono, ma realizzati con ciò che è vero oggi:

- i *case study* sono **scenari dichiarati tali** («come si comporta
  l'assistente quando arriva una richiesta alle 22:40»), non risultati
  attribuiti a un'agenzia che non esiste. Il percorso raccontato è quello che
  il software fa davvero, verificabile in due minuti di prova;
- la *social proof* non è una faccia sorridente con una frase fra virgolette.
  È ciò su cui poggia il prodotto e che chiunque può controllare: il modello
  di Anthropic che legge i documenti, il canale ufficiale WhatsApp Business,
  i server in Unione Europea, la prova senza carta di credito.

Una testimonianza inventata è la cosa più facile da scrivere e la più cara da
spiegare: basta un'agenzia che chiede «e chi sono questi?» perché tutto il
resto del profilo diventi sospetto.

**Nessuna percentuale di risultato, nessun prezzo.** Stessa regola del piano
LinkedIn: non abbiamo una base clienti da cui ricavare numeri, e un prezzo
stampato su un'immagine resta online dopo il primo cambio di listino.

**Niente schermate di software.** Il divieto è dentro ogni prompt, perché è
Predis a disegnare: lasciato libero inventa finte interfacce WhatsApp con
testi storti, e un mockup sbagliato del nostro prodotto è peggio di nessuna
immagine.

**Solo funzioni che esistono.** L'assistente non risponde da solo ai commenti
né ai messaggi diretti, e il fascicolo documentale non certifica nulla. Report
vocali e Social & Annunci sono del piano Enterprise, e i post che li mostrano
lo dichiarano.

# Uso

    python scripts/piano-instagram.py [percorso.xlsx]
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path
from typing import NamedTuple

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

DESTINAZIONE_PREDEFINITA = Path(
    r"C:\Users\david\OneDrive\Desktop\PropertyTech\Piano_Instagram_PropertyTech.xlsx"
)

#: Primo lunedì del piano. Quattro settimane, cinque uscite a settimana.
INIZIO = datetime.date(2026, 9, 28)

GIORNI_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]

COLONNE = [
    ("Giorno", 12),
    ("Sett.", 7),
    ("Giorno sett.", 13),
    ("Ora", 7),
    ("Formato", 14),
    ("Pilastro", 15),
    ("Titolo interno", 30),
    ("HOOK", 44),
    ("PROMPT DA INCOLLARE SU PREDIS.AI", 92),
    ("Testo a schermo", 40),
    ("Caption Instagram", 74),
    ("CTA", 32),
    ("Leva psicologica", 20),
    ("Obiettivo", 20),
]

BLU = "0B3C6E"
GHIACCIO = "EAF1F8"

#: Massimo di parole che una grafica regge su un telefono prima di diventare
#: illeggibile. Sta dentro il prompt perché Predis, lasciato libero, riempie.
MAX_PAROLE_SU_IMMAGINE = 12

#: Il contesto di prodotto, identico in ogni prompt.
#:
#: Ripetuto e non accennato: Predis non ha memoria fra una generazione e
#: l'altra, e un prompt che dà per scontato «il nostro software» produce
#: un'immagine generica da agenzia di marketing.
CONTESTO = (
    "PropertyTech e' un software italiano con intelligenza artificiale per agenzie immobiliari: "
    "un assistente qualifica i contatti su WhatsApp 24 ore su 24, legge visure e atti ed estrae i "
    "dati catastali, trascrive le note vocali dell'agente e prepara i testi degli annunci. "
    "Il pubblico e' fatto di titolari di agenzia, agenti e team leader italiani."
)

#: Il trattamento visivo, identico in ogni prompt.
#:
#: Descrive COME si guarda, non COSA si guarda. Il soggetto lo porta ogni post
#: per conto suo, e la prima versione di questa costante elencava anche quello
#: - "ufficio luminoso, scrivania, chiavi, planimetrie" - con il risultato che
#: un post ambientato in una camera da letto al buio chiedeva a Predis due
#: soggetti in contraddizione nella stessa riga. Davanti a un'istruzione
#: doppia un generatore non sceglie: mescola.
STILE = (
    "Trattamento: fotografia realistica e sobria, luce naturale, palette blu notte e neutri "
    "caldi, profondita' di campo ridotta, composizione pulita con spazio libero per il testo. "
    "Niente pose da stock americano, niente sorrisi in camera, niente ambientazioni che non "
    "siano riconoscibilmente italiane."
)

#: Il divieto, identico in ogni prompt.
DIVIETO = (
    "VIETATO IN MODO ASSOLUTO: screenshot di software, mockup di applicazioni, finte schermate di "
    "chat o di WhatsApp, grafici o dashboard su un monitor, loghi di terzi, volti di persone "
    "riconoscibili. Nessun numero, percentuale o dato di risultato: non ne abbiamo di verificati."
)

#: Il tono, identico in ogni prompt.
TONO = (
    "Tono di voce: professionale e innovativo, da collega esperto che parla a un altro "
    "professionista. Mai pubblicitario, mai entusiasta a vuoto. Dai del tu. Testo in italiano."
)


class Post(NamedTuple):
    """
    Una singola uscita.

    Campi nominati e non una tupla a indici: con dodici campi per riga, quello
    che va storto non e' il tipo ma l'ordine, e un valore scambiato di posto
    non produce un errore — produce una caption nella colonna della CTA, e lo
    si scopre aprendo il file.
    """

    ora: str
    formato: str
    pilastro: str
    titolo: str
    hook: str
    #: Cosa si vede, in italiano e in breve: e' il cuore del prompt Predis.
    soggetto: str
    #: L'argomento del contenuto, spiegato a Predis in una frase piena.
    argomento: str
    testo_schermo: str
    caption: str
    cta: str
    leva: str
    obiettivo: str


_VOCI: list[tuple[str, ...]] = [
    # ══════════════════ SETTIMANA 1 — il problema si chiama tempo
    (
        "08:30",
        "Reel",
        "Pain Point",
        "Le 22:40 di un martedì",
        "Il lead più caldo della settimana ti scrive alle 22:40. Tu dormi.",
        "uno smartphone appoggiato sul comodino che si illumina al buio, camera da letto in penombra",
        "Il momento in cui arriva una richiesta da un portale immobiliare fuori orario e nessuno puo' "
        "rispondere. La mattina dopo quella persona ha gia' scritto ad altre tre agenzie.",
        "Alle 22:40 rispondi o dormi?",
        "Le richieste dai portali non arrivano in orario d'ufficio. 🌙\n\n"
        "Arrivano alle 22:40, di domenica, mentre sei a cena. E chi cerca casa non aspetta: scrive "
        "a tre agenzie e parla con la prima che risponde.\n\n"
        "PropertyTech risponde al posto tuo su WhatsApp, fa le domande giuste e ti lascia in agenda "
        "solo chi vale un appuntamento.\n\n"
        "Il sonno resta tuo.",
        "Scrivi DEMO nei commenti e ti mando il link della prova gratuita",
        "FOMO",
        "Lead Generation",
    ),
    (
        "18:30",
        "Carosello",
        "Educativo",
        "Le 3 domande che cambiano la giornata",
        "Ci sono tre domande che dividono un contatto da un appuntamento.",
        "un taccuino aperto con una penna appoggiata, accanto a una tazza di caffe', luce da ufficio",
        "Le tre domande di qualificazione che ogni agente dovrebbe fare subito: serve un mutuo, c'e' "
        "un immobile da vendere prima, quali sono le tempistiche. Spiegate una per scheda, con il "
        "motivo per cui ognuna cambia la priorita' del contatto.",
        "Mutuo? Casa da vendere? Quando?",
        "Tre domande. Fatte subito, ti dicono se quella persona comprera' nei prossimi mesi o fra "
        "due anni. 🔑\n\n"
        "1. Le serve un mutuo, e a che punto e'?\n"
        "2. Ha un immobile da vendere prima di comprare?\n"
        "3. In quanto tempo vorrebbe chiudere?\n\n"
        "Chi risponde \"contanti, niente da vendere, entro tre mesi\" non e' un contatto: e' un "
        "appuntamento.\n\n"
        "Il nostro assistente le fa da solo, su WhatsApp, appena arriva la richiesta.",
        "Salva questo post e usalo come traccia alla prossima chiamata",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "12:30",
        "Post statico",
        "Demo Prodotto",
        "Dal portale alla tua agenda",
        "Richiesta da Immobiliare.it alle 21:10. Appuntamento in agenda alle 21:14.",
        "un'agenda cartacea aperta sulla settimana con un appuntamento segnato a penna, luce calda",
        "Il percorso completo di un contatto: arriva dal portale, l'assistente scrive su WhatsApp, "
        "fa le domande, propone gli orari liberi dell'agente e fissa l'appuntamento in agenda. "
        "Quattro minuti, di notte, senza nessuno sveglio.",
        "Dal portale all'agenda, di notte",
        "Quattro minuti tra la richiesta e l'appuntamento fissato. ⏱️\n\n"
        "L'assistente riceve il contatto dal portale, apre la conversazione su WhatsApp, fa le tre "
        "domande di qualificazione e propone gli orari che hai davvero liberi.\n\n"
        "Tu la mattina trovi un appuntamento in agenda e sai gia' con chi hai a che fare.",
        "Prova gratuita dal link in bio, senza carta di credito",
        "Risparmio di tempo",
        "Conversione",
    ),
    (
        "19:00",
        "Reel",
        "Pain Point",
        "Il pomeriggio bruciato",
        "Quattro ore al telefono. Zero appuntamenti. Ti suona familiare?",
        "un telefono fisso da ufficio accanto a una pila di fogli, fine giornata, luce bassa",
        "Il pomeriggio speso a richiamare contatti che non compreranno: chi guarda per curiosita', "
        "chi cerca in una fascia di prezzo che non esiste, chi doveva prima vendere e non l'ha detto.",
        "4 ore al telefono. 0 appuntamenti.",
        "Il problema non e' avere pochi contatti. 📞\n\n"
        "E' non sapere quale dei venti merita il tuo pomeriggio. Cosi' li chiami tutti, e alla fine "
        "della giornata hai parlato quattro ore con chi non comprera'.\n\n"
        "L'assistente li qualifica prima che tu alzi la cornetta: budget, mutuo, tempistiche, casa "
        "da vendere. Tu richiami chi ha senso richiamare.",
        "Scrivi DEMO nei commenti",
        "Risparmio di tempo",
        "Lead Generation",
    ),
    (
        "17:30",
        "Storia",
        "Social Proof",
        "Su cosa gira davvero",
        "Chi legge le tue visure?",
        "una visura catastale stampata su una scrivania, con occhiali appoggiati sopra",
        "Le fondamenta tecniche del prodotto, verificabili: il modello di Anthropic che legge i "
        "documenti, il canale ufficiale WhatsApp Business, database e server in Unione Europea, "
        "trattamento conforme al GDPR.",
        "Modello Anthropic. Server in UE.",
        "Domanda legittima: a chi stai dando i dati dei tuoi clienti? 🇪🇺\n\n"
        "• I documenti li legge un modello di Anthropic, non un servizio anonimo\n"
        "• WhatsApp passa dal canale ufficiale Business, non da scorciatoie\n"
        "• Database e server in Unione Europea, trattamento conforme al GDPR\n"
        "• L'accordo sul trattamento dati lo firmi alla registrazione\n\n"
        "Non e' un dettaglio tecnico: e' la differenza fra uno strumento che puoi usare e uno che "
        "ti mette in difficolta' al primo controllo.",
        "Domande sulla privacy? Scrivimi in DM",
        "Autorità",
        "Brand Awareness",
    ),
    # ══════════════════ SETTIMANA 2 — la vetrina e le notizie
    (
        "08:30",
        "Reel",
        "Demo Prodotto",
        "Il QR in vetrina che lavora di notte",
        "La tua vetrina è aperta 24 ore. Peccato che nessuno risponda.",
        "una vetrina di agenzia immobiliare vista dalla strada di sera, annunci illuminati",
        "Il QR code in vetrina o sul flyer: chi passa davanti alle 23 lo inquadra, apre WhatsApp e "
        "l'assistente comincia a parlargli. La vetrina smette di essere un cartellone e diventa un "
        "punto di raccolta contatti.",
        "La vetrina che risponde",
        "Quante persone guardano la tua vetrina dopo la chiusura? 🌃\n\n"
        "Tante. E nessuna di loro ti lascia il numero, perche' non c'e' nessuno a cui lasciarlo.\n\n"
        "Con un QR in vetrina chi passa inquadra, si apre WhatsApp, e l'assistente comincia a fare "
        "le domande giuste. La mattina il contatto e' gia' in scheda, qualificato.\n\n"
        "Stesso vetro, stessi annunci. Cambia solo che adesso risponde.",
        "Scrivi VETRINA nei commenti e ti spiego come si attiva",
        "Semplicità",
        "Lead Generation",
    ),
    (
        "18:30",
        "Carosello",
        "Educativo",
        "Perché i lead si raffreddano",
        "Un contatto che aspetta 10 minuti vale la metà. Dopo un'ora, quasi nulla.",
        "un orologio da parete in un ufficio vuoto, lancette ben visibili, luce naturale",
        "Perche' la velocita' di risposta conta piu' della qualita' della risposta nei primi minuti: "
        "chi cerca casa scrive a piu' agenzie contemporaneamente e parla con la prima che risponde. "
        "Senza citare statistiche: il ragionamento si regge da solo.",
        "Il primo che risponde, parla.",
        "Chi cerca casa non scrive a una sola agenzia. ⏳\n\n"
        "Compila tre moduli in cinque minuti e poi aspetta. La prima risposta che arriva si prende "
        "la conversazione, e le altre due arrivano quando ha gia' fissato con qualcun altro.\n\n"
        "Non serve rispondere meglio. Serve rispondere prima.\n\n"
        "L'assistente scrive entro pochi secondi dalla richiesta, anche quando sei in visita.",
        "Salva il post e confronta con i tuoi tempi di risposta di oggi",
        "FOMO",
        "Brand Awareness",
    ),
    (
        "12:30",
        "Post statico",
        "Pain Point",
        "La notifica persa",
        "Immobiliare.it, Idealista, email, WhatsApp, il modulo del sito. Quante ne perdi?",
        "uno smartphone con molte notifiche non lette sulla schermata di blocco, su una scrivania",
        "Le richieste arrivano da cinque posti diversi e nessuno li guarda tutti. Il contatto perso "
        "non fa rumore: nessuno si lamenta, semplicemente compra da un'altra parte.",
        "5 canali. Nessuno che li guarda tutti.",
        "Il contatto che perdi non ti manda un messaggio per dirtelo. 📵\n\n"
        "Arriva su Immobiliare.it mentre sei in visita, su Idealista mentre guidi, via email il "
        "sabato. Quando riapri il telefono ce ne sono quattordici, e tre erano buoni.\n\n"
        "PropertyTech li raccoglie da tutti i canali in un posto solo e comincia a parlarci subito.",
        "Prova gratuita dal link in bio",
        "FOMO",
        "Lead Generation",
    ),
    (
        "19:00",
        "Reel",
        "Case Study",
        "Come si comporta con un venditore",
        "\"Vorrei vendere casa mia.\" Qui cambia tutto.",
        "le chiavi di casa posate su un tavolo di legno accanto a una planimetria arrotolata",
        "Scenario dichiarato, non un cliente reale: cosa succede quando chi scrive non vuole "
        "comprare ma vendere. L'assistente riconosce l'intenzione dalla prima frase e cambia "
        "domande: niente budget, ma tipologia, zona, tempistiche e se c'e' gia' un incarico.",
        "Chi vende non va trattato come chi compra",
        "Un'agenzia vive di due mestieri, e le domande sono diverse. 🏠\n\n"
        "A chi cerca casa chiedi budget e zona. A chi vuole vendere quelle domande non servono a "
        "niente: serve sapere che immobile e', dove, in quanto tempo vorrebbe chiudere e se ha gia' "
        "dato un incarico.\n\n"
        "L'assistente lo capisce dalla prima frase e cambia strada da solo. Perche' un'acquisizione "
        "persa costa piu' di dieci contatti in acquisto.\n\n"
        "(Esempio di funzionamento, non un caso cliente.)",
        "Scrivi DEMO nei commenti",
        "Autorità",
        "Conversione",
    ),
    (
        "17:30",
        "Storia",
        "Educativo",
        "Il vocale delle 19:30",
        "Registri un vocale uscendo dalla visita. Il report è pronto prima che arrivi in ufficio.",
        "una mano che tiene uno smartphone davanti al portone di un palazzo, fine pomeriggio",
        "La nota vocale registrata subito dopo una visita diventa un report scritto per il "
        "proprietario. Da dichiarare: e' una funzione del piano Enterprise.",
        "Parli 40 secondi. Esce un report.",
        "Il report al proprietario e' la cosa che fa rinnovare il mandato, ed e' anche la prima che "
        "salti quando la visita finisce alle 19:30. 🎙️\n\n"
        "Registri un vocale mentre torni alla macchina: chi e' venuto, cosa ha detto, cosa non "
        "convince. Il testo per il proprietario e' pronto prima che tu arrivi in ufficio.\n\n"
        "Funzione del piano Enterprise.",
        "Vuoi vederlo? Scrivi REPORT in DM",
        "Risparmio di tempo",
        "Conversione",
    ),
    # ══════════════════ SETTIMANA 3 — documenti e burocrazia
    (
        "08:30",
        "Reel",
        "Pain Point",
        "Tre ore a ricopiare",
        "Foglio, particella, subalterno, rendita. A mano. Di nuovo.",
        "una visura catastale su una scrivania accanto a una tastiera, ripresa dall'alto",
        "Il lavoro di ricopiatura dei dati catastali da una visura: righe fitte, numeri che non "
        "vanno sbagliati, e la consapevolezza che e' un lavoro che non porta nessuna firma.",
        "Ricopiare non ha mai venduto una casa",
        "Nessuna di queste ore porta una firma. 📄\n\n"
        "Aprire la visura, trovare foglio e particella, ricopiare la rendita, controllare due volte "
        "perche' un numero sbagliato qui si paga caro.\n\n"
        "Trascini il PDF, e i dati sono estratti e pronti da controllare. Il controllo resta tuo: "
        "quello e' il lavoro che vale.",
        "Prova gratuita dal link in bio",
        "Risparmio di tempo",
        "Lead Generation",
    ),
    (
        "18:30",
        "Carosello",
        "Educativo",
        "Cosa fa saltare un rogito",
        "Le cose che fanno saltare un rogito sono sempre le stesse cinque.",
        "un mazzo di chiavi accanto a una cartellina di documenti chiusa, luce da studio notarile",
        "I cinque documenti che mancano piu' spesso quando si arriva al rogito: conformita' "
        "catastale, atto di provenienza, ipoteche non cancellate, APE scaduto, spese condominiali "
        "arretrate. Una scheda per ognuno, con cosa chiedere e a chi.",
        "5 documenti. Sempre gli stessi.",
        "Un rogito non salta per sfortuna. Salta per una di queste cinque. 🛑\n\n"
        "• Conformita' catastale che non torna\n"
        "• Atto di provenienza introvabile\n"
        "• Ipoteche mai cancellate\n"
        "• APE scaduto\n"
        "• Spese condominiali arretrate\n\n"
        "PropertyTech ti dice cosa manca finche' c'e' tempo per procurarlo, con la checklist per "
        "immobile e l'elenco pronto da mandare al proprietario.\n\n"
        "Non certifica nulla e non sostituisce tecnico e notaio: serve a non arrivare al rogito con "
        "una sorpresa.",
        "Salva il post: ti serve al prossimo incarico",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "12:30",
        "Post statico",
        "Demo Prodotto",
        "Il PDF che si legge da solo",
        "Trascini la visura. I dati sono già in scheda.",
        "una mano che appoggia un foglio su una scrivania ordinata, luce naturale dall'alto",
        "L'estrazione dati da una visura catastale: intestatari, quote di proprieta', comune, "
        "foglio, particella, subalterno, rendita e categoria, pronti da controllare in pochi "
        "secondi invece che in mezz'ora di ricopiatura.",
        "Dal PDF alla scheda, in pochi secondi",
        "Intestatari, quote, comune, foglio, particella, subalterno, rendita, categoria. 🗂️\n\n"
        "Tutto quello che c'e' in una visura, estratto e messo in ordine mentre tu fai altro.\n\n"
        "Poi controlli: e' il momento in cui il tuo mestiere serve davvero, e ora ci arrivi con "
        "l'energia che prima spendevi a ricopiare.",
        "Prova gratuita dal link in bio, senza carta di credito",
        "Semplicità",
        "Conversione",
    ),
    (
        "19:00",
        "Reel",
        "Case Study",
        "Il sabato di un agente",
        "Sabato, ore 11. Sei in visita. Arrivano quattro richieste.",
        "una porta d'ingresso aperta su un appartamento vuoto e luminoso, mattina",
        "Scenario dichiarato: il sabato mattina in visita, con il telefono che vibra e nessuna "
        "possibilita' di rispondere. Cosa succede ai quattro contatti con l'assistente attivo: "
        "vengono accolti, qualificati, e due di loro hanno gia' un orario proposto.",
        "In visita. Il telefono lavora.",
        "Sabato mattina, sei dentro un appartamento con dei clienti. Il telefono vibra quattro "
        "volte. 📲\n\n"
        "Non puoi rispondere, e lo sai: rispondere significherebbe interrompere la visita che stai "
        "gia' facendo.\n\n"
        "Con l'assistente attivo quelle quattro richieste vengono accolte subito, qualificate, e "
        "quando esci trovi due appuntamenti proposti e due contatti da archiviare.\n\n"
        "(Esempio di funzionamento, non un caso cliente.)",
        "Scrivi DEMO nei commenti",
        "Risparmio di tempo",
        "Lead Generation",
    ),
    (
        "17:30",
        "Storia",
        "Social Proof",
        "Prova senza carta",
        "Nessuna carta di credito. Nessuna migrazione. Due minuti.",
        "uno smartphone in mano in un ufficio luminoso, tazza di caffe' sulla scrivania, mattino",
        "Come si prova il prodotto: registrazione in due minuti, nessuna carta di credito, nessun "
        "cambio di gestionale, i dati restano dell'agenzia. L'ostacolo tolto, non promesso.",
        "Due minuti. Nessuna carta.",
        "La domanda vera non e' \"funziona?\". E' \"quanto mi costa scoprirlo?\". ⏱️\n\n"
        "• Nessuna carta di credito\n"
        "• Nessuna migrazione: il tuo gestionale resta dov'e'\n"
        "• Due minuti per attivarlo\n"
        "• I dati restano tuoi, server in Unione Europea\n\n"
        "Se non fa per te lo chiudi e non e' successo niente.",
        "Link in bio per la prova gratuita",
        "Semplicità",
        "Conversione",
    ),
    # ══════════════════ SETTIMANA 4 — acquisizione e mandati
    (
        "08:30",
        "Reel",
        "Pain Point",
        "L'appuntamento di acquisizione",
        "Il proprietario sente tre agenzie. Tutte e tre dicono le stesse cose.",
        "due sedie davanti a un tavolo in un salotto, luce del pomeriggio, nessuno in scena",
        "L'appuntamento di acquisizione in cui ogni agenzia promette impegno, professionalita' e "
        "visibilita': parole identiche, e il proprietario sceglie a caso o sulla provvigione.",
        "Cosa dici che gli altri non dicono?",
        "\"Siamo molto attivi in zona.\" \"Massima professionalita'.\" \"Le garantiamo visibilita'.\" 🤝\n\n"
        "Le dicono tutti, quindi non le sente piu' nessuno. E quando tre agenzie dicono la stessa "
        "cosa, il proprietario sceglie sulla provvigione.\n\n"
        "Portare qualcosa di concreto da mostrare cambia la conversazione: come viene seguita la "
        "richiesta, quando riceve i report, cosa succede ai contatti che arrivano di notte.",
        "Cosa porti tu in acquisizione? Scrivilo nei commenti",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "18:30",
        "Carosello",
        "Demo Prodotto",
        "Il report che fa rinnovare",
        "Il mandato non si perde al sesto mese. Si perde al primo silenzio.",
        "una busta e un foglio stampato su un tavolo di cucina, luce di fine pomeriggio",
        "Perche' informare il proprietario dopo ogni visita e' cio' che fa rinnovare il mandato, e "
        "come il report vocale lo rende sostenibile anche quando la visita finisce tardi. Da "
        "dichiarare: funzione del piano Enterprise.",
        "Il silenzio costa il mandato",
        "Nessun proprietario ritira un incarico perche' la casa non si e' venduta in sei mesi. 📝\n\n"
        "La ritira perche' in sei mesi non ha saputo niente.\n\n"
        "Un report dopo ogni visita — chi e' venuto, cosa ha detto, cosa frena — e' la cosa che "
        "tiene in piedi il rapporto. Il problema e' scriverlo alle 19:30.\n\n"
        "Lo detti in quaranta secondi e il testo e' pronto. Funzione del piano Enterprise.",
        "Scrivi REPORT in DM per vederlo",
        "Autorità",
        "Conversione",
    ),
    (
        "12:30",
        "Post statico",
        "Educativo",
        "Il lead d'oro che non guardi",
        "Chi ha due immobili non è un contatto. È un portafoglio.",
        "una fila di campanelli su un portone di palazzo, dettaglio ravvicinato",
        "Perche' un contatto che possiede piu' di un immobile vale piu' di dieci acquirenti puri: "
        "e' un'acquisizione potenziale, non solo una vendita. Come emerge dalle domande che "
        "l'assistente fa gia'.",
        "2 immobili = alta priorità",
        "Fra i contatti che arrivano ce n'e' sempre qualcuno che possiede gia' piu' di una casa. 🏘️\n\n"
        "Per te non e' un acquirente: e' un'acquisizione che non hai ancora fatto.\n\n"
        "L'assistente lo rileva dalle domande che fa gia' — senza chiederne di nuove — e te lo "
        "segnala in scheda come alta priorita'.\n\n"
        "Il dato e' sempre da confermare con la persona: un omonimo non e' un proprietario.",
        "Salva il post e controlla i tuoi ultimi 20 contatti",
        "Autorità",
        "Lead Generation",
    ),
    (
        "19:00",
        "Reel",
        "Case Study",
        "Fuori tema, nessuna risposta",
        "Tuo cognato ti scrive per la cena. L'assistente non gli risponde.",
        "uno smartphone posato a faccia in giu' su un tavolo apparecchiato, sera",
        "Scenario dichiarato: il numero dell'agenzia e' lo stesso che usano fornitori, colleghi e "
        "parenti. L'assistente distingue una richiesta immobiliare da una chiacchiera e sulla "
        "seconda resta in silenzio, invece di chiedere il budget a chi organizza una cena.",
        "Sa quando non deve rispondere",
        "Il numero dell'agenzia e' lo stesso che usa tuo cognato. 🤐\n\n"
        "Un assistente che risponde a tutto chiederebbe la delibera del mutuo all'idraulico e le "
        "tempistiche d'acquisto a chi ti invita a cena.\n\n"
        "Il nostro legge il contenuto, non il tono: se dentro c'e' una richiesta su una casa "
        "risponde, anche scritta male o mandata a voce. Se non c'e', tace e non tocca niente.\n\n"
        "(Esempio di funzionamento, non un caso cliente.)",
        "Scrivi DEMO nei commenti",
        "Semplicità",
        "Brand Awareness",
    ),
    (
        "17:30",
        "Storia",
        "Social Proof",
        "Cosa non fa",
        "Ci sono tre cose che questo software non fa. Meglio dirle.",
        "una finestra di ufficio con le veneziane socchiuse, luce del tardo pomeriggio",
        "Trasparenza sui limiti: l'assistente non risponde da solo ai commenti o ai messaggi "
        "diretti sui social, il fascicolo documentale non certifica nulla ai fini antiriciclaggio, "
        "e la firma digitale non c'e'. Dichiarare i limiti come prova di serieta'.",
        "Tre cose che NON fa",
        "Ogni software che promette tutto sta nascondendo qualcosa. Quindi: 🙋\n\n"
        "• Non risponde da solo ai commenti o ai DM sui social\n"
        "• Il fascicolo documentale non certifica nulla: la responsabilita' antiriciclaggio resta "
        "del soggetto obbligato\n"
        "• Non c'e' la firma digitale: quella si integra con un prestatore qualificato, non si "
        "costruisce\n\n"
        "Preferiamo che tu lo sappia oggi, invece che il primo giorno di prova.",
        "Altre domande? Scrivimi in DM, rispondo io",
        "Autorità",
        "Brand Awareness",
    ),
]

POSTS: list[Post] = [Post(*voce) for voce in _VOCI]


#: Hashtag presenti su ogni uscita: dicono di cosa parla il profilo.
#:
#: Pochi e larghi. Su un profilo B2B italiano di nicchia gli hashtag non
#: portano scoperta come su un profilo di viaggi: servono a far capire a chi
#: arriva di cosa si occupa questo posto, e a farsi trovare da chi cerca
#: esattamente quello.
HASHTAG_SEMPRE = ["#agenziaimmobiliare", "#agenteimmobiliare", "#immobiliare", "#proptech"]

#: Hashtag legati al pilastro: cambiano il taglio, non l'argomento.
HASHTAG_PILASTRO = {
    "Pain Point": ["#lavorodagente", "#produttivita"],
    "Educativo": ["#formazioneimmobiliare", "#consiglipratici"],
    "Demo Prodotto": ["#intelligenzaartificiale", "#automazione"],
    "Case Study": ["#casistudio", "#comefunziona"],
    "Social Proof": ["#gdpr", "#tecnologia"],
}

#: Hashtag specifici del singolo post, indicizzati dal titolo interno.
#:
#: In un dizionario e non dentro la tupla: aggiungere un tredicesimo campo a
#: venti tuple per due parole significa venti occasioni di sbagliare posizione,
#: e un hashtag finito nella colonna della CTA non lo nota nessuno finche' non
#: e' pubblicato.
HASHTAG_POST = {
    "Le 22:40 di un martedì": ["#whatsappbusiness", "#leadgeneration"],
    "Le 3 domande che cambiano la giornata": ["#qualificazionelead", "#venditaimmobiliare"],
    "Dal portale alla tua agenda": ["#immobiliareit", "#idealista"],
    "Il pomeriggio bruciato": ["#gestionetempo", "#leadqualificati"],
    "Su cosa gira davvero": ["#privacy", "#serverue"],
    "Il QR in vetrina che lavora di notte": ["#vetrina", "#qrcode"],
    "Perché i lead si raffreddano": ["#temporisposta", "#leadgeneration"],
    "La notifica persa": ["#portaliimmobiliari", "#organizzazione"],
    "Come si comporta con un venditore": ["#acquisizioneimmobili", "#mandato"],
    "Il vocale delle 19:30": ["#notevocali", "#reportvenditore"],
    "Tre ore a ricopiare": ["#visuracatastale", "#burocrazia"],
    "Cosa fa saltare un rogito": ["#rogito", "#duediligence"],
    "Il PDF che si legge da solo": ["#datigatastali", "#documenti"],
    "Il sabato di un agente": ["#visiteimmobiliari", "#sempreattivo"],
    "Prova senza carta": ["#provagratuita", "#nessunvincolo"],
    "L'appuntamento di acquisizione": ["#acquisizione", "#incarico"],
    "Il report che fa rinnovare": ["#mandatoinesclusiva", "#proprietari"],
    "Il lead d'oro che non guardi": ["#investitori", "#portafoglioimmobili"],
    "Fuori tema, nessuna risposta": ["#assistentevirtuale", "#whatsapp"],
    "Cosa non fa": ["#trasparenza", "#software"],
}


def caption_completa(post: Post) -> str:
    """
    La caption con i suoi hashtag, separati dal testo da una riga vuota.

    Separati e non mescolati nel discorso: un hashtag in mezzo a una frase la
    rende piu' difficile da leggere e non aggiunge portata. In fondo fanno il
    loro lavoro senza disturbare chi sta leggendo.
    """
    tag = HASHTAG_SEMPRE + HASHTAG_PILASTRO[post.pilastro] + HASHTAG_POST[post.titolo]
    return f"{post.caption}\n\n{' '.join(tag)}"

#: Come si dice a Predis che formato vuoi.
FORMATO_PREDIS = {
    "Reel": "un video verticale breve (Reel) di 8-12 secondi, formato 9:16",
    "Carosello": "un carosello di 5 schede, formato 4:5 verticale",
    "Post statico": "un post a immagine singola, formato 4:5 verticale",
    "Storia": "una storia verticale a schermo intero, formato 9:16",
}


def prompt_predis(post: Post) -> str:
    """
    Il testo da incollare nel campo «Create New» di Predis.ai.

    # Perché composto e non scritto venti volte

    Perche' la struttura e' identica per tutti — contesto, contenuto, stile,
    divieti, tono, chiusura — e cambia solo cio' che riguarda quel post. Venti
    prompt scritti a mano divergono al terzo ritocco: uno perde il divieto
    sulle schermate, un altro dimentica il formato, e sono proprio le due
    righe che separano una grafica utilizzabile da una da rifare.

    # Perché il contesto si ripete ogni volta

    Perche' Predis non ha memoria fra una generazione e l'altra. Un prompt che
    dice «il nostro software» senza spiegare quale produce l'immagine generica
    che farebbe qualunque agenzia di marketing per qualunque cliente.
    """
    return (
        f"Crea {FORMATO_PREDIS[post.formato]} per Instagram.\n\n"
        f"CONTESTO. {CONTESTO}\n\n"
        f"ARGOMENTO. {post.argomento} "
        f"Apri con questo concetto: \"{post.hook}\" — e' il punto in cui chi scorre si riconosce.\n\n"
        f"COSA SI VEDE. {post.soggetto}. {STILE}\n\n"
        f"TESTO SULLA GRAFICA. Scrivi in italiano, al massimo {MAX_PAROLE_SU_IMMAGINE} parole per "
        f"schermata, con ampio spazio libero attorno. Il testo principale deve essere: "
        f"\"{post.testo_schermo}\".\n\n"
        f"{DIVIETO}\n\n"
        f"{TONO}\n\n"
        f"CHIUSURA. Termina con questa chiamata all'azione: \"{post.cta}\"."
    )


def giorni_lavorativi(inizio: datetime.date, quanti: int) -> list[datetime.date]:
    """Le prime `quanti` date da lunedì a venerdì a partire da `inizio`."""
    date: list[datetime.date] = []
    giorno = inizio
    while len(date) < quanti:
        if giorno.weekday() < 5:
            date.append(giorno)
        giorno += datetime.timedelta(days=1)
    return date


def altezza_riga(celle: list[tuple[str, int]]) -> float:
    """
    Quanto alta deve essere la riga perché la cella più lunga si legga.

    Senza questo calcolo openpyxl lascia l'altezza predefinita e le celle con
    il prompt — che sono lunghe centinaia di caratteri — mostrano una riga
    sola: il piano sembra vuoto proprio nella colonna che conta di più.
    """
    righe = 1
    for testo, larghezza in celle:
        if not testo:
            continue
        for paragrafo in str(testo).split("\n"):
            righe = max(righe, -(-len(paragrafo) // max(larghezza - 2, 1)))
        righe = max(righe, str(testo).count("\n") + 1)
    return min(max(righe * 12.6, 22), 460)


def scrivi_piano(percorso: Path) -> None:
    wb = Workbook()
    foglio = wb.active
    foglio.title = "Piano Instagram"

    titolo_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    fill_titolo = PatternFill("solid", fgColor=BLU)
    corpo_font = Font(name="Arial", size=9)
    bordo = Border(*[Side(style="thin", color="C9D6E3")] * 4)

    for indice, (etichetta, larghezza) in enumerate(COLONNE, start=1):
        cella = foglio.cell(row=1, column=indice, value=etichetta)
        cella.font = titolo_font
        cella.fill = fill_titolo
        cella.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cella.border = bordo
        foglio.column_dimensions[get_column_letter(indice)].width = larghezza

    foglio.row_dimensions[1].height = 34

    date = giorni_lavorativi(INIZIO, len(POSTS))

    for riga, (giorno, post) in enumerate(zip(date, POSTS), start=2):
        settimana = (riga - 2) // 5 + 1
        valori = [
            giorno,
            f"S{settimana}",
            GIORNI_IT[giorno.weekday()],
            post.ora,
            post.formato,
            post.pilastro,
            post.titolo,
            post.hook,
            prompt_predis(post),
            post.testo_schermo,
            caption_completa(post),
            post.cta,
            post.leva,
            post.obiettivo,
        ]

        for colonna, valore in enumerate(valori, start=1):
            cella = foglio.cell(row=riga, column=colonna, value=valore)
            cella.font = corpo_font
            cella.border = bordo
            # Le colonne brevi si leggono meglio centrate; i testi lunghi vanno
            # a capo e si allineano in alto, o una riga alta trecento pixel
            # mette il suo contenuto a mezz'aria.
            if colonna <= 6 or colonna >= 13:
                cella.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            else:
                cella.alignment = Alignment(vertical="top", wrap_text=True)

        if riga % 2 == 0:
            for colonna in range(1, len(COLONNE) + 1):
                foglio.cell(row=riga, column=colonna).fill = PatternFill("solid", fgColor=GHIACCIO)

        foglio.cell(row=riga, column=1).number_format = "DD/MM/YYYY"
        foglio.row_dimensions[riga].height = altezza_riga(
            [(str(v), COLONNE[i][1]) for i, v in enumerate(valori)]
        )

    foglio.freeze_panes = "A2"
    foglio.auto_filter.ref = f"A1:{get_column_letter(len(COLONNE))}{len(POSTS) + 1}"

    scrivi_istruzioni(wb, titolo_font, fill_titolo, corpo_font)

    percorso.parent.mkdir(parents=True, exist_ok=True)
    wb.save(percorso)


def scrivi_istruzioni(
    wb: Workbook, font_titolo: Font, fill_titolo: PatternFill, font_corpo: Font
) -> None:
    """Una pagina di istruzioni: il piano lo usa chi non l'ha scritto."""
    foglio = wb.create_sheet("Istruzioni")
    foglio.column_dimensions["A"].width = 26
    foglio.column_dimensions["B"].width = 104

    titolo = foglio.cell(row=1, column=1, value="Come si usa questo piano")
    titolo.font = font_titolo
    titolo.fill = fill_titolo
    foglio.cell(row=1, column=2).fill = fill_titolo

    righe = [
        ("Periodo", f"Quattro settimane, cinque uscite a settimana (lunedì-venerdì), dal "
                    f"{INIZIO.strftime('%d/%m/%Y')}. Cambiando INIZIO nello script si sposta tutto."),
        ("Come si pubblica", "Un post al giorno su Instagram. Se il crossposting verso la pagina "
                             "Facebook è attivo, si pubblica da Instagram e il contenuto arriva "
                             "anche lì: non va ricaricato a mano."),
        ("Colonna PROMPT PREDIS", "È quella da usare: si copia INTERA e si incolla nel campo di "
                                  "«Create New» su Predis.ai, senza toccarla. Contiene contesto di "
                                  "prodotto, argomento, stile visivo, divieti, tono e CTA: tolto "
                                  "un pezzo, Predis lo riempie da sé e di solito male."),
        ("Colonna Testo a schermo", "Il testo che deve comparire sulla grafica o nella prima "
                                    "schermata del Reel. È già dentro il prompt, ed è ripetuto in "
                                    "colonna per poterlo correggere a mano dopo la generazione."),
        ("Colonna Caption", "Pronta da incollare sotto il post. Gli a capo sono già quelli giusti: "
                            "copia la cella, non riscriverla."),
        ("Hashtag", "Composti, non scritti a mano: quattro fissi che dicono di cosa parla il "
                    "profilo, due legati al pilastro e due al singolo post. Pochi e larghi di "
                    "proposito: su un profilo B2B italiano di nicchia gli hashtag non portano "
                    "scoperta come altrove, servono a farsi trovare da chi cerca esattamente "
                    "questo."),
        ("Pilastri", "Educativo, Demo Prodotto, Case Study, Pain Point, Social Proof. Il filtro "
                     "in testa alla colonna serve a controllare che una settimana non sia tutta "
                     "dello stesso tipo."),
        ("Case Study e Social Proof", "Non ci sono clienti citati né testimonianze: PropertyTech "
                                      "non ha ancora una base clienti da cui ricavarle. I case "
                                      "study sono SCENARI, dichiarati tali dentro la caption. La "
                                      "social proof è ciò che è verificabile: modello di "
                                      "Anthropic, canale ufficiale WhatsApp, server in UE, prova "
                                      "senza carta. Quando ci saranno clienti veri e d'accordo, "
                                      "quelle righe si sostituiscono."),
        ("Cosa NON dire", "Nessuna percentuale di risultato, nessun prezzo, e mai promettere che "
                          "l'AI risponda da sola ai commenti o ai DM, o che certifichi la "
                          "conformità antiriciclaggio: non lo fa, e il primo giorno di prova si "
                          "vede. Il divieto è scritto anche dentro ogni prompt, perché è Predis a "
                          "generare il testo sulla grafica."),
        ("Funzioni riservate", "Report vocali e Social & Annunci sono del piano Enterprise, e i "
                               "post che li mostrano lo dichiarano in caption."),
        ("Divieto sulle schermate", "Ogni prompt vieta screenshot di software e finte chat "
                                    "WhatsApp. Predis lasciato libero inventa interfacce con testi "
                                    "storti: un mockup sbagliato del nostro prodotto è peggio di "
                                    "nessuna immagine."),
        ("Come rigenerare", "python scripts/piano-instagram.py [percorso.xlsx]"),
    ]

    for indice, (etichetta, testo) in enumerate(righe, start=3):
        cella_etichetta = foglio.cell(row=indice, column=1, value=etichetta)
        cella_etichetta.font = Font(name="Arial", size=10, bold=True)
        cella_etichetta.alignment = Alignment(vertical="top", wrap_text=True)

        cella_testo = foglio.cell(row=indice, column=2, value=testo)
        cella_testo.font = font_corpo
        cella_testo.alignment = Alignment(vertical="top", wrap_text=True)
        foglio.row_dimensions[indice].height = max(30, -(-len(testo) // 100) * 26)


if __name__ == "__main__":
    percorso = Path(sys.argv[1]) if len(sys.argv) > 1 else DESTINAZIONE_PREDEFINITA
    scrivi_piano(percorso)
    print(f"Creato: {percorso}")
    print(f"Post: {len(POSTS)} su {len(COLONNE)} colonne")
