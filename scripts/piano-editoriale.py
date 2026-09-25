"""
Genera il piano editoriale mensile di PropertyTech in formato .xlsx.

# Perché uno script e non un file scritto a mano

Perché il piano si rifà ogni mese: le date cambiano, i temi ruotano, il numero
di post per settimana può variare. Uno script si rilancia cambiando una
costante; un file compilato a mano va riscritto da capo, e alla terza volta
qualcuno sbaglia una data.

# Cosa NON c'è dentro, di proposito

**Nessuna percentuale di risultato.** Niente "+40% di appuntamenti" o "riduci
l'80% del tempo": PropertyTech non ha una base clienti da cui ricavarle, e
pubblicarle sarebbe pubblicità ingannevole verso un'agenzia che decide se
abbonarsi. Vale la stessa regola della sezione "numeri" della landing.

**Nessun prezzo.** I piani cambiano; un post resta online. Si rimanda alla
prova gratuita, che è vera e non scade.

**Niente funzioni che il prodotto non ha.** In particolare: l'AI non risponde
da sola ai commenti o ai messaggi diretti, e la checklist di conformità non
certifica nulla. Un post che promette l'una o l'altra cosa crea un'aspettativa
che il primo giorno di prova smentisce.

**Le funzioni riservate sono dichiarate tali.** Report vocali e Social &
Annunci sono del piano Enterprise: un post che li mostra senza dirlo porta in
prova gente che non li troverà.

# Come sono distribuiti i contenuti

**Instagram e Facebook sono una piattaforma sola.** Le due pagine sono
collegate e il crossposting è attivo: si pubblica da Instagram e il contenuto
compare anche su Facebook. Nel piano compaiono quindi come "Instagram /
Facebook", una riga per entrambe — un post caricato due volte sarebbe lavoro
doppio e due copie nello stesso feed.

**I Reel stanno lì, le immagini singole su LinkedIn.** Il video verticale è
quello che i due algoritmi di Meta spingono, quindi ogni settimana un post a
immagine singola diventa un Reel. Su LinkedIn resta l'immagine singola, dove
un post statico con un testo lungo rende ancora meglio.

**Un post su tre chiede un commento invece di un clic.** La CTA di conversione
si alterna con una domanda diretta sul lavoro dell'agenzia: è il commento a
far uscire un post dal giro di chi già ci segue. Sui post con la domanda il
link non c'è, ed è voluto (`usa_cta_interazione`).

# Uso

    python scripts/piano-editoriale.py [percorso.xlsx]
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
    r"C:\Users\david\OneDrive\Desktop\PropertyTech\Piano_Editoriale_PropertyTech.xlsx"
)

# Il piano parte dal primo lunedì utile: cinque uscite a settimana, da lunedì a
# venerdì. Il fine settimana resta fuori perché il pubblico è professionale e
# legge negli orari di lavoro.
INIZIO = datetime.date(2026, 9, 28)

COLONNE = [
    ("Data", 12),
    ("Ora", 8),
    ("Piattaforma", 13),
    ("Formato", 18),
    ("Oggetto/Tema", 22),
    ("Hook / Prima Riga", 46),
    ("Copy Completo", 78),
    ("Prompt Visuale per Predis.ai", 64),
    ("Prompt Definitivo Predis.ai", 88),
    ("Hashtag", 36),
]

# Quante parole di testo può portare una grafica prima di diventare illeggibile
# su un telefono. Il numero sta nel prompt perché Predis, lasciato libero,
# riempie l'immagine di frasi.
MAX_PAROLE_SU_IMMAGINE = 12

"""
Obiettivo per tema, non per post.

L'obiettivo di un contenuto dipende dal tema, non dalla singola uscita: tenerlo
qui evita venti frasi scritte a mano che dicono la stessa cosa in venti modi
diversi, ed è proprio quella deriva a far sembrare un piano editoriale un
insieme di post scollegati.
"""
OBIETTIVI: dict[str, str] = {
    "Burocrazia": "far riconoscere all'agente il tempo che perde in lavoro amministrativo, "
    "e mostrargli che è automatizzabile",
    "Report Venditori": "convincere il titolare che informare il proprietario dopo ogni visita "
    "è ciò che fa rinnovare il mandato, e che si può fare in trenta secondi",
    "Qualifica Lead": "far capire che il problema non è avere pochi contatti, ma sapere quale "
    "merita un appuntamento",
    "Due Diligence Aste": "posizionare PropertyTech come lo strumento che prepara la lettura di "
    "una perizia, senza mai sostituire il professionista che firma",
    "Acquisizione": "dare al titolare argomenti concreti da mostrare in appuntamento di "
    "acquisizione, al posto delle promesse che fanno tutti",
}

"""
Domanda di chiusura per i post che puntano alla discussione.

# Perché una per tema e non una per post

Per la stessa ragione degli obiettivi qui sopra: scritte una alla volta,
venti domande diventano venti modi di dire «e tu che ne pensi?», che è la
formula che nessuno ha mai voglia di rispondere. Legate al tema, chiedono
invece qualcosa che quella persona sa e noi no — come lavora la sua agenzia.

# Perché chiedono un dato concreto

Perché una domanda a cui si risponde con un numero o con un nome («la prima
domanda che fai», «quante perizie») si risponde in cinque secondi dal
telefono. Una che chiede un'opinione richiede di comporre un pensiero, e
resta senza commenti.
"""
DOMANDE_INTERAZIONE: dict[str, str] = {
    "Burocrazia": "Quante ore alla settimana ti mangia la parte burocratica, a occhio? "
    "Scrivi il tuo numero nei commenti: fra un'agenzia e l'altra cambia più di quanto sembri.",
    "Report Venditori": "Tu ogni quanto aggiorni il proprietario durante il mandato: dopo ogni "
    "visita, una volta a settimana, o quando chiama lui? Raccontacelo nei commenti.",
    "Qualifica Lead": "Qual è la prima domanda che fai a un contatto arrivato da un portale? "
    "Scrivila nei commenti: è quella che divide chi perde il pomeriggio da chi fissa un "
    "appuntamento.",
    "Due Diligence Aste": "Quando apri una perizia, qual è la prima cosa che vai a cercare? "
    "Scrivila nei commenti: è interessante vedere quanto cambia da chi le fa da anni.",
    "Acquisizione": "Cosa porti oggi in un appuntamento di acquisizione per farti scegliere al "
    "posto dell'agenzia qui accanto? Diccelo nei commenti.",
}


def usa_cta_interazione(indice: int) -> bool:
    """
    Vero per i post che chiudono con una domanda invece che con il link.

    Uno ogni tre, calcolato e non deciso a mano post per post: un elenco
    scritto a mano si sbilancia al primo ritocco del piano, e la regola —
    alternare, senza mai due domande di fila — sparisce dentro i dati.

    `indice % 3 == 2` fa cadere le domande sui post 2, 5, 8, 11, 14, 17 e 20,
    cioè sette su venti e almeno una per ciascuno dei cinque temi. Partire da 2
    e non da 3 serve proprio a questo: partendo da 3, i report ai venditori non
    avrebbero mai una domanda, perché il tema dura solo due uscite.
    """
    return indice % 3 == 2


# Proporzioni per formato: un Reel verticale, un carosello in verticale corto,
# l'immagine singola quadrata dove la timeline è larga e 4:5 dove si pubblica
# passando da Instagram, che premia l'altezza.
#
# `in` e non `==` perché la piattaforma ora è "Instagram / Facebook": con il
# crossposting attivo si pubblica una volta sola da Instagram e il contenuto
# compare anche sulla pagina Facebook, quindi è il formato di Instagram a
# comandare. Un confronto esatto avrebbe fatto tornare tutto a 1:1 senza
# dirlo a nessuno.
def proporzioni(formato: str, piattaforma: str) -> str:
    if formato == "Reel":
        return "9:16 verticale"
    if formato == "Giostra/Carosello":
        return "4:5 verticale"
    return "4:5 verticale" if "Instagram" in piattaforma else "1:1 quadrato"

BLU = "0B3C6E"
GHIACCIO = "EAF1F8"

class Post(NamedTuple):
    """
    Una singola uscita.

    Campi nominati e non una tupla posizionale: con dieci colonne, un valore
    scambiato di posto non produce un errore ma un post con l'hashtag nella
    colonna del copy, e lo si scopre aprendo il file.
    """

    ora: str
    piattaforma: str
    formato: str
    tema: str
    hook: str
    copy: str
    prompt_visuale: str
    hashtag: str
    #: Il problema dell'agente, in una riga: è il cuore del prompt definitivo.
    gancio: str
    #: Cosa si vede, in italiano e in breve, per il prompt definitivo.
    soggetto: str


_VOCI: list[tuple[str, ...]] = [
    # ───────────────────────── Settimana 1: burocrazia e report vocali
    (
        "08:00",
        "LinkedIn",
        "Immagine Singola",
        "Burocrazia",
        "Quante ore della tua settimana finiscono in cose che non vendono case?",
        "Facciamo il conto insieme. 🧮\n\n"
        "In una settimana media un agente immobiliare spende:\n"
        "• 3 ore a ricopiare dati da visure e atti\n"
        "• 2 ore a scrivere report e riepiloghi per i proprietari\n"
        "• 4 ore a rispondere a contatti che non compreranno mai\n\n"
        "Nessuna di queste ore porta una firma. Tutte e tre, però, sono automatizzabili.\n\n"
        "PropertyTech è il software con intelligenza artificiale pensato per le agenzie "
        "immobiliari italiane: legge i documenti, qualifica i contatti su WhatsApp e prepara "
        "i testi al posto tuo.\n\n"
        "👉 Prova gratuita, senza carta di credito: propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A real estate agent in his late 30s, "
        "smart-casual shirt, sitting at a tidy modern desk in a bright Italian agency office, "
        "looking thoughtfully at a thick paper folder of documents. Warm natural window light, "
        "shallow depth of field, muted blue and warm wood tones. Realistic corporate photography, "
        "no text in the image, no computer screens or software interfaces visible, no logos. "
        "Leave clean negative space in the upper third for a headline overlay.",
        "#agenziaimmobiliare #agenteimmobiliare #immobiliare #proptech #intelligenzaartificiale #digitalizzazione",
        "Togliere dalla settimana dell'agente le ore che non portano firme: ricopiare dati da visure e atti, scrivere riepiloghi per i proprietari, rispondere a contatti che non compreranno",
        "un agente immobiliare alla scrivania di un'agenzia luminosa, con una cartella di documenti cartacei in mano",
    ),
    (
        "13:00",
        "Instagram / Facebook",
        "Reel",
        "Report Venditori",
        "Esci dalla visita. Il proprietario ti chiama fra dieci minuti. Cosa gli dici?",
        "Il momento più delicato della settimana è anche quello in cui hai meno tempo. 🎤\n\n"
        "Con PropertyTech detti una nota vocale di trenta secondi appena chiusa la porta:\n"
        "• l'AI la trascrive\n"
        "• ne ricava un report ordinato per il proprietario\n"
        "• riformula i commenti dei visitatori in modo chiaro e mai offensivo\n\n"
        "Tu lo rileggi, correggi se serve, e lo mandi su WhatsApp. Il proprietario vede che "
        "qualcuno sta lavorando sul suo immobile: è quello che fa rinnovare il mandato. 🤝\n\n"
        "Funzione del piano Enterprise.\n"
        "👉 propertytechsolutions.net",
        "Vertical 9:16 video, professional stock footage style. Sequence: (1) a real estate agent "
        "walking out of an apartment building entrance in an Italian city, phone raised near his "
        "mouth as if recording a voice note, 3 seconds; (2) close-up of his hand holding the phone, "
        "afternoon golden light, 2 seconds; (3) same agent later, relaxed, sitting in his car "
        "reading something on the phone and nodding, 3 seconds. Handheld natural camera movement, "
        "realistic colours, no on-screen software interfaces, no screen recordings, no visible logos. "
        "Keep the centre of the frame clear for caption overlays.",
        "#notevocali #reportimmobiliare #agenteimmobiliare #proptech #immobiliare #venditacasa #intelligenzaartificiale",
        "Trasformare trenta secondi di nota vocale, dettata appena chiusa la porta, nel report che il proprietario aspetta, al posto dei venti minuti di scrittura a fine giornata",
        "un agente che esce dal portone di un palazzo e detta una nota vocale al telefono, luce calda del pomeriggio",
    ),
    (
        "18:30",
        "Instagram / Facebook",
        "Giostra/Carosello",
        "Burocrazia",
        "Foglio, particella, subalterno. Tre dati, venti minuti, zero valore aggiunto.",
        "Ricopiare a mano i dati di una visura è il lavoro più inutile di tutta la filiera. 📄\n\n"
        "E anche il più rischioso: un subalterno sbagliato lo scopre il notaio, non tu.\n\n"
        "Con PropertyTech carichi il PDF di visura, planimetria, atto di provenienza o APE e "
        "ricevi in pochi secondi:\n"
        "• intestatari e quote di proprietà\n"
        "• comune, foglio, particella, subalterno\n"
        "• categoria e rendita catastale\n"
        "• due righe su cosa manca o non torna\n\n"
        "I dati li rivedi tu prima di salvarli, e la scheda esce in PDF con il logo della tua "
        "agenzia. ✅\n\n"
        "👉 Prova gratuita su propertytechsolutions.net",
        "Carousel of 3 professional stock photographs, 4:5 portrait each. Slide 1: close-up of "
        "hands sorting through printed property documents and floor plans on a wooden desk, warm "
        "light. Slide 2: a woman real estate professional in her 40s in a bright office, calm "
        "expression, holding a tablet (screen not visible or turned away from camera). Slide 3: two "
        "professionals shaking hands across a desk with documents neatly stacked beside them. "
        "Consistent colour grading across all three, muted navy and warm neutral palette, realistic "
        "corporate photography, no text, no software screenshots, no logos.",
        "#visuracatastale #documenti #agenziaimmobiliare #proptech #immobiliare #catasto #intelligenzaartificiale",
        "Non ricopiare più a mano foglio, particella, subalterno e rendita da un PDF scansionato male, dove un dato sbagliato lo scopre il notaio",
        "mani che sfogliano visure e planimetrie cartacee su una scrivania di legno",
    ),
    (
        "09:00",
        "LinkedIn",
        "Immagine Singola",
        "Report Venditori",
        "Il mandato non si perde alla scadenza. Si perde nel silenzio fra due visite.",
        "Il proprietario non ti giudica sul prezzo. Ti giudica su quanto lo tieni informato. 📞\n\n"
        "Il problema è che il report post-visita richiede venti minuti che, alle 19:30 di un "
        "sabato, non ci sono.\n\n"
        "PropertyTech trasforma trenta secondi di nota vocale in un report professionale:\n"
        "• il riepilogo di com'è andata la visita\n"
        "• il livello di interesse dei visitatori\n"
        "• le obiezioni emerse, riformulate con misura\n"
        "• il suggerimento sul passo successivo\n\n"
        "Lo rileggi, lo firmi con il logo dell'agenzia, lo mandi. Funzione del piano Enterprise.\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. Over-the-shoulder view of a property owner "
        "(man in his 60s) reading a printed report at a kitchen table in a warm Italian home, "
        "reading glasses on, calm and satisfied expression. Soft late-afternoon light through a "
        "window. Realistic documentary photography style, shallow depth of field. No text in the "
        "image, no screens, no software interfaces, no logos. Clean space on the left for a "
        "headline overlay.",
        "#incaricoinesclusiva #mandato #agenteimmobiliare #proptech #immobiliare #clientsatisfaction",
        "Tenere informato il proprietario dopo ogni visita, che è la cosa su cui decide se rinnovare il mandato, anche quando la visita finisce alle 19:30 di sabato",
        "un proprietario di casa sui sessant'anni che legge un report stampato al tavolo di cucina, luce di fine pomeriggio",
    ),
    (
        "20:30",
        "Instagram / Facebook",
        "Reel",
        "Burocrazia",
        "Se un documento manca, lo scopri adesso o davanti al notaio.",
        "Le cose che fanno saltare un rogito sono sempre le stesse. 🛑\n\n"
        "Conformità catastale. Atto di provenienza. Ipoteche non cancellate. APE scaduto. "
        "Spese condominiali arretrate.\n\n"
        "PropertyTech ti dice **cosa manca** finché c'è tempo per procurarlo:\n"
        "• checklist dei documenti che servono davvero\n"
        "• stato di ognuno: c'è, manca, da chiedere\n"
        "• l'elenco pronto da mandare al proprietario\n"
        "• il report in PDF con i punti da risolvere\n\n"
        "Non certifica nulla e non sostituisce tecnico e notaio: serve a non arrivare al rogito "
        "con una sorpresa. ⚠️\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock video, 9:16 vertical, 8-12 seconds. Top-down shot of a hand "
        "ticking items on a paper checklist with a pen, then sliding a small stack of property "
        "documents and a set of house keys into frame. Slow deliberate movements, natural "
        "daylight, muted navy and cream palette, shallow depth of field. Realistic editorial "
        "footage, steady camera. No readable text on the paper, no screens, no software "
        "interfaces, no logos. Keep the top third of the frame clear for a headline overlay.",
        "#rogito #duediligence #agenziaimmobiliare #documenti #proptech #immobiliare #notaio",
        "Sapere quali documenti mancano prima di raccogliere la proposta, invece di scoprirlo davanti al notaio con la proposta già firmata",
        "una mano che spunta una checklist cartacea e fa scorrere in campo documenti di proprietà e un mazzo di chiavi, ripresa dall'alto",
    ),
    # ───────────────────────── Settimana 2: qualifica lead su WhatsApp
    (
        "08:00",
        "LinkedIn",
        "Immagine Singola",
        "Qualifica Lead",
        "Il primo che risponde prende l'appuntamento. Quasi sempre è un altro.",
        "Le richieste dai portali arrivano alle 22:40, la domenica, a Ferragosto. ⏰\n\n"
        "Tu rispondi lunedì. L'acquirente, lunedì, ha già visitato con un'altra agenzia.\n\n"
        "PropertyTech risponde in pochi secondi, a qualsiasi ora, su WhatsApp. E non si limita a "
        "dire \"le faremo sapere\": prima di proporre un appuntamento verifica\n"
        "• se serve un mutuo, e se è già stato deliberato\n"
        "• se c'è una casa da vendere prima di comprare\n"
        "• in quanto tempo vuole chiudere\n\n"
        "In agenda entra chi può comprare davvero. 📅\n\n"
        "👉 Prova gratuita, senza carta di credito: propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A smartphone lying face-down on a desk beside "
        "a laptop closed for the night, in a dark office lit only by a desk lamp and city lights "
        "through the window. Evening mood, blue hour tones, no people. Realistic corporate "
        "photography, shallow depth of field. No visible screen content, no software interfaces, "
        "no text, no logos. Leave the upper half relatively empty for a headline overlay.",
        "#speedtolead #whatsappbusiness #agenteimmobiliare #proptech #immobiliare #leadgeneration #automazione",
        "Rispondere in pochi secondi alle richieste dei portali che arrivano alle 22:40, la domenica e a Ferragosto, quando l'agenzia è chiusa e il primo che risponde prende l'appuntamento",
        "uno smartphone su una scrivania in un ufficio buio, illuminato solo dalla lampada e dalle luci della città fuori dalla finestra",
    ),
    (
        "13:00",
        "Instagram / Facebook",
        "Reel",
        "Qualifica Lead",
        "Nove chiamate su dieci sono curiosi. La decima è quella che paga l'anno.",
        "Il problema non è avere pochi contatti. È non sapere quale dei dieci vale il tuo sabato. 🔍\n\n"
        "PropertyTech fa la prima conversazione al posto tuo, su WhatsApp:\n"
        "• risponde in pochi secondi, giorno e notte\n"
        "• fa le tre domande che contano (mutuo, casa da vendere, tempi)\n"
        "• propone un orario della tua agenda\n"
        "• manda il promemoria prima della visita, così i mancati arrivi calano\n\n"
        "E quando vuoi subentrare, basta un tocco: l'assistente si ferma su quella chat. ✋\n\n"
        "👉 propertytechsolutions.net",
        "Vertical 9:16 video, professional stock footage style. Sequence: (1) a young couple "
        "walking hand in hand looking up at an apartment building facade in an Italian city, "
        "3 seconds; (2) close-up of a woman's hands typing on a smartphone while sitting on a sofa "
        "at home, evening lamp light, 3 seconds; (3) a real estate agent greeting the same couple "
        "at an apartment door with a warm handshake, 3 seconds. Natural handheld movement, warm "
        "realistic colour grade. No on-screen software interfaces, no chat mock-ups, no screen "
        "recordings, no logos. Keep the lower third clear for subtitles.",
        "#qualificalead #whatsapp #agenteimmobiliare #proptech #immobiliare #appuntamenti #automazione",
        "Capire quale dei dieci contatti della settimana merita un sabato di visite, invece di scoprirlo dopo averlo speso",
        "una giovane coppia che guarda la facciata di un palazzo, poi la stretta di mano con l'agente sulla porta dell'appartamento",
    ),
    (
        "18:30",
        "Instagram / Facebook",
        "Immagine Singola",
        "Qualifica Lead",
        "Il sabato mattina è la tua risorsa più scarsa. Non regalarla ai curiosi.",
        "Tre visite il sabato. Due con persone che \"stavano solo guardando\". 😐\n\n"
        "Succede perché l'appuntamento si fissa prima di sapere se chi lo chiede può comprare.\n\n"
        "Con PropertyTech l'ordine si inverte: prima la qualifica, poi l'agenda.\n"
        "• capienza economica verificata\n"
        "• tempistiche dichiarate\n"
        "• eventuale immobile da vendere prima\n"
        "• promemoria automatico prima della visita\n\n"
        "Il sabato torna a essere una trattativa. 🏡\n\n"
        "👉 Prova gratuita su propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A bright, empty modern Italian living room "
        "with sunlight falling across the floor, a single set of keys on the windowsill, nobody in "
        "frame. Clean architectural interior photography, warm neutral palette, wide angle. No "
        "text, no screens, no software interfaces, no logos. Composition leaves the right half "
        "relatively plain for a headline overlay.",
        "#appuntamenti #agenziaimmobiliare #visite #proptech #immobiliare #organizzazione",
        "Fissare in agenda solo visite con acquirenti che hanno capienza economica e tempi definiti, così il sabato torna a essere una trattativa",
        "un salotto luminoso e vuoto di un appartamento italiano, con un mazzo di chiavi sul davanzale",
    ),
    (
        "09:00",
        "LinkedIn",
        "Giostra/Carosello",
        "Qualifica Lead",
        "Le tre domande che cambiano una trattativa, fatte prima di sprecare un sabato.",
        "Un acquirente qualificato non è chi dice \"mi piace\". È chi può firmare. ✍️\n\n"
        "Le tre domande che lo distinguono sono sempre le stesse, e nessuno ha voglia di farle al "
        "telefono alle nove di sera:\n\n"
        "1️⃣ Serve un mutuo? È già stato deliberato?\n"
        "2️⃣ C'è una casa da vendere prima di comprare?\n"
        "3️⃣ In quanto tempo vuole chiudere?\n\n"
        "PropertyTech le fa su WhatsApp, in conversazione, senza sembrare un questionario. Poi ti "
        "consegna la scheda già compilata e l'appuntamento in agenda.\n\n"
        "Il dato in più: chi deve vendere prima di comprare è anche un potenziale incarico. "
        "L'assistente lo segnala. 🎯\n\n"
        "👉 propertytechsolutions.net",
        "Carousel of 4 professional stock photographs, 4:5 portrait each, consistent colour grade. "
        "Slide 1: a bank advisor and a couple talking across a desk, documents between them. "
        "Slide 2: a 'for sale' sign in front of an Italian residential building, soft daylight. "
        "Slide 3: a wall calendar with a pen resting on it, close-up, shallow depth of field. "
        "Slide 4: an agent and a client shaking hands in a bright office. Muted navy and warm "
        "neutral palette, realistic corporate photography. No text, no screens, no software "
        "interfaces, no logos. Keep the top area of each slide clear for overlay text.",
        "#qualificalead #mutuo #agenteimmobiliare #proptech #immobiliare #trattativa #acquisizione",
        "Far emergere mutuo, casa da vendere prima di comprare e tempi d'acquisto durante la conversazione, senza che il cliente si senta davanti a un questionario",
        "un consulente bancario con una coppia alla scrivania, un cartello vendesi, un calendario da parete, una stretta di mano in ufficio",
    ),
    (
        "20:30",
        "Instagram / Facebook",
        "Reel",
        "Qualifica Lead",
        "I tuoi dati restano tuoi. Non devi cambiare gestionale.",
        "La prima obiezione che sentiamo è sempre questa: \"dovrei migrare tutto?\". No. 🔌\n\n"
        "PropertyTech si affianca a quello che usi già:\n"
        "• i lead qualificati vengono inoltrati al tuo gestionale\n"
        "• l'export in CSV è sempre disponibile\n"
        "• il collegamento WhatsApp si fa inquadrando un codice, come WhatsApp Web\n"
        "• database e server in Unione Europea, trattamento conforme al GDPR\n\n"
        "Nessuna migrazione, nessun cambio di abitudini. Due minuti e sei operativo. ⚙️\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock video, 9:16 vertical, 8-12 seconds. A hand places a smartphone face "
        "down on a tidy desk beside a paper notebook, then withdraws, followed by a slow "
        "push-in on the two objects side by side. Cool blue and grey palette, crisp even "
        "lighting, minimal composition. Realistic corporate footage, steady camera. No text, no "
        "screen content, no software interfaces, no logos. Generous negative space for a "
        "headline.",
        "#gdpr #gestionaleimmobiliare #integrazione #proptech #immobiliare #privacy #agenziaimmobiliare",
        "Aggiungere l'automazione senza migrare il gestionale e senza cambiare abitudini, con i dati che restano in Unione Europea",
        "una mano che appoggia uno smartphone a faccia in giù accanto a un taccuino di carta, su una scrivania ordinata, luce fredda",
    ),
    # ───────────────────────── Settimana 3: aste e due diligence
    (
        "08:00",
        "LinkedIn",
        "Immagine Singola",
        "Due Diligence Aste",
        "Ottanta pagine di perizia. Tre ore di lettura. Un vincolo che ti sfugge.",
        "Chi lavora sulle aste giudiziarie lo sa: il margine si fa o si perde nella perizia. 📚\n\n"
        "E la perizia è ottanta pagine di linguaggio tecnico in cui basta non vedere una riga per "
        "trasformare un affare in un problema.\n\n"
        "PropertyTech legge il PDF e ne ricava:\n"
        "• stato occupazionale dell'immobile\n"
        "• difformità edilizie e vincoli\n"
        "• costo stimato di sanatoria\n"
        "• un semaforo di rischio calcolato su criteri dichiarati\n\n"
        "Gli output dell'AI si verificano sulle fonti ufficiali: servono a farti leggere le "
        "ottanta pagine sapendo già dove guardare. 🔎\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A very thick bound technical report lying open "
        "on a desk beside a magnifying glass and a pair of reading glasses, dramatic side lighting "
        "that emphasises the thickness of the document. Dark navy and warm paper tones, editorial "
        "still-life photography, no people. No readable text on the pages, no screens, no software "
        "interfaces, no logos. Leave the top third darker and plain for a headline overlay.",
        "#asteimmobiliari #duediligence #perizia #proptech #immobiliare #investimentiimmobiliari #intelligenzaartificiale",
        "Arrivare preparato su una perizia d'asta di ottanta pagine senza perdere tre ore di lettura, e senza rischiare di non vedere il vincolo che azzera il margine",
        "un voluminoso fascicolo tecnico aperto su una scrivania, accanto a una lente d'ingrandimento e a un paio di occhiali da lettura, luce laterale",
    ),
    (
        "13:00",
        "Instagram / Facebook",
        "Reel",
        "Due Diligence Aste",
        "L'immobile all'asta costa poco per un motivo. Il punto è capire quale.",
        "Occupato senza titolo? Difformità da sanare? Un vincolo che blocca la rivendita? 🧐\n\n"
        "Sono le tre domande che decidono se un lotto è un'occasione o una trappola. E le "
        "risposte stanno dentro la perizia, sparse su decine di pagine.\n\n"
        "Con PropertyTech carichi il PDF e ottieni:\n"
        "• sintesi dei punti critici\n"
        "• semaforo di rischio su criteri dichiarati\n"
        "• simulatore: capitale investito, margine sulla rivendita, rendimento da locazione\n"
        "• incrocio automatico con i clienti che hai già in archivio\n\n"
        "Poi la perizia la leggi comunque. Ma sapendo dove guardare. 📈\n\n"
        "👉 propertytechsolutions.net",
        "Vertical 9:16 video, professional stock footage style. Sequence: (1) slow push-in on the "
        "facade of an older Italian apartment building with closed shutters, 3 seconds; (2) "
        "close-up of hands flipping quickly through a thick printed report, 3 seconds; (3) a "
        "professional investor in his 40s at a desk, pen in hand, nodding as he annotates a paper "
        "document, 3 seconds. Natural light, realistic colour grade, subtle handheld movement. No "
        "on-screen software interfaces, no screen recordings, no charts on screens, no logos. Keep "
        "the lower third clear for subtitles.",
        "#asteimmobiliari #investimenti #rendimento #proptech #immobiliare #duediligence #perizia",
        "Capire prima di offrire se un lotto all'asta è un'occasione o una trappola: stato occupazionale, difformità da sanare, vincoli che bloccano la rivendita",
        "la facciata di un palazzo italiano più vecchio con le persiane chiuse, poi mani che sfogliano rapidamente una relazione tecnica stampata",
    ),
    (
        "18:30",
        "Instagram / Facebook",
        "Giostra/Carosello",
        "Due Diligence Aste",
        "Quattro voci che spostano il margine di un'operazione all'asta.",
        "Il prezzo base non dice quasi nulla. Quello che conta viene dopo. 🧾\n\n"
        "Le quattro voci che decidono se un'operazione all'asta ha senso:\n\n"
        "🔑 Stato occupazionale: liberare un immobile occupato richiede tempo e spese legali\n"
        "🏗️ Difformità edilizie: la sanatoria ha un costo, e va stimata prima di offrire\n"
        "⚖️ Vincoli e diritti di terzi: cambiano il percorso, a volte lo chiudono\n"
        "💰 Costi accessori: imposte, oneri, ristrutturazione\n\n"
        "PropertyTech le estrae dalla perizia e le mette in un simulatore, così il margine lo "
        "vedi prima di alzare la mano.\n\n"
        "👉 propertytechsolutions.net",
        "Carousel of 4 professional stock photographs, 4:5 portrait each, consistent grade. "
        "Slide 1: a closed apartment door with an old lock, dim hallway light. Slide 2: a "
        "construction worker's gloved hands on a wall with visible plaster work. Slide 3: a "
        "courthouse or official building facade in Italy, low angle, daylight. Slide 4: a calculator "
        "and pen on a desk beside printed documents, top-down. Cohesive muted navy and concrete-grey "
        "palette, realistic documentary photography. No text, no screens, no software interfaces, "
        "no logos. Keep the upper area of each slide clear for overlay text.",
        "#asteimmobiliari #immobiliare #investimentiimmobiliari #proptech #duediligence #sanatoria",
        "Stimare stato occupazionale, difformità edilizie, vincoli e costi accessori prima di alzare la mano in asta, perché il prezzo base non dice quasi nulla",
        "una porta chiusa con serratura vecchia, le mani guantate di un muratore su un muro, la facciata di un tribunale, una calcolatrice su documenti stampati",
    ),
    (
        "09:00",
        "LinkedIn",
        "Immagine Singola",
        "Due Diligence Aste",
        "L'AI non firma la perizia. Ti fa arrivare preparato a leggerla.",
        "Diciamolo chiaramente, perché nel nostro settore le promesse esagerate si pagano. ⚠️\n\n"
        "PropertyTech **non** certifica nulla e **non** sostituisce il tecnico, il legale o il "
        "notaio. Quello che fa è togliere il lavoro di lettura meccanica:\n"
        "• estrae dalla perizia i dati che contano\n"
        "• segnala i punti critici e le difformità dichiarate\n"
        "• calcola uno scenario economico su parametri che puoi modificare\n"
        "• riporta sempre l'avviso di verifica sulle fonti ufficiali\n\n"
        "La responsabilità resta di chi firma. Il tempo risparmiato è tuo. ⏱️\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A technical professional (architect or "
        "surveyor, woman in her 40s, wearing a light blazer) standing in an empty apartment under "
        "renovation, holding a paper floor plan and looking at a wall. Natural light from a large "
        "window, dust in the air, realistic documentary style. No text, no screens, no software "
        "interfaces, no logos. Leave clean space on the upper left for a headline overlay.",
        "#duediligence #perizia #responsabilita #proptech #immobiliare #asteimmobiliari #tecnico",
        "Usare l'AI sulle perizie sapendo che la responsabilità resta di chi firma: lo strumento prepara la lettura, non sostituisce il tecnico né il notaio",
        "una tecnica professionista sui quarant'anni in un appartamento in ristrutturazione, con una planimetria cartacea in mano",
    ),
    (
        "20:30",
        "Instagram / Facebook",
        "Reel",
        "Due Diligence Aste",
        "Il lotto giusto spesso ce l'hai già in archivio. Solo che non lo sai.",
        "Ogni agenzia ha una lista di clienti che cercavano qualcosa di preciso. 🗂️\n\n"
        "Poi quel qualcosa compare in un'asta, e nessuno fa il collegamento: perché nessuno "
        "rilegge l'archivio.\n\n"
        "PropertyTech lo fa al posto tuo:\n"
        "• incrocia i lotti con i clienti già in portafoglio\n"
        "• segnala solo gli abbinamenti che stanno davvero in piedi\n"
        "• prepara il messaggio da mandare su WhatsApp\n\n"
        "Il lavoro di acquisizione più economico è quello sui clienti che hai già. ♻️\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock video, 9:16 vertical, 8-12 seconds. Slow lateral dolly along a wall "
        "of old wooden filing drawers, ending as one drawer slides quietly open. Warm side "
        "lighting, shallow depth of field on the open drawer. Nobody in frame. Muted warm "
        "browns and navy shadows, editorial footage, smooth continuous motion. No text, no "
        "labels readable, no screens, no software interfaces, no logos. Keep the top of the "
        "frame plain for a headline overlay.",
        "#asteimmobiliari #matchmaking #clienti #proptech #immobiliare #portafoglioimmobili",
        "Scoprire che il cliente giusto per quel lotto è già nell'archivio dell'agenzia, perché l'acquisizione più economica è quella sui clienti che si hanno già",
        "una carrellata lenta lungo una parete di vecchie cassettiere in legno, fino a un cassetto che si apre, luce laterale calda",
    ),
    # ───────────────────────── Settimana 4: acquisizione e incarichi
    (
        "08:00",
        "LinkedIn",
        "Immagine Singola",
        "Acquisizione",
        "Chi ti scrive per comprare, otto volte su dieci ha una casa da vendere.",
        "È il dato più sottovalutato di tutta la filiera. 🔁\n\n"
        "Un acquirente porta una provvigione. Un mandato ne porta una e apre il portafoglio.\n\n"
        "PropertyTech se ne accorge durante la conversazione, senza fare domande in più:\n"
        "• riconosce chi deve vendere prima di comprare\n"
        "• etichetta il contatto come Venditore Singolo o Investitore\n"
        "• ordina l'elenco così i più promettenti salgono in cima\n"
        "• ti propone l'incrocio con le visure, senza deciderlo da solo\n\n"
        "Così la valutazione la fissi tu, prima che ci pensi un'altra agenzia. 🥇\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A real estate agent (woman, late 30s) ringing "
        "the doorbell of a private house gate in an Italian residential neighbourhood, seen from "
        "behind at a respectful distance, holding a folder. Morning light, realistic documentary "
        "photography, warm palette. No text, no screens, no software interfaces, no logos. Leave "
        "the sky area at the top clear for a headline overlay.",
        "#acquisizione #incaricoinesclusiva #agenteimmobiliare #proptech #immobiliare #valutazioneimmobiliare",
        "Riconoscere, fra chi chiede informazioni per comprare, chi ha una casa da vendere: un acquirente porta una provvigione, un mandato apre il portafoglio",
        "un'agente immobiliare che suona al cancello di una villetta in un quartiere residenziale italiano, con una cartella in mano, luce del mattino",
    ),
    (
        "13:00",
        "Instagram / Facebook",
        "Reel",
        "Acquisizione",
        "Il proprietario sceglie l'agenzia che gli sembra più attrezzata. Non la più simpatica.",
        "In appuntamento di acquisizione competi con altre due o tre agenzie. 🤔\n\n"
        "Tutte diranno le stesse cose: fotografo, portali, esperienza sulla zona.\n\n"
        "Quello che ti distingue è mostrare **come** lavori:\n"
        "• il report post-visita che il proprietario riceverà dopo ogni appuntamento\n"
        "• la checklist dei documenti già impostata sul suo immobile\n"
        "• l'annuncio e i contenuti social pronti il giorno stesso dell'incarico\n"
        "• la risposta ai contatti in pochi secondi, anche di notte\n\n"
        "Non è una promessa: è una schermata che gli fai vedere. 📱\n\n"
        "👉 propertytechsolutions.net",
        "Vertical 9:16 video, professional stock footage style. Sequence: (1) an agent and an older "
        "couple sitting at a dining table in a private home, documents and a tablet face-down on "
        "the table, talking, 3 seconds; (2) close-up of the couple's faces, attentive and "
        "reassured, 2 seconds; (3) handshake across the table with the signed folder visible, "
        "3 seconds. Warm domestic light, realistic documentary style, natural handheld movement. No "
        "on-screen software interfaces, no screen recordings, no logos. Keep the lower third clear "
        "for subtitles.",
        "#acquisizione #incaricoinesclusiva #agenteimmobiliare #proptech #immobiliare #valutazione #tecnologia",
        "Mostrare al proprietario, in appuntamento di acquisizione, come lavora l'agenzia invece di promettergli le stesse cose che gli diranno le altre due",
        "un agente al tavolo di casa con una coppia anziana, documenti appoggiati, e la stretta di mano finale sulla cartella firmata",
    ),
    (
        "18:30",
        "Instagram / Facebook",
        "Immagine Singola",
        "Acquisizione",
        "Quattro righe sull'immobile. Annuncio, post e script del Reel pronti.",
        "Scrivere l'annuncio per i portali, il post per Instagram e lo script del video è lo "
        "stesso lavoro fatto tre volte. ✍️\n\n"
        "PropertyTech lo fa una volta sola: da poche note sull'immobile ottieni\n"
        "• il testo per i portali immobiliari\n"
        "• il post per Instagram e Facebook\n"
        "• lo script del Reel\n"
        "• il file di esportazione pronto per i portali\n\n"
        "I dati che non gli dai non li inventa: se la classe energetica non c'è, l'annuncio non "
        "la nomina. 🎯\n\n"
        "Funzione del piano Enterprise.\n"
        "👉 propertytechsolutions.net",
        "Professional stock photograph, 1:1 square. A bright, well-staged Italian apartment living "
        "room photographed as a professional real estate listing photo: neat sofa, plants, natural "
        "light from a balcony door. Wide angle, crisp architectural interior photography, warm "
        "neutral palette, nobody in frame. No text, no screens, no software interfaces, no logos. "
        "Composition leaves the upper area relatively plain for a headline overlay.",
        "#annunciimmobiliari #socialmediamarketing #agenziaimmobiliare #proptech #immobiliare #copywriting",
        "Ottenere annuncio per i portali, post social e script del Reel da quattro righe di appunti, invece di scrivere tre volte lo stesso lavoro",
        "il salotto di un appartamento italiano ben presentato, fotografato come una foto professionale da annuncio, senza persone",
    ),
    (
        "09:00",
        "LinkedIn",
        "Giostra/Carosello",
        "Acquisizione",
        "Cosa mostri al proprietario, quando ti chiede perché dovrebbe scegliere te.",
        "L'appuntamento di acquisizione si vince sui fatti verificabili. 📋\n\n"
        "Le quattro cose che un titolare può mostrare, non promettere:\n\n"
        "1️⃣ Risposta ai contatti in pochi secondi, 24 ore su 24, festivi compresi\n"
        "2️⃣ Report al proprietario dopo ogni visita, da una nota vocale di trenta secondi\n"
        "3️⃣ Documenti verificati prima di raccogliere la proposta\n"
        "4️⃣ Annuncio, post social e script pronti il giorno dell'incarico\n\n"
        "Report vocali e contenuti social sono funzioni del piano Enterprise. Il resto parte "
        "dalla prova gratuita, senza carta di credito.\n\n"
        "👉 propertytechsolutions.net",
        "Carousel of 4 professional stock photographs, 4:5 portrait each, consistent colour grade. "
        "Slide 1: a smartphone on a desk at night beside a lamp, nobody in frame. Slide 2: an agent "
        "speaking into a phone held near his mouth, outdoors near a building entrance. Slide 3: "
        "hands checking items on a printed checklist with a pen. Slide 4: a professional real "
        "estate photographer's camera on a tripod inside a bright staged apartment. Muted navy and "
        "warm neutral palette, realistic corporate photography. No text, no screens, no software "
        "interfaces, no logos. Keep the top of each slide clear for overlay text.",
        "#acquisizione #incaricoinesclusiva #titolareagenzia #proptech #immobiliare #tecnologia #agenteimmobiliare",
        "Portare in appuntamento di acquisizione quattro cose verificabili da mostrare, al posto delle promesse che fanno tutte le agenzie",
        "uno smartphone su una scrivania di notte, un agente che detta una nota vocale, una checklist spuntata a penna, una fotocamera su cavalletto in un appartamento",
    ),
    (
        "20:30",
        "Instagram / Facebook",
        "Reel",
        "Acquisizione",
        "Due minuti per attivarlo. Nessuna carta di credito. Nessuna migrazione.",
        "Se sei arrivato fin qui, l'unica domanda che resta è quanto costa provarlo. 🎁\n\n"
        "Niente: la prova è gratuita e non chiede la carta di credito.\n\n"
        "Cosa puoi fare dal primo giorno:\n"
        "• collegare WhatsApp inquadrando un codice, come WhatsApp Web\n"
        "• far qualificare i contatti dei portali dall'assistente\n"
        "• caricare una visura e vedere i dati estratti\n"
        "• verificare i documenti di un immobile con la checklist\n\n"
        "Database e server in Unione Europea, trattamento conforme al GDPR. 🇪🇺\n\n"
        "👉 propertytechsolutions.net",
        "Professional stock video, 9:16 vertical, 8-12 seconds. A person picks up a smartphone "
        "from a desk in a bright modern office and settles back into the chair, the screen "
        "always angled away from the camera so no interface is ever visible, a cup of coffee "
        "and a notebook beside them. Warm morning light, shallow depth of field, optimistic and "
        "unhurried. Realistic corporate footage. No text, no visible screen content, no "
        "software interfaces, no logos. Leave the top third of the frame plain for a headline.",
        "#provagratuita #proptech #agenziaimmobiliare #immobiliare #intelligenzaartificiale #gdpr #digitalizzazione",
        "Provare il software senza carta di credito, senza migrare niente e con i dati in Unione Europea",
        "una persona che prende uno smartphone dalla scrivania in un ufficio luminoso, con una tazza di caffè e un taccuino accanto, luce del mattino",
    ),
]


"""
`Post(*voce)` e non una tupla usata a indici.

Con dieci campi per riga, quello che va storto non e' il tipo: e' l'ordine.
Costruire l'oggetto fa fallire subito una voce a cui manca un campo, mentre
`voce[7]` su una tupla corta restituirebbe l'hashtag al posto del soggetto e lo
si scoprirebbe leggendo il file finito.
"""
POSTS: list[Post] = [Post(*voce) for voce in _VOCI]


def copy_con_cta(post: Post, indice: int) -> str:
    """
    Il copy con la chiusura giusta per quel post.

    La sostituzione avviene qui e non dentro `_VOCI` perché la regola è una
    sola e deve restare in un punto solo: scritta venti volte nei dati, basta
    spostare un post di un giorno perché il ritmo delle CTA salti senza che
    nessuno se ne accorga.

    La riga di conversione viene **sostituita**, non affiancata: un post che
    chiede un parere e subito sotto mette il link chiede due cose diverse, e
    di solito non ne ottiene nessuna.
    """
    if not usa_cta_interazione(indice):
        return post.copy

    righe = post.copy.rstrip().split("\n")
    if righe and righe[-1].lstrip().startswith("👉"):
        righe.pop()
    # L'emoji si aggiunge qui e non nel dizionario: nel copy stacca la domanda
    # dal testo e si vede nello scroll, dentro l'istruzione a Predis sarebbe
    # solo un carattere in piu' da interpretare.
    return "\n".join(righe).rstrip() + "\n\n💬 " + DOMANDE_INTERAZIONE[post.tema]


def prompt_definitivo(post: Post, indice: int) -> str:
    """
    Il testo da incollare in "Crea il tuo prossimo post" di Predis.ai.

    # Perche' composto e non scritto venti volte

    Perche' la struttura e' identica per tutti i post — tipo e obiettivo, tema e
    gancio, istruzioni visive, tono e chiusura — e cambia solo cio' che riguarda
    quel contenuto. Venti prompt scritti a mano divergono al terzo ritocco: uno
    perde il divieto sulle schermate, un altro dimentica il formato, e sono
    proprio le due righe che fanno la differenza fra una grafica utilizzabile e
    una da rifare.

    # Perche' in italiano

    Perche' il testo che finira' sulla grafica deve essere italiano, e un prompt
    in inglese porta il modello a scriverci sopra parole inglesi. Le indicazioni
    di stile restano comunque esplicite: e' il divieto sulle schermate a dover
    essere impossibile da fraintendere.
    """
    rapporto = proporzioni(post.formato, post.piattaforma)

    # La chiusura e' l'unica parte del prompt che cambia per posizione e non
    # per contenuto: un post su tre deve far parlare la gente invece di
    # portarla sul sito, e a Predis va detto esplicitamente di non mettere il
    # link, altrimenti lo aggiunge da se' e la domanda perde forza.
    chiusura = (
        "Chiudi con questa domanda rivolta ai colleghi, riportata alla lettera: "
        f"«{DOMANDE_INTERAZIONE[post.tema]}». Non mettere link e non invitare a provare il "
        "prodotto: questo contenuto serve a far parlare le persone, non a portarle sul sito."
        if usa_cta_interazione(indice)
        else "Chiudi invitando a seguire la pagina per altre strategie operative e a provare la "
        "demo gratuita su propertytechsolutions.net, senza carta di credito."
    )

    tipo = {
        "Reel": "video verticale breve (Reel) di 8-12 secondi",
        "Giostra/Carosello": f"carosello di 4 schede",
        "Immagine Singola": "post a immagine singola",
    }[post.formato]

    return f"""1) TIPO DI CONTENUTO E OBIETTIVO
Crea un {tipo} per {post.piattaforma}, ad alta conversione, rivolto ad agenti e titolari di agenzie immobiliari italiane. Obiettivo del contenuto: {OBIETTIVI[post.tema]}.

2) TEMA E GANCIO OPERATIVO
Tema: {post.tema}. Il problema concreto da mettere in scena: {post.gancio}. Apri con questo concetto nella prima riga o nella prima scheda, perché è il punto in cui il lettore si riconosce. Non usare percentuali, statistiche o dati di risultato: non ne abbiamo di verificati, e un numero inventato su una grafica diventa una promessa che non possiamo mantenere.

3) ISTRUZIONI VISIVE
Usa esclusivamente immagini o video stock professionali di alta qualità del settore immobiliare: {post.soggetto}. Fotografia realistica e sobria, luce naturale, palette blu notte e neutri caldi, profondità di campo ridotta. Formato {rapporto}.
VIETATO IN MODO ASSOLUTO: screenshot di interfacce software, mockup di applicazioni, finte schermate di chat, grafici o dashboard mostrati su un monitor, loghi di terzi. Le interfacce invecchiano in un mese e non comunicano nulla a chi scorre il feed.
Testo sull'immagine in italiano, al massimo {MAX_PAROLE_SU_IMMAGINE} parole, con ampio spazio libero per il titolo.

4) TONO E CALL TO ACTION
Tono autorevole, professionale e diretto, da collega esperto che parla a un altro professionista: mai pubblicitario, mai entusiasta a vuoto. Dai del tu. {chiusura}"""


def giorni_lavorativi(inizio: datetime.date, quanti: int) -> list[datetime.date]:
    """Le prime `quanti` date da lunedì a venerdì, a partire da `inizio`."""
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

    Stima grossolana e voluta: si contano i capoversi e si divide la lunghezza
    di ciascuno per la larghezza della colonna. Excel non espone il calcolo
    vero, che dipende dal font e dal rendering, quindi qualsiasi numero qui è
    un'approssimazione — meglio una che segue il contenuto di una costante che
    va rifatta a mano a ogni colonna aggiunta.
    """
    righe_stimate = 1
    for testo, larghezza in celle:
        righe = sum(max(1, len(capoverso) // larghezza + 1) for capoverso in testo.split("\n"))
        righe_stimate = max(righe_stimate, righe)

    # ~13 punti per riga di Arial 10, con un tetto: oltre, la riga diventa più
    # alta dello schermo e scorrere il foglio diventa impossibile.
    return min(righe_stimate * 13, 420)


def scrivi_piano(destinazione: Path) -> None:
    wb = Workbook()
    foglio = wb.active
    foglio.title = "Piano Editoriale"

    intestazione_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    intestazione_fill = PatternFill("solid", fgColor=BLU)
    corpo_font = Font(name="Arial", size=10)
    bordo = Border(
        left=Side(style="thin", color="D0D7DE"),
        right=Side(style="thin", color="D0D7DE"),
        top=Side(style="thin", color="D0D7DE"),
        bottom=Side(style="thin", color="D0D7DE"),
    )

    for indice, (titolo, larghezza) in enumerate(COLONNE, start=1):
        cella = foglio.cell(row=1, column=indice, value=titolo)
        cella.font = intestazione_font
        cella.fill = intestazione_fill
        cella.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cella.border = bordo
        foglio.column_dimensions[get_column_letter(indice)].width = larghezza

    foglio.row_dimensions[1].height = 34

    date = giorni_lavorativi(INIZIO, len(POSTS))

    for riga, (giorno, post) in enumerate(zip(date, POSTS), start=2):
        # L'indice del post nel piano, non nel foglio: e' il ritmo delle uscite
        # a decidere quando si chiede un commento invece di un clic.
        indice = riga - 1
        definitivo = prompt_definitivo(post, indice)
        valori = [
            giorno,
            post.ora,
            post.piattaforma,
            post.formato,
            post.tema,
            post.hook,
            copy_con_cta(post, indice),
            post.prompt_visuale,
            definitivo,
            post.hashtag,
        ]

        for colonna, valore in enumerate(valori, start=1):
            cella = foglio.cell(row=riga, column=colonna, value=valore)
            cella.font = corpo_font
            cella.border = bordo
            # Le colonne brevi si leggono meglio centrate; i testi lunghi
            # vanno a capo e si allineano in alto, altrimenti una riga da
            # quindici capoversi centra il testo a metà cella.
            if colonna <= 5:
                cella.alignment = Alignment(
                    horizontal="center", vertical="center", wrap_text=True
                )
            else:
                cella.alignment = Alignment(vertical="top", wrap_text=True)

        foglio.cell(row=riga, column=1).number_format = "DD/MM/YYYY"

        # Bande alternate per settimana: scorrendo venti righe di testo lungo,
        # il confine fra una settimana e l'altra è l'unico riferimento utile.
        if ((riga - 2) // 5) % 2 == 1:
            for colonna in range(1, len(COLONNE) + 1):
                foglio.cell(row=riga, column=colonna).fill = PatternFill(
                    "solid", fgColor=GHIACCIO
                )

        # Altezza calcolata sul contenuto più lungo.
        #
        # Il testo a capo da solo non alza la riga: senza questo il copy resta
        # tagliato all'apertura. Un'altezza fissa invece non regge l'aggiunta di
        # una colonna più lunga delle altre — e il prompt definitivo lo è.
        foglio.row_dimensions[riga].height = altezza_riga(
            [(post.copy, 78), (post.prompt_visuale, 64), (definitivo, 88)]
        )

    foglio.freeze_panes = "A2"
    foglio.auto_filter.ref = f"A1:{get_column_letter(len(COLONNE))}{len(POSTS) + 1}"

    scrivi_istruzioni(wb, intestazione_font, intestazione_fill, corpo_font)

    destinazione.parent.mkdir(parents=True, exist_ok=True)
    wb.save(destinazione)


def scrivi_istruzioni(wb: Workbook, font_titolo: Font, fill_titolo: PatternFill, font_corpo: Font) -> None:
    """Una pagina di istruzioni: il piano lo usa chi non l'ha scritto."""
    foglio = wb.create_sheet("Istruzioni")
    foglio.column_dimensions["A"].width = 26
    foglio.column_dimensions["B"].width = 96

    titolo = foglio.cell(row=1, column=1, value="Come si usa questo piano")
    titolo.font = font_titolo
    titolo.fill = fill_titolo
    foglio.cell(row=1, column=2).fill = fill_titolo

    righe = [
        ("Periodo", f"Quattro settimane, cinque uscite a settimana (lunedì-venerdì), dal {INIZIO.strftime('%d/%m/%Y')}."),
        ("Rotazione dei temi", "Settimana 1 burocrazia e report vocali · Settimana 2 qualifica lead su WhatsApp · "
                              "Settimana 3 aste e due diligence · Settimana 4 acquisizione e incarichi."),
        ("Instagram e Facebook", "Una riga sola per due pagine: la pagina Instagram è collegata a "
                                 "quella Facebook e il crossposting è attivo, quindi si pubblica da "
                                 "Instagram e il contenuto compare anche su Facebook. I post segnati "
                                 "«Instagram / Facebook» non vanno ricaricati a mano sulla seconda "
                                 "pagina: sarebbe lavoro doppio e due post identici nello stesso feed."),
        ("Perché tanti Reel", "Su Instagram e Facebook il video verticale è il formato che i due "
                              "algoritmi spingono di più, quindi ogni settimana c'è un Reel in più al "
                              "posto di un'immagine singola. Le immagini singole restano su LinkedIn, "
                              "dove un post statico con un testo lungo rende ancora meglio di un video."),
        ("Le due call to action", "Un post su tre chiude con una domanda ai colleghi invece che con il "
                                  "link: sono i post 2, 5, 8, 11, 14, 17 e 20. Servono a far commentare, "
                                  "ed è il commento a far girare il post a chi non ci segue. Sui post con "
                                  "la domanda il link NON va aggiunto: chiedere un parere e un clic "
                                  "insieme di solito non ottiene né l'uno né l'altro."),
        ("Colonna Copy Completo", "Testo pronto da incollare. Gli a capo sono già quelli giusti per il post: "
                                  "copia la cella, non riscriverla."),
        ("Colonna Prompt Definitivo", "È quella da usare: si incolla intera nella schermata «Crea il tuo prossimo "
                                      "post» di Predis.ai, senza toccarla. Quattro blocchi numerati — tipo e "
                                      "obiettivo, tema e gancio operativo, istruzioni visive, tono e call to action "
                                      "— perché Predis, lasciato libero, sceglie da sé stile e testo."),
        ("Colonna Prompt Visuale", "La sola parte visiva, in inglese, per quando serve rigenerare l'immagine "
                                   "cambiando soggetto senza rifare tutto il prompt. Se usi il Prompt Definitivo, "
                                   "questa colonna non serve: è un ripiego, non un secondo passaggio."),
        ("Divieto sulle schermate", "Entrambe le colonne vietano esplicitamente screenshot di software, mockup di "
                                    "app e finte chat. Un'interfaccia in un post invecchia in un mese, e a chi "
                                    "scorre il feed non dice nulla."),
        ("Hashtag", "Da cinque a sette per post, mescolando settore (#immobiliare, #agenteimmobiliare) e "
                    "tecnologia (#proptech). Non riusarli tutti identici su ogni post."),
        ("Cosa NON dire", "Nessuna percentuale di risultato inventata, nessun prezzo, e mai promettere che l'AI "
                          "risponda da sola ai commenti o ai messaggi diretti, o che certifichi la conformità: "
                          "non lo fa, e il primo giorno di prova si vede. Il divieto è scritto anche dentro ogni "
                          "Prompt Definitivo, perché è Predis a scrivere il testo sulla grafica: un «-90% di "
                          "tempo» stampato su un'immagine è una promessa pubblica che nessun dato sostiene."),
        ("Funzioni riservate", "Report vocali e Social & Annunci sono del piano Enterprise, e i post che li "
                               "mostrano lo dichiarano: chi arriva in prova cercandoli non li troverebbe."),
        ("Come rigenerare", "python scripts/piano-editoriale.py [percorso.xlsx] — cambiando INIZIO nello script "
                            "si sposta tutto il calendario."),
    ]

    for indice, (etichetta, testo) in enumerate(righe, start=3):
        cella_etichetta = foglio.cell(row=indice, column=1, value=etichetta)
        cella_etichetta.font = Font(name="Arial", size=10, bold=True)
        cella_etichetta.alignment = Alignment(vertical="top", wrap_text=True)

        cella_testo = foglio.cell(row=indice, column=2, value=testo)
        cella_testo.font = font_corpo
        cella_testo.alignment = Alignment(vertical="top", wrap_text=True)
        foglio.row_dimensions[indice].height = 42


if __name__ == "__main__":
    percorso = Path(sys.argv[1]) if len(sys.argv) > 1 else DESTINAZIONE_PREDEFINITA
    scrivi_piano(percorso)
    print(f"Creato: {percorso}")
    print(f"Post: {len(POSTS)} su {len(COLONNE)} colonne")
