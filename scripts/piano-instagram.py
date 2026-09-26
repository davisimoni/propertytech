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

#: Il contesto per i post di valore puro.
#:
#: Diverso da quello di prodotto, e non per sfumatura. Un post che insegna a
#: fotografare una casa non deve contenere il nostro software nemmeno nel
#: prompt: se il contesto lo nomina, Predis lo fa comparire — un telefono con
#: una chat, una scrivania con un monitor — e il contenuto smette di essere un
#: consiglio e torna a essere pubblicita'. Chi guarda se ne accorge, ed e'
#: esattamente cio' che rende un profilo un catalogo.
CONTESTO_VALORE = (
    "Il contenuto e' formazione gratuita per agenti immobiliari italiani, pubblicata da "
    "PropertyTech. Non promuove nessun prodotto e non nomina nessun software: e' un consiglio "
    "operativo che chi lavora in agenzia puo' applicare domani mattina. Il pubblico e' fatto di "
    "titolari di agenzia, agenti e team leader italiani."
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

    #: "Valore" o "Prodotto".
    #:
    #: Non finisce in una colonna — le colonne sono quelle concordate — ma e'
    #: il campo che rende la proporzione verificabile invece che dichiarata.
    #: Senza, «il piano e' 80/20» resta un'intenzione che nessuno ricontrolla,
    #: e al terzo ritocco il profilo e' tornato un catalogo.
    tipo: str
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
    # ══════════════════════════ SETTIMANA 1
    (
        "Valore",
        "08:30",
        "Reel",
        "Acquisizione",
        "«Non voglio agenzie»",
        "«Grazie, faccio da solo.» Cosa dici nei tre secondi dopo?",
        "un citofono di un palazzo residenziale ripreso da vicino, mano che sta per suonare",
        "Come si risponde al proprietario che dice di non volere agenzie. La risposta sbagliata e' "
        "insistere sui servizi; quella che funziona e' dargli ragione e chiedere il permesso di "
        "tornare utile piu' avanti, lasciando una porta aperta invece di chiuderla.",
        "«Faccio da solo» non è un no",
        "«Grazie, faccio da solo.» 🚪\n\n"
        "Se rispondi elencando i tuoi servizi, hai perso: stai discutendo con la sua decisione.\n\n"
        "Quello che funziona e' dargli ragione, e chiedere poco:\n"
        "• «Fa benissimo, molti ci riescono.»\n"
        "• «Posso lasciarle il mio numero per quando le serve un parere, anche senza incarico?»\n"
        "• «Se fra due mesi e' ancora in vendita, la richiamo? Se mi dice di no, non la disturbo piu'.»\n\n"
        "Non stai vendendo niente. Stai comprando il diritto di risentirlo, che e' l'unica cosa che "
        "serve adesso.\n\n"
        "Una buona parte degli immobili messi in vendita da privati finisce comunque in agenzia. "
        "Non subito: dopo.",
        "Tu come rispondi a «faccio da solo»? Scrivi la tua frase nei commenti",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Valore",
        "18:30",
        "Carosello",
        "Marketing",
        "Foto con lo smartphone",
        "Le foto di un annuncio si fanno con il telefono. Male, però, no.",
        "una mano che regge uno smartphone in orizzontale inquadrando un salotto luminoso",
        "Cinque regole pratiche per fotografare un immobile con lo smartphone: la luce, l'altezza "
        "dell'obiettivo, gli angoli, cosa togliere dall'inquadratura e l'orizzonte dritto. Consigli "
        "eseguibili subito, senza attrezzatura.",
        "5 regole, zero attrezzatura",
        "Non serve un fotografo per ogni immobile. Serve smettere di fare questi cinque errori. 📸\n\n"
        "1. **Luce**: spegni i lampadari e apri le tapparelle. La luce mista fa le pareti gialle.\n"
        "2. **Altezza**: telefono all'altezza del petto, non degli occhi. Le stanze sembrano piu' alte.\n"
        "3. **Angolo**: mettiti in un angolo della stanza, non al centro della parete.\n"
        "4. **Orizzonte dritto**: attiva la griglia. Una foto storta si nota anche senza saper dire perche'.\n"
        "5. **Togli**: lo scolapiatti, il tappetino del bagno, i prodotti sul lavandino. Tre minuti.\n\n"
        "L'immobile e' lo stesso. Le visite richieste, no.",
        "Salva il post e usalo al prossimo sopralluogo",
        "Semplicità",
        "Brand Awareness",
    ),
    (
        "Prodotto",
        "12:30",
        "Post statico",
        "Pain Point",
        "Le 22:40 di un martedì",
        "Il lead più caldo della settimana ti scrive alle 22:40. Tu dormi.",
        "uno smartphone appoggiato sul comodino che si illumina al buio, camera in penombra",
        "Il momento in cui arriva una richiesta da un portale fuori orario e nessuno puo' "
        "rispondere. La mattina dopo quella persona ha gia' scritto ad altre tre agenzie.",
        "Alle 22:40 rispondi o dormi?",
        "Le richieste dai portali non arrivano in orario d'ufficio. 🌙\n\n"
        "Arrivano alle 22:40, di domenica, mentre sei a cena. E chi cerca casa non aspetta: scrive "
        "a tre agenzie e parla con la prima che risponde.\n\n"
        "PropertyTech risponde al posto tuo su WhatsApp, fa le tre domande di qualificazione e ti "
        "lascia in agenda solo chi vale un appuntamento.\n\n"
        "Il sonno resta tuo.",
        "Scrivi DEMO nei commenti e ti mando il link della prova gratuita",
        "FOMO",
        "Lead Generation",
    ),
    (
        "Valore",
        "19:00",
        "Reel",
        "Mercato",
        "Il prezzo fuori mercato",
        "Il proprietario vuole 380. Il mercato dice 320. Come glielo dici?",
        "un tavolo con due tazze di caffe' e un foglio stampato al centro, luce di pomeriggio",
        "Come si affronta il colloquio sul prezzo con un proprietario convinto che la sua casa "
        "valga di piu'. La tecnica: non contraddirlo, mostrargli i dati e lasciare che sia lui a "
        "concludere, con una data di verifica concordata.",
        "Non dirglielo. Faglielo vedere.",
        "Dire «il prezzo e' troppo alto» non ha mai fatto abbassare un prezzo. 📉\n\n"
        "Quello che funziona:\n\n"
        "**1. Non discutere il numero.** «Capisco perche' dice 380: la casa e' tenuta bene.»\n"
        "**2. Mostra i comparabili.** Tre immobili simili, stessa zona: due venduti e a quanto, uno "
        "fermo da otto mesi e a quanto e' in vendita. Stampali.\n"
        "**3. Fai la domanda.** «Secondo lei chi cerca in zona, vedendo questi tre, quale chiama "
        "per primo?»\n"
        "**4. Concorda una verifica.** «Partiamo da 380. Se fra tre settimane non abbiamo cinque "
        "richieste, ci risentiamo e decide lei.»\n\n"
        "Non hai vinto una discussione. Hai messo una data in calendario in cui i fatti parlano al "
        "posto tuo.",
        "Salva questo post per il prossimo proprietario indeciso",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Valore",
        "17:30",
        "Storia",
        "Gestione tempo",
        "Il weekend che non è tuo",
        "Sabato alle 19. Il telefono squilla. Rispondi?",
        "un telefono posato a faccia in giu' su un tavolo apparecchiato, sera, casa",
        "Il confine fra essere disponibili ed essere sempre reperibili, e perche' non averlo "
        "definito e' una delle cause principali di esaurimento nel mestiere dell'agente. Tre "
        "regole pratiche per stabilirlo senza perdere clienti.",
        "Disponibile ≠ sempre reperibile",
        "«Se non rispondo, chiamano un altro.» 📵\n\n"
        "E' vero per il primo contatto. Non e' vero per un cliente che gia' ti ha scelto — e quasi "
        "tutte le chiamate del sabato sera sono di quel tipo.\n\n"
        "Tre cose che funzionano:\n"
        "• **Dillo prima.** «Le rispondo entro le 20, dopo le 20 domani mattina presto.» Detto al "
        "primo incontro, nessuno se ne ha a male.\n"
        "• **Una fascia, non un orario.** «Dalle 9 alle 20» e' credibile. «Sempre» non lo e' e si "
        "vede.\n"
        "• **Un'eccezione dichiarata.** «Se c'e' una proposta in corso, mi chiami quando vuole.» "
        "Cosi' l'eccezione resta tale.\n\n"
        "Un agente bruciato in tre anni non ha aiutato nessuno, nemmeno i clienti.",
        "Tu hai un orario, o rispondi sempre? Scrivimelo",
        "Semplicità",
        "Brand Awareness",
    ),
    # ══════════════════════════ SETTIMANA 2
    (
        "Valore",
        "08:30",
        "Reel",
        "Acquisizione",
        "Il mirroring al telefono",
        "Se parli più veloce di lui, ti sta già ascoltando a metà.",
        "un auricolare appoggiato su una scrivania accanto a un taccuino aperto",
        "La tecnica del rispecchiamento in una telefonata di acquisizione: adeguare ritmo, volume e "
        "vocabolario dell'interlocutore, e ripetere le sue ultime parole per farlo continuare. "
        "Spiegata come strumento di ascolto, non come manipolazione.",
        "Il suo ritmo, non il tuo",
        "Al telefono non ti giudicano per quello che dici. Ti giudicano per come suoni. 🎧\n\n"
        "**Il ritmo.** Se lui parla lento e tu corri, sembri uno che vuole chiudere. Rallenta.\n\n"
        "**Le sue parole.** Se dice «casetta», non dire «unita' immobiliare». Se dice «ci stiamo "
        "pensando», non dire «siete in fase decisionale».\n\n"
        "**L'eco.** Ripeti le sue ultime tre parole con tono interrogativo. «...non abbiamo "
        "fretta?» E lui continua, e ti dice il vero motivo.\n\n"
        "Non e' una tecnica per convincere. E' una tecnica per farlo parlare abbastanza da capire "
        "cosa gli serve davvero.",
        "Provala alla prossima chiamata e dimmi com'è andata nei commenti",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Valore",
        "18:30",
        "Carosello",
        "Marketing",
        "Descrizioni che convertono",
        "«Ampio e luminoso trilocale.» Come altri quattromila annunci.",
        "una scrivania con un computer portatile chiuso e un blocco per appunti scritto a mano",
        "Come si scrive la descrizione di un annuncio che fa chiamare: partire da chi ci vivra' e "
        "non dai metri quadri, nominare un dettaglio concreto e verificabile, e chiudere con "
        "l'informazione che tutti cercano e pochi scrivono.",
        "Scrivi per chi ci abiterà",
        "«Ampio e luminoso trilocale in zona servita.» ✍️\n\n"
        "Descrive quattromila case. Quindi non ne descrive nessuna.\n\n"
        "**Parti da chi ci vivra'**, non dai metri quadri: «La cucina guarda il cortile interno: "
        "la mattina ci si fa colazione col sole.»\n\n"
        "**Un dettaglio concreto** batte tre aggettivi: «Infissi cambiati nel 2021» dice piu' di "
        "«ottime finiture».\n\n"
        "**Scrivi cosa non va.** «Il bagno e' da rifare» fa arrivare solo chi e' disposto a farlo, "
        "e ti toglie cinque visite inutili.\n\n"
        "**Chiudi con le spese.** Condominio, riscaldamento, classe energetica. Chi le cerca e non "
        "le trova chiama un altro annuncio.",
        "Salva il post e riscrivi il tuo annuncio più vecchio",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Prodotto",
        "12:30",
        "Post statico",
        "Demo Prodotto",
        "Dal portale alla tua agenda",
        "Richiesta da Immobiliare.it alle 21:10. Appuntamento in agenda alle 21:14.",
        "un'agenda cartacea aperta sulla settimana con un appuntamento segnato a penna",
        "Il percorso completo di un contatto: arriva dal portale, l'assistente scrive su WhatsApp, "
        "fa le domande, propone gli orari liberi dell'agente e fissa l'appuntamento in agenda.",
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
        "Valore",
        "19:00",
        "Reel",
        "Gestione tempo",
        "I sopralluoghi sparsi",
        "Tre sopralluoghi in tre quartieri diversi. E la giornata è finita.",
        "un'automobile parcheggiata in una via residenziale, vista dall'interno attraverso il parabrezza",
        "Come organizzare visite e sopralluoghi per zona e per fascia oraria invece che per ordine "
        "di arrivo, e quanto tempo si recupera. Consiglio operativo puro, niente software.",
        "Raggruppa per zona, non per ordine",
        "Tre sopralluoghi in tre quartieri diversi: due ore di macchina per tre ore di lavoro. 🚗\n\n"
        "Quello che cambia la settimana:\n\n"
        "**Dividi la citta' in tre zone** e assegna a ognuna due mezze giornate fisse. «In centro "
        "il martedi' pomeriggio e il venerdi' mattina.»\n\n"
        "**Proponi la fascia, non l'orario.** «Sono in zona giovedi' pomeriggio, le va bene fra le "
        "15 e le 18?» Quasi nessuno dice di no, e tu incastri tre visite.\n\n"
        "**Tieni un'ora vuota** in ogni blocco. Se non serve, fai chiamate dalla macchina. Se "
        "serve, non ti salta tutto il pomeriggio.\n\n"
        "Stesse visite, due ore in meno alla settimana. Sono cento ore all'anno.",
        "Tu come organizzi le visite? Per zona o per ordine di arrivo? Scrivilo nei commenti",
        "Risparmio di tempo",
        "Brand Awareness",
    ),
    (
        "Valore",
        "17:30",
        "Storia",
        "Mercato",
        "Parlare di tassi senza spaventare",
        "«Con questi tassi non conviene comprare.» Come si risponde?",
        "un documento bancario e una calcolatrice su un tavolo, luce naturale",
        "Come comunicare il costo del mutuo a un acquirente preoccupato: non minimizzare, non "
        "citare numeri a memoria, e spostare il ragionamento dalla rata al confronto con "
        "l'affitto e alla possibilita' di surroga. Senza mai dare consulenza finanziaria.",
        "La rata non è il prezzo",
        "«Con questi tassi non conviene.» 🏦\n\n"
        "Rispondere «ma no, sono bassi» ti fa perdere credibilita' in tre secondi. Meglio:\n\n"
        "**Non citare tassi a memoria.** Cambiano, e un numero sbagliato detto da te diventa una "
        "promessa. «Le faccio parlare con chi li aggiorna ogni giorno.»\n\n"
        "**Sposta il confronto.** Non «rata contro zero», ma «rata contro l'affitto che paga "
        "adesso». E' il paragone che quella persona sta gia' facendo in testa.\n\n"
        "**Nomina la surroga.** Il tasso di oggi non e' quello dei prossimi vent'anni, e dirlo "
        "toglie il peso della decisione definitiva.\n\n"
        "Tu non sei un consulente finanziario, e non devi fingerlo. Devi solo non lasciare la "
        "paura senza risposta.",
        "Salva il post per la prossima obiezione sul mutuo",
        "Autorità",
        "Brand Awareness",
    ),
    # ══════════════════════════ SETTIMANA 3
    (
        "Valore",
        "08:30",
        "Reel",
        "Acquisizione",
        "Farsi lasciare l'esclusiva",
        "L'esclusiva non si chiede. Si rende la scelta ovvia.",
        "una penna appoggiata su un foglio firmato, dettaglio ravvicinato, luce da ufficio",
        "Come ottenere un incarico in esclusiva senza chiederlo come favore: spiegare cosa cambia "
        "concretamente per il proprietario, mettere una scadenza breve e assumersi un impegno "
        "verificabile.",
        "Non chiederla. Rendila ovvia.",
        "«Mi darebbe l'esclusiva?» e' la domanda che fa dire di no. 🤝\n\n"
        "Perche' chiede a lui di rinunciare a qualcosa, in cambio di niente.\n\n"
        "Quello che funziona e' ribaltarla:\n\n"
        "**Spiega cosa cambia per lui.** Senza esclusiva il suo immobile compare su tre annunci "
        "con tre prezzi diversi, e chi lo vede pensa che sia trattabile. Con l'esclusiva c'e' un "
        "prezzo solo.\n\n"
        "**Metti una scadenza corta.** «Tre mesi. Se non ho fatto quello che le ho detto, non "
        "rinnoviamo.» Tre mesi non spaventano nessuno.\n\n"
        "**Prenditi un impegno verificabile.** «Un aggiornamento scritto dopo ogni visita.» E' una "
        "cosa che puo' controllare, quindi ci crede.\n\n"
        "L'esclusiva la danno a chi si assume un rischio, non a chi la chiede.",
        "Tu come gestisci l'obiezione sull'esclusiva? Scrivimelo nei commenti",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Valore",
        "18:30",
        "Carosello",
        "Marketing",
        "Reel per mostrare una casa",
        "Un Reel di una casa non è un video della casa.",
        "una mano che regge uno smartphone in verticale mentre attraversa la soglia di una stanza",
        "Come girare un Reel di un immobile: il percorso invece delle stanze singole, la camminata "
        "lenta e continua, cosa mostrare nei primi due secondi e perche' non serve musica "
        "trionfale. Consigli eseguibili con il solo telefono.",
        "Un percorso, non un elenco",
        "Il Reel di una casa non e' l'album fotografico messo in fila. 🎬\n\n"
        "**Racconta un percorso.** Entra dalla porta e cammina come camminerebbe chi ci abita: "
        "ingresso, cucina, la stanza piu' bella per ultima.\n\n"
        "**Cammina lento.** Telefono in verticale, due mani, passi corti. Il tremolio e' l'unica "
        "cosa che fa scorrere via.\n\n"
        "**I primi due secondi** devono mostrare la cosa migliore. Non l'ingresso: il terrazzo, la "
        "vista, il soffitto alto.\n\n"
        "**Niente musica epica.** Un suono ambientale o una voce tua che dice tre cose vere valgono "
        "di piu'.\n\n"
        "Chi guarda non vuole vedere la casa. Vuole immaginarsi dentro.",
        "Salva il post e provalo al prossimo immobile",
        "Semplicità",
        "Brand Awareness",
    ),
    (
        "Prodotto",
        "12:30",
        "Post statico",
        "Demo Prodotto",
        "Il QR in vetrina che lavora di notte",
        "La tua vetrina è aperta 24 ore. Peccato che nessuno risponda.",
        "una vetrina di agenzia immobiliare vista dalla strada di sera, annunci illuminati",
        "Il QR code in vetrina o sul flyer: chi passa davanti alle 23 lo inquadra, apre WhatsApp e "
        "l'assistente comincia a parlargli, qualificandolo prima del mattino dopo.",
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
        "Valore",
        "19:00",
        "Reel",
        "Mercato",
        "Fermo da tre mesi",
        "L'immobile è fermo da tre mesi e il proprietario incolpa te.",
        "una cassetta delle lettere piena su un muro esterno, luce di fine giornata",
        "Cosa fare quando un immobile non si muove e il rapporto col proprietario si incrina: come "
        "riprendere l'iniziativa con i dati delle visite e una proposta concreta invece di "
        "aspettare la telefonata di lamentela.",
        "Chiamalo tu, prima che chiami lui",
        "Tre mesi senza proposte. La prossima telefonata e' la sua, e non sara' piacevole. 📪\n\n"
        "A meno che non la faccia tu, prima.\n\n"
        "**Porta i numeri che hai.** Quante volte l'annuncio e' stato visto, quante richieste, "
        "quante visite, e cosa hanno detto quelli che sono venuti. Anche se sono numeri brutti.\n\n"
        "**Di' cosa hai capito.** «Tutti e quattro hanno detto la stessa cosa sul bagno.» Un "
        "riscontro ripetuto non e' un'opinione: e' il mercato che parla.\n\n"
        "**Arriva con una proposta**, non con un problema: nuove foto, prezzo, o entrambe.\n\n"
        "Il mandato non si perde perche' la casa non si vende. Si perde perche' il proprietario "
        "scopre da solo che non si sta vendendo.",
        "Salva il post per il prossimo immobile fermo",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Valore",
        "17:30",
        "Storia",
        "Mercato",
        "La controproposta",
        "Offerta 290 su 320. Il venditore si offende. Tu che fai?",
        "due sedie una di fronte all'altra davanti a un tavolo, stanza luminosa, nessuno in scena",
        "Come si gestisce una controproposta senza far saltare la trattativa: separare il numero "
        "dalla persona, riportare il ragionamento dell'acquirente e proporre un passo alla volta.",
        "Il numero non è un giudizio",
        "«290? Ma questi mi stanno prendendo in giro.» 🤝\n\n"
        "Una proposta bassa non e' una mancanza di rispetto. E' quasi sempre la paura di offrire "
        "troppo di chi non sa se ci sono altri interessati.\n\n"
        "**Separa il numero dalla persona.** «Hanno fatto un'offerta, non un giudizio sulla casa.»\n\n"
        "**Porta il loro ragionamento.** «Hanno visto quello in via Verdi a 300 e pensano di poter "
        "trattare.» Adesso si discute di mercato, non di orgoglio.\n\n"
        "**Un passo alla volta.** Non «accetta o rifiuta»: «facciamo 310 e vediamo cosa dicono».\n\n"
        "Le trattative non saltano sul prezzo. Saltano quando qualcuno si sente sminuito.",
        "Salva il post per la prossima controproposta difficile",
        "Autorità",
        "Brand Awareness",
    ),
    # ══════════════════════════ SETTIMANA 4
    (
        "Valore",
        "08:30",
        "Reel",
        "Acquisizione",
        "Il primo contatto col proprietario",
        "Hai 30 secondi al telefono con un privato. Non usarli per presentarti.",
        "un cartello vendesi di un privato appeso a una finestra, ripreso dalla strada",
        "Cosa dire nei primi trenta secondi di una chiamata a un privato che vende da solo: non "
        "presentare l'agenzia ma fare una domanda utile a lui, e chiedere pochissimo.",
        "Non presentarti. Chiedi.",
        "«Buongiorno, sono Marco dell'agenzia X, ci occupiamo di...» 📞\n\n"
        "Ha gia' smesso di ascoltare. Ne ha ricevute sei questa settimana.\n\n"
        "Quello che funziona nei primi trenta secondi:\n\n"
        "**Una domanda, non una presentazione.** «Buongiorno, ho visto il cartello in via Roma: "
        "sta vendendo da solo o si appoggia a qualcuno?»\n\n"
        "**Una informazione utile subito**, gratis: «Le dico una cosa che le serve comunque: in "
        "quella zona in questo momento ci sono altri quattro annunci simili.»\n\n"
        "**Chiedi pochissimo.** Non l'appuntamento: il permesso di richiamare.\n\n"
        "Il primo obiettivo non e' l'incarico. E' non essere la settima chiamata da buttare.",
        "Qual è la tua prima frase al telefono? Scrivila nei commenti",
        "Autorità",
        "Brand Awareness",
    ),
    (
        "Prodotto",
        "18:30",
        "Carosello",
        "Social Proof",
        "Prova senza carta",
        "Nessuna carta di credito. Nessuna migrazione. Due minuti.",
        "uno smartphone in mano in un ufficio luminoso, tazza di caffe' sulla scrivania, mattino",
        "Come si prova il prodotto: registrazione in due minuti, nessuna carta di credito, nessun "
        "cambio di gestionale, i dati restano dell'agenzia, server in Unione Europea.",
        "Due minuti. Nessuna carta.",
        "La domanda vera non e' «funziona?». E' «quanto mi costa scoprirlo?». ⏱️\n\n"
        "• Nessuna carta di credito\n"
        "• Nessuna migrazione: il tuo gestionale resta dov'e'\n"
        "• Due minuti per attivarlo\n"
        "• I dati restano tuoi, server in Unione Europea\n\n"
        "Se non fa per te lo chiudi e non e' successo niente.",
        "Link in bio per la prova gratuita",
        "Semplicità",
        "Conversione",
    ),
    (
        "Valore",
        "12:30",
        "Post statico",
        "Marketing",
        "L'ordine delle foto",
        "La seconda foto dell'annuncio decide se arrivano alla terza.",
        "una serie di stampe fotografiche disposte in fila su un tavolo di legno",
        "In che ordine vanno messe le foto di un annuncio: quale mettere per prima, perche' la "
        "seconda e' quella che trattiene, dove mettere il bagno e perche' la planimetria non va "
        "in fondo.",
        "La 2ª foto trattiene o perde",
        "L'ordine delle foto conta quanto le foto. 🖼️\n\n"
        "**La prima** e' la piu' bella, non l'ingresso. E' l'unica che vedono nella lista degli "
        "annunci: se non ferma il pollice, le altre venti non esistono.\n\n"
        "**La seconda** deve dare il contesto: la stanza principale per intero, cosi' capiscono "
        "com'e' fatta la casa. E' quella che li porta alla terza.\n\n"
        "**Il bagno a meta'**, mai per ultimo: chi arriva in fondo e trova il bagno esce con quella "
        "immagine in testa.\n\n"
        "**La planimetria fra le prime cinque.** Chi cerca casa davvero la guarda subito, e se non "
        "la trova pensa che ci sia qualcosa da nascondere.",
        "Salva il post e riordina le foto del tuo ultimo annuncio",
        "Semplicità",
        "Brand Awareness",
    ),
    (
        "Prodotto",
        "19:00",
        "Reel",
        "Social Proof",
        "Cosa non fa",
        "Ci sono tre cose che questo software non fa. Meglio dirle.",
        "una finestra di ufficio con le veneziane socchiuse, luce del tardo pomeriggio",
        "Trasparenza sui limiti del prodotto: non risponde da solo ai commenti o ai messaggi "
        "diretti, il fascicolo documentale non certifica nulla ai fini antiriciclaggio, e la firma "
        "digitale non c'e'. I limiti dichiarati come prova di serieta'.",
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
    (
        "Valore",
        "17:30",
        "Storia",
        "Gestione tempo",
        "Il lavoro che non finisce mai",
        "Non esiste un momento in cui hai finito. Ed è questo il problema.",
        "una scrivania di ufficio al buio con una sola lampada accesa, sera tardi",
        "Perche' il mestiere dell'agente immobiliare non ha un punto di arrivo naturale e come "
        "questo porta all'esaurimento: tre abitudini concrete per crearsi una fine di giornata "
        "anche quando il lavoro non finisce.",
        "Decidi tu quando è finita",
        "In fabbrica suona una sirena. Qui no. 🌙\n\n"
        "C'e' sempre un annuncio da sistemare, un proprietario da richiamare, un contatto da "
        "riprendere. Il lavoro non finisce: si interrompe solo quando crolli.\n\n"
        "Tre cose che aiutano davvero:\n\n"
        "**Un rito di chiusura.** Anche di due minuti: scrivi le tre cose di domani e chiudi il "
        "portatile. Il cervello ha bisogno di un segnale.\n\n"
        "**Una cosa sola al giorno che conta.** Se fai quella, la giornata e' andata bene anche se "
        "il resto e' rimasto li'.\n\n"
        "**Un giorno intero libero.** Non mezza giornata: un giorno. Mezza giornata la occupa "
        "sempre qualcuno.\n\n"
        "Nessuno ti fara' i complimenti per aver lavorato la domenica.",
        "Tu come chiudi la giornata? Raccontamelo nei commenti",
        "Semplicità",
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
    "Acquisizione": ["#acquisizione", "#formazioneimmobiliare"],
    "Marketing": ["#marketingimmobiliare", "#consiglipratici"],
    "Gestione tempo": ["#produttivita", "#vitadaagente"],
    "Mercato": ["#mercatoimmobiliare", "#trattativa"],
    "Pain Point": ["#lavorodagente", "#produttivita"],
    "Demo Prodotto": ["#intelligenzaartificiale", "#automazione"],
    "Social Proof": ["#gdpr", "#tecnologia"],
}

#: Hashtag specifici del singolo post, indicizzati dal titolo interno.
#:
#: In un dizionario e non dentro la tupla: aggiungere un tredicesimo campo a
#: venti tuple per due parole significa venti occasioni di sbagliare posizione,
#: e un hashtag finito nella colonna della CTA non lo nota nessuno finche' non
#: e' pubblicato.
HASHTAG_POST = {
    "«Non voglio agenzie»": ["#acquisizioneimmobili", "#obiezioni"],
    "Foto con lo smartphone": ["#fotografiaimmobiliare", "#homestaging"],
    "Le 22:40 di un martedì": ["#whatsappbusiness", "#leadgeneration"],
    "Il prezzo fuori mercato": ["#valutazioneimmobiliare", "#prezzodivendita"],
    "Il weekend che non è tuo": ["#equilibrio", "#burnout"],
    "Il mirroring al telefono": ["#tecnichedivendita", "#comunicazione"],
    "Descrizioni che convertono": ["#copywriting", "#annunciimmobiliari"],
    "Dal portale alla tua agenda": ["#immobiliareit", "#idealista"],
    "I sopralluoghi sparsi": ["#organizzazione", "#gestionetempo"],
    "Parlare di tassi senza spaventare": ["#mutuo", "#tassidiinteresse"],
    "Farsi lasciare l'esclusiva": ["#esclusiva", "#mandato"],
    "Reel per mostrare una casa": ["#videoimmobiliare", "#reel"],
    "Il QR in vetrina che lavora di notte": ["#vetrina", "#qrcode"],
    "Fermo da tre mesi": ["#strategiadivendita", "#proprietari"],
    "La controproposta": ["#trattativa", "#negoziazione"],
    "Il primo contatto col proprietario": ["#prospecting", "#acquisizione"],
    "Prova senza carta": ["#provagratuita", "#nessunvincolo"],
    "L'ordine delle foto": ["#annuncioimmobiliare", "#marketingimmobiliare"],
    "Cosa non fa": ["#trasparenza", "#software"],
    "Il lavoro che non finisce mai": ["#benessere", "#vitadaagente"],
}


def _senza_markdown(testo: str) -> str:
    """
    Toglie il grassetto e lo trasforma in un a capo.

    # Perché serve

    Perché Instagram non rende il markdown: `**cosi'**` compare nel post con
    gli asterischi. Una caption che sembra codice mal formattato la si
    riconosce a colpo d'occhio come copiata da qualche parte, ed è il genere di
    difetto che nessun conteggio trova e che chiunque veda il post nota.

    # Perché un a capo e non una cancellazione

    Perché il grassetto apriva una riga di sintesi seguita dalla spiegazione:
    toglierlo e basta le fonderebbe in un blocco unico, cioè in un muro di
    testo. L'a capo su Instagram è il modo vero di scandire un testo lungo, e
    la scansione era esattamente il motivo per cui c'era il grassetto.
    """
    fuori = []
    for paragrafo in testo.split("\n"):
        if paragrafo.startswith("**") and "**" in paragrafo[2:]:
            chiusura = paragrafo.index("**", 2)
            guida = paragrafo[2:chiusura]
            resto = paragrafo[chiusura + 2 :].strip()
            fuori.append(f"{guida}\n{resto}" if resto else guida)
        else:
            fuori.append(paragrafo.replace("**", ""))
    return "\n".join(fuori)


def caption_completa(post: Post) -> str:
    """
    La caption con i suoi hashtag, separati dal testo da una riga vuota.

    Separati e non mescolati nel discorso: un hashtag in mezzo a una frase la
    rende piu' difficile da leggere e non aggiunge portata. In fondo fanno il
    loro lavoro senza disturbare chi sta leggendo.
    """
    tag = HASHTAG_SEMPRE + HASHTAG_PILASTRO[post.pilastro] + HASHTAG_POST[post.titolo]
    return f"{_senza_markdown(post.caption)}\n\n{' '.join(tag)}"

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
    # Sui post di valore la scena e' quella del mestiere, non quella del
    # software: un sopralluogo, una trattativa, il telefono in mano davanti a
    # un portone. Detto esplicitamente perche' Predis, sentendo "software",
    # disegna comunque una scrivania con un monitor.
    ambientazione = (
        "Ambientazione: una scena reale della giornata di un agente immobiliare italiano "
        "(sopralluogo, trattativa al tavolo, foto con lo smartphone, lavoro in agenzia). "
        "Niente riferimenti visivi a software o tecnologia. "
        if post.tipo == "Valore"
        else ""
    )

    return (
        f"Crea {FORMATO_PREDIS[post.formato]} per Instagram.\n\n"
        f"CONTESTO. {CONTESTO_VALORE if post.tipo == 'Valore' else CONTESTO}\n\n"
        f"ARGOMENTO. {post.argomento} "
        f"Apri con questo concetto: \"{post.hook}\" — e' il punto in cui chi scorre si riconosce.\n\n"
        f"COSA SI VEDE. {post.soggetto}. {ambientazione}{STILE}\n\n"
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
        ("Pilastri", "Quattro di valore — Acquisizione, Marketing, Gestione tempo, Mercato — e tre "
                     "di prodotto: Pain Point, Demo Prodotto, Social Proof. Il filtro in testa "
                     "alla colonna serve a vedere se una settimana e' sbilanciata su un "
                     "argomento solo."),
        ("Equilibrio 75/25", "Quindici post su venti sono valore puro: consigli operativi che un "
                             "agente puo' applicare domani, senza nominare il software. I "
                             "cinque di prodotto sono riconoscibili dal pilastro (Pain Point, "
                             "Demo Prodotto, Social Proof) e sono gli unici con una CTA che "
                             "porta alla prova. Mai piu' di due per settimana."),
        ("CTA dei post di valore", "Chiedono di salvare il post o di rispondere nei commenti, "
                                   "mai di provare il software. Un consiglio che finisce in "
                                   "pubblicita' smette di essere un consiglio, e chi legge se "
                                   "ne accorge alla seconda volta."),
        ("Social Proof", "Non ci sono clienti citati né testimonianze: PropertyTech "
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
    valore = sum(1 for p in POSTS if p.tipo == "Valore")
    print(f"Post: {len(POSTS)} su {len(COLONNE)} colonne")
    print(
        f"Equilibrio: {valore} di valore puro e {len(POSTS) - valore} di prodotto "
        f"({round(valore / len(POSTS) * 100)}% / {round((len(POSTS) - valore) / len(POSTS) * 100)}%)"
    )
