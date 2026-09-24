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

# Uso

    python scripts/piano-editoriale.py [percorso.xlsx]
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

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
    ("Prompt Visuale per Predis.ai", 72),
    ("Hashtag", 40),
]

BLU = "0B3C6E"
GHIACCIO = "EAF1F8"

# Ogni voce: (ora, piattaforma, formato, tema, hook, copy, prompt, hashtag)
POSTS: list[tuple[str, str, str, str, str, str, str, str]] = [
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
    ),
    (
        "13:00",
        "Instagram",
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
    ),
    (
        "18:30",
        "Facebook",
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
    ),
    (
        "20:30",
        "Instagram",
        "Immagine Singola",
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
        "Professional stock photograph, 4:5 portrait. A close-up of an official-looking paper "
        "checklist on a desk with a pen resting on it, some lines ticked, beside a small stack of "
        "property documents and a set of house keys. Top-down flat lay, natural daylight, muted "
        "navy and cream palette, crisp focus. Realistic editorial photography. No readable text on "
        "the paper, no screens, no software interfaces, no logos. Generous empty space at the top "
        "for a headline overlay.",
        "#rogito #duediligence #agenziaimmobiliare #documenti #proptech #immobiliare #notaio",
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
    ),
    (
        "13:00",
        "Instagram",
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
    ),
    (
        "18:30",
        "Facebook",
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
    ),
    (
        "20:30",
        "Instagram",
        "Immagine Singola",
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
        "Professional stock photograph, 4:5 portrait. Close-up of two hands connecting a cable "
        "into a modern network switch in a clean office environment, or alternatively a tidy desk "
        "with a smartphone and a paper notebook side by side. Cool blue and grey palette, crisp "
        "lighting, minimal composition. Realistic corporate photography. No text, no screen "
        "content, no software interfaces, no logos. Generous negative space for a headline.",
        "#gdpr #gestionaleimmobiliare #integrazione #proptech #immobiliare #privacy #agenziaimmobiliare",
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
    ),
    (
        "13:00",
        "Instagram",
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
    ),
    (
        "18:30",
        "Facebook",
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
    ),
    (
        "20:30",
        "Instagram",
        "Immagine Singola",
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
        "Professional stock photograph, 4:5 portrait. A wall of old wooden filing drawers with one "
        "drawer slightly open, warm side lighting, shallow depth of field on the open drawer. "
        "Nobody in frame. Muted warm browns and navy shadows, editorial still-life photography. No "
        "text, no labels readable, no screens, no software interfaces, no logos. Generous plain "
        "space at the top for a headline overlay.",
        "#asteimmobiliari #matchmaking #clienti #proptech #immobiliare #portafoglioimmobili",
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
    ),
    (
        "13:00",
        "Instagram",
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
    ),
    (
        "18:30",
        "Facebook",
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
    ),
    (
        "20:30",
        "Instagram",
        "Immagine Singola",
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
        "Professional stock photograph, 4:5 portrait. A person's hands holding a smartphone in a "
        "bright modern office, screen angled away from the camera so no interface is visible, a cup "
        "of coffee and a notebook on the desk beside them. Warm morning light, shallow depth of "
        "field, optimistic mood. Realistic corporate photography. No text, no visible screen "
        "content, no software interfaces, no logos. Leave the top third plain for a headline "
        "overlay.",
        "#provagratuita #proptech #agenziaimmobiliare #immobiliare #intelligenzaartificiale #gdpr #digitalizzazione",
    ),
]


def giorni_lavorativi(inizio: datetime.date, quanti: int) -> list[datetime.date]:
    """Le prime `quanti` date da lunedì a venerdì, a partire da `inizio`."""
    date: list[datetime.date] = []
    giorno = inizio
    while len(date) < quanti:
        if giorno.weekday() < 5:
            date.append(giorno)
        giorno += datetime.timedelta(days=1)
    return date


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
        ora, piattaforma, formato, tema, hook, copy, prompt, hashtag = post
        valori = [giorno, ora, piattaforma, formato, tema, hook, copy, prompt, hashtag]

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

        # Altezza generosa: il testo a capo da solo non alza la riga, e senza
        # questo il copy resta tagliato all'apertura del file.
        foglio.row_dimensions[riga].height = 210

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
        ("Colonna Copy Completo", "Testo pronto da incollare. Gli a capo sono già quelli giusti per il post: "
                                  "copia la cella, non riscriverla."),
        ("Colonna Prompt Visuale", "Da incollare in Predis.ai così com'è, in inglese. Ogni prompt dichiara il formato "
                                   "(9:16 per i Reel, 1:1 e 4:5 per gli altri) e vieta esplicitamente schermate di "
                                   "software: un'interfaccia in un post invecchia in un mese e non comunica nulla."),
        ("Hashtag", "Da cinque a sette per post, mescolando settore (#immobiliare, #agenteimmobiliare) e "
                    "tecnologia (#proptech). Non riusarli tutti identici su ogni post."),
        ("Cosa NON dire", "Nessuna percentuale di risultato inventata, nessun prezzo, e mai promettere che l'AI "
                          "risponda da sola ai commenti o ai messaggi diretti, o che certifichi la conformità: "
                          "non lo fa, e il primo giorno di prova si vede."),
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
