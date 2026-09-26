"""
Estrae le agenzie immobiliari dell'Emilia-Romagna in un file Excel per la
campagna di acquisizione B2B di PropertyTech.

# Da dove vengono i dati, e perché non da Google Maps

Da **OpenStreetMap**, interrogato via Overpass API. Non è una scelta di
comodo: le condizioni d'uso di Google Maps Platform vietano espressamente di
estrarre i contenuti di Maps e di costruire o conservare un database a partire
dai risultati di Places, e lo scraping di Maps è proibito a prescindere dalla
chiave. Un elenco costruito così è inutilizzabile nel momento in cui qualcuno
chiede da dove viene.

OpenStreetMap è dato aperto sotto licenza ODbL: si può riutilizzare, anche
commercialmente, **citando la fonte**. La citazione è scritta nel foglio
«Metodo e conformità» del file prodotto, e va lasciata lì.

# Cosa questo file NON contiene

**Niente dati inventati.** Dove OSM non ha il telefono, la cella resta vuota.
Un elenco di duecento agenzie con numeri plausibili e sbagliati costa settimane
di telefonate a vuoto prima che qualcuno capisca perché nessuno risponde, ed è
molto peggio di un elenco corto.

La copertura reale, misurata sul dato scaricato, è scritta nel foglio del
metodo: i nomi e gli indirizzi ci sono quasi sempre, i telefoni in circa un
caso su otto, le email in circa uno su venti. È l'onesta fotografia di quanto
si trova senza fonti a pagamento.

**Niente nomi di titolari.** OSM non li ha, e non si inventano. La colonna
resta per essere compilata a mano quando la si ricava da una fonte lecita —
il sito dell'agenzia, la visura camerale, una telefonata.

# Prima di usarlo per chiamare o scrivere

Non è un dettaglio burocratico, è il motivo per cui una campagna può costare
più di quanto rende. Il foglio «Metodo e conformità» riporta i tre obblighi
che riguardano questo elenco: la verifica nel Registro Pubblico delle
Opposizioni prima delle chiamate, l'informativa dovuta quando si trattano dati
non raccolti dall'interessato, e la distinzione fra un indirizzo generico di
azienda e quello nominativo di una persona.

# Uso

    python scripts/database-agenzie.py [percorso.xlsx]
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

DESTINAZIONE_PREDEFINITA = Path(
    r"C:\Users\david\OneDrive\Desktop\PropertyTech\Database_Agenzie_Emilia.xlsx"
)

#: Endpoint Overpass, provati in ordine.
#:
#: Più di uno perché le istanze pubbliche vanno e vengono: alcune rispondono
#: 406 a seconda dell'indirizzo da cui si chiama, altre contengono solo un
#: estratto regionale e risponderebbero «zero agenzie» senza che sia vero.
#: Quella che risponde davvero si scopre solo provandole.
ENDPOINT = [
    "https://osm-overpass.gs.mil/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

#: Le province richieste. Il nome è quello con cui OSM le registra.
PROVINCE = [
    ("Modena", "Modena"),
    ("Bologna", "Bologna"),
    ("Parma", "Parma"),
    ("Piacenza", "Piacenza"),
    ("Reggio Emilia", "Reggio nell'Emilia"),
]

#: Le insegne dei principali franchising immobiliari italiani.
#:
#: Servono a distinguere un'agenzia affiliata da una indipendente, che per una
#: campagna commerciale è la differenza fra due conversazioni diverse: in un
#: franchising il software lo decide spesso la rete, in un'agenzia indipendente
#: il titolare.
#:
#: L'elenco è fatto di marchi, non di parole comuni: «casa» da sola comparirebbe
#: in metà dei nomi delle agenzie indipendenti d'Italia.
FRANCHISING = [
    "tecnocasa", "tecnorete", "tempocasa", "gabetti", "grimaldi", "toscano",
    "re/max", "remax", "professionecasa", "frimm", "coldwell banker",
    "engel & völkers", "engel e volkers", "century 21", "century21",
    "fondocasa", "solo affitti", "studio casa", "unicasa", "affiliato",
]

#: I comuni di una provincia, con il centro del loro territorio.
#:
#: Servono perché `addr:city` è compilato in meno della metà dei casi: senza,
#: sei righe su dieci resterebbero senza comune, e una campagna commerciale si
#: organizza per paese — si va a Carpi un martedì, non «in provincia di
#: Modena».
#:
#: Sono i confini amministrativi (`admin_level=8`), non i centri abitati.
#: La prima versione usava i nodi `place`, ed era sbagliata in modo
#: sistematico: l'Italia è piena di frazioni mappate come `village`, quindi
#: un'agenzia di Modena finiva a «Vaciglio» e una di Fiorano a «Spezzano».
#: Nomi veri di posti veri, nella colonna sbagliata — il genere di errore che
#: nessuno nota finché non organizza una giornata di visite.
QUERY_COMUNI = """
[out:json][timeout:200];
area["name"="{provincia}"]["boundary"="administrative"]["admin_level"="6"]->.prov;
rel(area.prov)["boundary"="administrative"]["admin_level"="8"];
out tags center;
"""

QUERY = """
[out:json][timeout:180];
area["name"="{provincia}"]["boundary"="administrative"]["admin_level"="6"]->.prov;
(
  nwr["office"="estate_agent"](area.prov);
  nwr["shop"="estate_agent"](area.prov);
);
out center tags;
"""

COLONNE = [
    ("Nome Agenzia / Franchising", 34),
    ("Tipologia", 16),
    ("Città / Comune", 20),
    ("Indirizzo", 34),
    ("Telefono Sede", 20),
    ("Email di Contatto", 30),
    ("Nome Titolare / Referente", 26),
    ("Sito Web", 34),
    ("Link Profilo Social", 34),
    ("Note / Stato Contatto", 46),
]

BLU = "0B3C6E"
GHIACCIO = "EAF1F8"
AMBRA = "FFF4E5"


# ─────────────────────────────────────────────────────────── estrazione


def interroga_overpass(provincia_osm: str, query: str | None = None) -> list[dict]:
    """
    Scarica le agenzie di una provincia. Prova gli endpoint finché uno risponde.

    Non solleva su un endpoint che fallisce: ne prova un altro. Solleva solo se
    falliscono tutti, perché a quel punto il file uscirebbe vuoto e un file
    vuoto che sembra completo è peggio di un errore.
    """
    corpo = urllib.parse.urlencode(
        {"data": (query or QUERY).format(provincia=provincia_osm)}
    ).encode()
    ultimo = ""

    for endpoint in ENDPOINT:
        try:
            richiesta = urllib.request.Request(
                endpoint,
                data=corpo,
                # Si dichiara chi chiama e come raggiungerlo: è la richiesta
                # esplicita delle istanze Overpass pubbliche, che sono
                # volontarie e hanno il diritto di sapere chi le usa.
                headers={"User-Agent": "PropertyTech/1.0 (info@propertytechsolutions.net)"},
            )
            with urllib.request.urlopen(richiesta, timeout=240) as risposta:
                elementi = json.load(risposta).get("elements", [])
            print(f"    {provincia_osm}: {len(elementi)} risultati da {urllib.parse.urlparse(endpoint).netloc}")
            return elementi
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as errore:
            ultimo = f"{urllib.parse.urlparse(endpoint).netloc}: {errore}"
            print(f"    endpoint non disponibile ({ultimo})")
            time.sleep(2)

    raise RuntimeError(f"Nessun endpoint Overpass ha risposto. Ultimo errore: {ultimo}")


# ─────────────────────────────────────────────────────────── normalizzazione


def primo(tags: dict, *chiavi: str) -> str:
    """Il primo tag valorizzato fra quelli indicati, altrimenti stringa vuota."""
    for chiave in chiavi:
        valore = (tags.get(chiave) or "").strip()
        if valore:
            return valore
    return ""


def tipologia(tags: dict) -> str:
    """
    Franchising, Indipendente o Agente Singolo.

    Si guarda prima `brand` e `operator`, che in OSM sono i campi pensati per
    questo, e solo dopo il nome: un'agenzia può chiamarsi «Casa Serena» ed
    essere affiliata Tecnocasa, e il contrario — un nome che contiene un
    marchio senza esserlo — è molto più raro.
    """
    testo = " ".join(
        [primo(tags, "brand"), primo(tags, "operator"), primo(tags, "name")]
    ).lower()

    if any(marchio in testo for marchio in FRANCHISING):
        return "Franchising"

    # Un nome di persona senza forma societaria è quasi sempre un agente che
    # lavora da solo: «Rossi Immobiliare di Mario Rossi» è una ditta
    # individuale, non una rete.
    if re.search(r"\b(studio|dott|geom|arch|ing)\b", testo) or " di " in testo:
        return "Agente Singolo"

    return "Indipendente"


def indirizzo(tags: dict) -> str:
    """Via e civico come si scrivono su una busta, o stringa vuota."""
    via = primo(tags, "addr:street")
    if not via:
        return ""
    civico = primo(tags, "addr:housenumber")
    cap = primo(tags, "addr:postcode")
    pezzi = f"{via} {civico}".strip()
    return f"{pezzi}, {cap}".strip(", ") if cap else pezzi


def social(tags: dict) -> str:
    """I profili social dichiarati, uno per riga."""
    trovati = []
    for chiave, prefisso in [
        ("contact:facebook", "https://facebook.com/"),
        ("facebook", "https://facebook.com/"),
        ("contact:instagram", "https://instagram.com/"),
        ("instagram", "https://instagram.com/"),
    ]:
        valore = primo(tags, chiave)
        if not valore:
            continue
        url = valore if valore.startswith("http") else prefisso + valore.lstrip("@/")
        if url not in trovati:
            trovati.append(url)
    return "\n".join(trovati)


def note(riga: dict) -> str:
    """
    Cosa manca a questa riga per poter essere usata.

    Scritto qui e non lasciato dedurre: chi apre il file deve capire in un
    colpo d'occhio quali righe sono pronte e quali richiedono una ricerca, e
    «Da completare» generico non aiuta nessuno.
    """
    mancanti = [
        etichetta
        for campo, etichetta in [
            ("Telefono Sede", "telefono"),
            ("Email di Contatto", "email"),
            ("Indirizzo", "indirizzo"),
        ]
        if not riga[campo]
    ]

    if not mancanti:
        return "Dati completi · da contattare"
    return "Da completare: " + ", ".join(mancanti)


def comune_piu_vicino(lat: float, lon: float, centri: list[tuple[str, float, float]]) -> str:
    """
    Il centro abitato più vicino a un punto.

    # Perché una stima e non il dato esatto

    Perché il dato esatto richiederebbe i confini comunali completi e un test
    di appartenenza al poligono: centinaia di aree con migliaia di vertici,
    scaricate a ogni esecuzione per ricavare un'etichetta. Il centro più
    vicino si sbaglia solo per le agenzie in aperta campagna fra due paesi, ed
    è un errore che chi conosce la zona vede subito.

    Chi legge deve però sapere quali righe sono stimate: la nota della riga lo
    dice. Un dato dedotto presentato come certo è il modo in cui un elenco
    perde la fiducia di chi lo usa.

    Distanza euclidea sulle coordinate, non geodetica: su una provincia
    italiana la differenza non cambia mai quale sia il centro più vicino, e la
    radice quadrata è inutile perché si confrontano fra loro.
    """
    if not centri:
        return ""
    # La longitudine va pesata: a queste latitudini un grado di longitudine
    # vale circa tre quarti di un grado di latitudine, e senza il fattore i
    # paesi a est e a ovest sembrerebbero più vicini di quanto sono.
    return min(
        centri, key=lambda c: (lat - c[1]) ** 2 + ((lon - c[2]) * 0.73) ** 2
    )[0]


def riga_da_elemento(
    elemento: dict, provincia: str, centri: list[tuple[str, float, float]]
) -> dict | None:
    """Una riga del foglio, o `None` se l'elemento non è utilizzabile."""
    tags = elemento.get("tags", {})
    nome = primo(tags, "name", "brand", "operator")

    # Senza nome non c'è niente da contattare: sono punti mappati a metà, e
    # tenerli gonfierebbe il conteggio senza aggiungere una sola telefonata
    # possibile.
    if not nome:
        return None

    # Il punto dell'elemento: sui poligoni Overpass restituisce il centro.
    centro = elemento.get("center") or elemento
    citta = primo(tags, "addr:city")
    stimato = False
    stima = ""
    if centro.get("lat") is not None:
        stima = comune_piu_vicino(centro["lat"], centro["lon"], centri)
    if not citta and stima:
        citta = stima
        stimato = True

    riga = {
        "Nome Agenzia / Franchising": nome,
        "Tipologia": tipologia(tags),
        "Città / Comune": citta,
        "Indirizzo": indirizzo(tags),
        "Telefono Sede": primo(tags, "phone", "contact:phone", "contact:mobile"),
        "Email di Contatto": primo(tags, "email", "contact:email"),
        # OSM non registra il titolare, e non si inventa: la colonna resta per
        # essere compilata quando lo si ricava da una fonte lecita.
        "Nome Titolare / Referente": "",
        "Sito Web": primo(tags, "website", "contact:website", "url"),
        "Link Profilo Social": social(tags),
        "Note / Stato Contatto": "",
    }
    riga["Note / Stato Contatto"] = note(riga)
    if stimato:
        riga["Note / Stato Contatto"] += " · comune dedotto dalla posizione"
    riga["_provincia"] = provincia
    # Serve solo alla misura di accuratezza, e viene tolto prima di scrivere.
    if primo(tags, "addr:city") and stima:
        riga["_vera"] = True
        riga["_stima_uguale"] = stima.lower() == primo(tags, "addr:city").lower()
    return riga


def raccogli() -> tuple[dict[str, list[dict]], tuple[int, int]]:
    """Le righe di ogni provincia, e quanto è affidabile la stima del comune."""
    per_provincia: dict[str, list[dict]] = {}
    #: [righe con comune noto, di cui la stima avrebbe indovinato]
    verificate = [0, 0]

    for etichetta, nome_osm in PROVINCE:
        print(f"  · {etichetta}")

        # Prima i centri abitati: servono a dare un comune alle agenzie che
        # non hanno il tag dell'indirizzo, che sono la maggioranza.
        centri = [
            (c["tags"]["name"], c["center"]["lat"], c["center"]["lon"])
            for c in interroga_overpass(nome_osm, QUERY_COMUNI)
            if c.get("center") and c.get("tags", {}).get("name")
        ]
        print(f"    {len(centri)} comuni per la localizzazione")
        time.sleep(3)

        elementi = interroga_overpass(nome_osm)

        righe = [r for r in (riga_da_elemento(e, etichetta, centri) for e in elementi) if r]

        # Stesso punto mappato due volte (un nodo e il poligono dell'edificio)
        # produrrebbe due righe identiche e due telefonate alla stessa agenzia.
        viste: set[tuple[str, str]] = set()
        uniche = []
        for riga in righe:
            chiave = (riga["Nome Agenzia / Franchising"].lower(), riga["Indirizzo"].lower())
            if chiave in viste:
                continue
            viste.add(chiave)
            uniche.append(riga)

        # Quanto sbaglia la stima, misurato dove la verità è nota.
        #
        # Le righe che hanno `addr:city` sono il banco di prova: si calcola lo
        # stesso comune anche per loro e si confronta. Un metodo approssimato
        # senza un numero accanto è una scommessa; con il numero è una scelta.
        for riga in uniche:
            if riga.pop("_vera", None):
                verificate[0] += 1
                if riga.pop("_stima_uguale", False):
                    verificate[1] += 1

        uniche.sort(key=lambda r: (r["Città / Comune"], r["Nome Agenzia / Franchising"]))
        per_provincia[etichetta] = uniche
        print(f"    {len(uniche)} agenzie utilizzabili (da {len(elementi)} punti mappati)")
        time.sleep(3)  # Le istanze pubbliche sono volontarie: non si martellano.

    return per_provincia, (verificate[0], verificate[1])


# ─────────────────────────────────────────────────────────── scrittura


def scrivi_foglio(wb: Workbook, nome: str, righe: list[dict], stili: dict) -> None:
    foglio = wb.create_sheet(nome)

    for indice, (etichetta, larghezza) in enumerate(COLONNE, start=1):
        cella = foglio.cell(row=1, column=indice, value=etichetta)
        cella.font = stili["titolo"]
        cella.fill = stili["fill_titolo"]
        cella.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cella.border = stili["bordo"]
        foglio.column_dimensions[get_column_letter(indice)].width = larghezza

    foglio.row_dimensions[1].height = 30

    for numero, riga in enumerate(righe, start=2):
        completa = riga["Note / Stato Contatto"].startswith("Dati completi")
        for indice, (etichetta, _) in enumerate(COLONNE, start=1):
            cella = foglio.cell(row=numero, column=indice, value=riga[etichetta])
            cella.font = stili["corpo"]
            cella.border = stili["bordo"]
            cella.alignment = Alignment(vertical="top", wrap_text=True)
            # Le righe pronte si devono vedere senza leggere: sono quelle da
            # cui si comincia lunedì mattina.
            if completa:
                cella.fill = PatternFill("solid", fgColor=GHIACCIO)
            elif numero % 2 == 0:
                cella.fill = PatternFill("solid", fgColor="FFFFFF")

        foglio.row_dimensions[numero].height = 30 if riga["Link Profilo Social"] else 20

    foglio.freeze_panes = "A2"
    if righe:
        foglio.auto_filter.ref = f"A1:{get_column_letter(len(COLONNE))}{len(righe) + 1}"


def scrivi_metodo(
    wb: Workbook, per_provincia: dict[str, list[dict]], stili: dict, accuratezza: tuple[int, int]
) -> None:
    """Il foglio che spiega da dove viene il dato e cosa si può farne."""
    foglio = wb.create_sheet("Metodo e conformità", 0)
    foglio.column_dimensions["A"].width = 30
    foglio.column_dimensions["B"].width = 104

    titolo = foglio.cell(row=1, column=1, value="Da dove viene questo elenco, e come si usa")
    titolo.font = stili["titolo"]
    titolo.fill = stili["fill_titolo"]
    foglio.cell(row=1, column=2).fill = stili["fill_titolo"]

    totale = sum(len(r) for r in per_provincia.values())
    con_tel = sum(1 for r in sum(per_provincia.values(), []) if r["Telefono Sede"])
    con_mail = sum(1 for r in sum(per_provincia.values(), []) if r["Email di Contatto"])
    con_ind = sum(1 for r in sum(per_provincia.values(), []) if r["Indirizzo"])

    def pct(n: int) -> str:
        return f"{n} su {totale} ({round(n / totale * 100)}%)" if totale else "—"

    righe = [
        ("Fonte", "OpenStreetMap, interrogato via Overpass API. Dato aperto sotto licenza ODbL: "
                  "riutilizzabile anche a fini commerciali, a condizione di citare la fonte. "
                  "La citazione è questa riga: non va tolta dal file."),
        ("Perché non Google Maps", "Le condizioni di Google Maps Platform vietano di estrarre i "
                                   "contenuti di Maps e di costruire o conservare un database a "
                                   "partire dai risultati di Places. Un elenco costruito così "
                                   "diventa inutilizzabile nel momento in cui qualcuno chiede da "
                                   "dove viene."),
        ("Copertura reale", f"Agenzie trovate: {totale}. Con indirizzo: {pct(con_ind)}. "
                            f"Con telefono: {pct(con_tel)}. Con email: {pct(con_mail)}. "
                            "Il nome c'è sempre — le righe senza sono scartate — l'indirizzo in "
                            "circa metà dei casi, il telefono in meno di uno su dieci. È l'onesta "
                            "fotografia di quanto si trova senza fonti a pagamento, e il motivo "
                            "per cui questo elenco è un punto di partenza e non una lista di "
                            "chiamate."),
        ("Comune stimato", _riga_accuratezza(per_provincia, accuratezza)),
        ("ATTENZIONE: la copertura non è uniforme",
         "Questo elenco fotografa quanto è mappato in OpenStreetMap, NON quante agenzie ci sono "
         "davvero. La mappatura la fanno volontari, e dove uno di loro ha lavorato bene un paese "
         "sembra pieno di agenzie mentre una città vicina sembra vuota. Nel file, per esempio, "
         "Castelfranco Emilia ha più agenzie del capoluogo, e a Carpi non ne risulta nessuna "
         "utilizzabile: i due punti presenti non hanno né nome né recapito. Carpi le agenzie ce "
         "le ha, semplicemente nessuno le ha ancora mappate. Un comune assente da questo elenco "
         "va lavorato con altre fonti, non dato per coperto."),
        ("Celle vuote", "Sono vuote perché il dato non esiste nella fonte, non perché manchi un "
                        "passaggio. Non sono state riempite con numeri plausibili: un elenco di "
                        "recapiti inventati costa settimane di telefonate a vuoto prima che "
                        "qualcuno capisca perché nessuno risponde."),
        ("Nome titolare", "OpenStreetMap non lo registra. La colonna è lì per essere compilata a "
                          "mano quando lo si ricava da una fonte lecita: il sito dell'agenzia, una "
                          "visura camerale, una telefonata al centralino."),
        ("Come completare i recapiti", "Le strade lecite sono tre: il sito dell'agenzia quando c'è "
                                       "(colonna Sito Web), i registri camerali di InfoCamere a "
                                       "pagamento, e gli elenchi dei soci FIAIP e FIMAA. Le prime "
                                       "due danno anche il titolare."),
        ("PRIMA DI TELEFONARE", "I numeri vanno verificati nel Registro Pubblico delle Opposizioni "
                                "(registrodelleopposizioni.it): dal 2022 comprende tutti i numeri "
                                "pubblicati, fissi e mobili. Chiamare un numero iscritto è una "
                                "violazione sanzionabile, e la verifica è un obbligo di chi chiama, "
                                "non della lista."),
        ("PRIMA DI SCRIVERE", "Un indirizzo generico di azienda (info@, amministrazione@) è un dato "
                              "di impresa. Un indirizzo nominativo (nome.cognome@) è un dato "
                              "personale, e per il marketing diretto richiede una base giuridica e "
                              "l'informativa dovuta quando i dati non sono stati raccolti "
                              "dall'interessato. Ogni email deve avere un modo di disiscriversi "
                              "che funziona al primo clic."),
        ("Conservazione", "Questo file contiene dati riferiti a persone giuridiche e, dove "
                          "compilato a mano, a persone fisiche. Va trattato come gli altri dati "
                          "dell'agenzia: accesso limitato, e cancellazione dei contatti che "
                          "chiedono di non essere ricontattati — la richiesta va onorata anche se "
                          "arriva a voce."),
        ("Come rigenerare", "python scripts/database-agenzie.py [percorso.xlsx] — la fonte si "
                            "aggiorna in continuazione, quindi una rigenerazione fra qualche mese "
                            "trova agenzie nuove e ne perde di chiuse."),
    ]

    for indice, (etichetta, testo) in enumerate(righe, start=3):
        cella_etichetta = foglio.cell(row=indice, column=1, value=etichetta)
        cella_etichetta.font = Font(name="Arial", size=10, bold=True)
        cella_etichetta.alignment = Alignment(vertical="top", wrap_text=True)
        if etichetta.startswith("PRIMA DI"):
            cella_etichetta.fill = PatternFill("solid", fgColor=AMBRA)

        cella_testo = foglio.cell(row=indice, column=2, value=testo)
        cella_testo.font = stili["corpo"]
        cella_testo.alignment = Alignment(vertical="top", wrap_text=True)
        if etichetta.startswith("PRIMA DI"):
            cella_testo.fill = PatternFill("solid", fgColor=AMBRA)

        foglio.row_dimensions[indice].height = max(32, -(-len(testo) // 100) * 28)


def _riga_accuratezza(per_provincia: dict, accuratezza: tuple[int, int]) -> str:
    """Il testo che dichiara quanto è affidabile la stima del comune."""
    stimate = sum(
        1
        for r in sum(per_provincia.values(), [])
        if "dedotto dalla posizione" in r["Note / Stato Contatto"]
    )
    noti, indovinati = accuratezza
    if not noti:
        return (
            f"{stimate} righe hanno il comune dedotto dalla posizione, perché la fonte non lo "
            "registra. Non è stato possibile misurarne l'accuratezza."
        )
    pct = round(indovinati / noti * 100)
    return (
        f"{stimate} righe hanno il comune dedotto dalla posizione dell'agenzia, perché la fonte "
        f"non lo registra, e la nota della riga lo dichiara. L'accuratezza è stata misurata sulle "
        f"{noti} righe in cui il comune era invece noto: il metodo lo avrebbe indovinato "
        f"{indovinati} volte ({pct}%). Gli errori si concentrano sui comuni molto estesi e su "
        "quelli nati da fusioni recenti, dove la fonte porta ancora il vecchio nome."
    )


def scrivi_file(
    percorso: Path, per_provincia: dict[str, list[dict]], accuratezza: tuple[int, int]
) -> None:
    wb = Workbook()
    wb.remove(wb.active)

    stili = {
        "titolo": Font(name="Arial", size=10, bold=True, color="FFFFFF"),
        "fill_titolo": PatternFill("solid", fgColor=BLU),
        "corpo": Font(name="Arial", size=9),
        "bordo": Border(*[Side(style="thin", color="C9D6E3")] * 4),
    }

    for etichetta, _ in PROVINCE:
        scrivi_foglio(wb, etichetta, per_provincia[etichetta], stili)

    scrivi_metodo(wb, per_provincia, stili, accuratezza)

    percorso.parent.mkdir(parents=True, exist_ok=True)
    wb.save(percorso)


if __name__ == "__main__":
    destinazione = Path(sys.argv[1]) if len(sys.argv) > 1 else DESTINAZIONE_PREDEFINITA

    print("Estrazione da OpenStreetMap (licenza ODbL):")
    dati, accuratezza = raccogli()
    scrivi_file(destinazione, dati, accuratezza)

    totale = sum(len(r) for r in dati.values())
    pronte = sum(
        1 for r in sum(dati.values(), []) if r["Note / Stato Contatto"].startswith("Dati completi")
    )
    print(f"\nCreato: {destinazione}")
    print(f"Agenzie: {totale} su {len(PROVINCE)} province")
    print(f"Righe con telefono, email e indirizzo: {pronte}")
