"""
Importa nel database gli elenchi dei soci FIAIP, FIMAA o di altre fonti.

# Perché un'importazione e non un'estrazione automatica

Perché gli elenchi dei soci non sono dati aperti. Stanno dietro a portali di
associazioni che ne regolano l'uso, e in molti casi sono elenchi di **persone**
— l'agente iscritto, non la società. Raccoglierli a macchina significherebbe
decidere al posto tuo che quell'uso è consentito, e quella decisione la può
prendere solo chi ha il rapporto con l'associazione.

Quindi qui si fa l'opposto: tu porti i dati che hai il diritto di usare, e
questo script si occupa della parte noiosa e facile da sbagliare — allinearli
alle colonne giuste, non creare doppioni con le agenzie già in elenco,
scartare le righe che non servono a nulla, e lasciare scritto da dove vengono.

# Come si usa

    python scripts/importa-soci.py --modello

crea `Modello_Soci.csv` accanto al database: lo apri, ci incolli l'elenco, lo
salvi. Poi:

    python scripts/importa-soci.py Modello_Soci.csv [altro.csv ...]

Le righe vengono aggiunte al foglio della provincia giusta. Il confronto con
quelle già presenti non è sul nome esatto: «Rossi Immobiliare S.r.l.» e
«Rossi Immobiliare srl» sono la stessa agenzia, e un elenco che la contiene
due volte fa fare due telefonate alla stessa persona.

# Una cosa da sapere prima di importare un elenco soci

Un elenco di iscritti a un'associazione è in buona parte fatto di dati
personali: nome e cognome dell'agente, spesso il suo cellulare. Per usarli in
una campagna commerciale servono una base giuridica e l'informativa dovuta
quando i dati non sono stati raccolti dall'interessato. Non è un ostacolo
formale: è la differenza fra una campagna e una segnalazione al Garante.
Il foglio «Metodo e conformità» del database lo riporta per esteso.
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

#: Dove vive il database.
#:
#: Si cerca invece di indovinare il percorso: la cartella viene spostata e
#: rinominata da chi la usa — «Liste Lead DA CONTATTARE» è diventata «Liste
#: Lead Immobiliari DA CONTATTARE» mentre uno script stava girando — e un
#: percorso scritto a mano si rompe a ogni riordino del desktop.
RADICE = Path(r"C:\Users\david\OneDrive\Desktop\PropertyTech")
NOME_FILE = "Database_Agenzie_Emilia.xlsx"

PROVINCE = ["Modena", "Bologna", "Parma", "Piacenza", "Reggio Emilia"]

COLONNE_CSV = [
    "Provincia",
    "Nome Agenzia / Franchising",
    "Tipologia",
    "Città / Comune",
    "Indirizzo",
    "Telefono Sede",
    "Email di Contatto",
    "Nome Titolare / Referente",
    "Sito Web",
    "Link Profilo Social",
    "Fonte",
]

#: Righe d'esempio nel modello.
#:
#: Una sola, e riconoscibile come finta. Un modello senza esempio si compila
#: sbagliato — qualcuno scrive la provincia per esteso, qualcun altro mette il
#: prefisso fra parentesi — ma un esempio che sembra vero finisce in produzione
#: e qualcuno prova a chiamarlo.
ESEMPIO = [
    "Modena",
    "ESEMPIO — Agenzia Rossi (cancellare questa riga)",
    "Indipendente",
    "Carpi",
    "Via Roma 1",
    "059 000000",
    "esempio@esempio.it",
    "Mario Rossi",
    "https://esempio.it",
    "",
    "FIAIP",
]

#: Forme societarie e rumore che non distinguono due agenzie diverse.
RUMORE = re.compile(
    r"\b(s\.?r\.?l\.?s?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?p\.?a\.?|soc\.?|societa|"
    r"immobiliare|agenzia|studio|gruppo|di|dei|del|della|e|&)\b",
    re.I,
)


def impronta(nome: str, comune: str) -> str:
    """
    La forma normalizzata con cui si riconosce un doppione.

    Si tolgono accenti, punteggiatura, forme societarie e le parole che
    compaiono in metà dei nomi del settore. Quello che resta — «rossi» più il
    comune — è ciò che distingue davvero un'agenzia da un'altra.

    È volutamente aggressiva: un falso doppione fa perdere un contatto, un
    doppione vero fa telefonare due volte alla stessa persona. Fra i due, il
    secondo danneggia la reputazione dell'agenzia che chiama.
    """
    testo = f"{nome} {comune}".lower()
    testo = unicodedata.normalize("NFKD", testo).encode("ascii", "ignore").decode()
    testo = RUMORE.sub(" ", testo)
    return " ".join(sorted(re.findall(r"[a-z0-9]{3,}", testo)))


def dominio(sito: str) -> str:
    """Il dominio di un sito, senza `www` né percorso."""
    if not sito:
        return ""
    netloc = re.sub(r"^https?://", "", sito.strip().lower()).split("/")[0]
    return netloc.removeprefix("www.")


def impronte(riga: dict) -> set[str]:
    """
    Tutti i modi in cui questa riga può essere già in elenco.

    Il nome più il comune non basta, e l'ho scoperto provando: «Eden
    Immobiliare S.r.l.» a Modena e «Eden Immobiliare» a Castelfranco sono la
    stessa agenzia con la sede scritta in due modi, e con la sola impronta del
    nome finivano in elenco due volte.

    Il sito e il telefono sono identificatori più forti del nome: due agenzie
    diverse possono chiamarsi entrambe «Casa Serena», ma non condividono un
    dominio né un numero. Basta che **una** delle tre impronte coincida.
    """
    trovate = {"n:" + impronta(riga.get("Nome Agenzia / Franchising") or "",
                               riga.get("Città / Comune") or "")}

    d = dominio(riga.get("Sito Web") or "")
    # I portali di rete non identificano la singola agenzia: venti affiliati
    # Tempocasa hanno tutti `tempocasa.it`, e unirli sarebbe peggio del
    # doppione.
    if d and d.count(".") <= 2 and not any(
        rete in d for rete in ("tempocasa", "tecnocasa", "tecnorete", "gabetti", "remax", "engelvoelkers")
    ):
        trovate.add("s:" + d)

    tel = re.sub(r"\D", "", str(riga.get("Telefono Sede") or ""))
    if tel.startswith("39") and len(tel) > 11:
        tel = tel[2:]
    if len(tel) >= 9:
        trovate.add("t:" + tel)

    return trovate


def trova_file() -> Path:
    """
    Il database, ovunque sia finito dentro la cartella di lavoro.

    Il più recente, se per qualche motivo ce ne fosse più di uno: è quello su
    cui la persona sta lavorando, e sovrascrivere una copia vecchia
    sembrerebbe che il lavoro sia andato perso.
    """
    diretto = RADICE / NOME_FILE
    if diretto.exists():
        return diretto

    # `~$` davanti al nome è il file di lock che Excel crea quando tiene
    # aperto il documento: non è il documento.
    trovati = [p for p in RADICE.rglob(NOME_FILE) if not p.name.startswith("~$")]
    if not trovati:
        raise SystemExit(f"«{NOME_FILE}» non trovato dentro {RADICE}.")

    return max(trovati, key=lambda p: p.stat().st_mtime)


def scrivi_modello(destinazione: Path) -> None:
    with destinazione.open("w", newline="", encoding="utf-8-sig") as f:
        scrittore = csv.writer(f, delimiter=";")
        scrittore.writerow(COLONNE_CSV)
        scrittore.writerow(ESEMPIO)
    print(f"Modello creato: {destinazione}")
    print("\nColonne, nell'ordine:")
    for nome in COLONNE_CSV:
        print(f"  · {nome}")
    print(
        "\nProvincia: una fra "
        + ", ".join(PROVINCE)
        + ".\nTipologia: Franchising, Indipendente o Agente Singolo."
        "\nFonte: FIAIP, FIMAA, o come si chiama l'elenco da cui viene la riga."
        "\nSeparatore: punto e virgola. Excel lo apre e lo salva così senza chiedere niente."
    )


def leggi_csv(percorso: Path) -> list[dict]:
    with percorso.open(newline="", encoding="utf-8-sig") as f:
        # Il separatore lo sceglie chi salva il file, non noi: Excel italiano
        # usa il punto e virgola, Excel inglese la virgola, e un import che
        # fallisce per questo è il primo motivo per cui poi si fa tutto a mano.
        campione = f.read(4096)
        f.seek(0)
        try:
            dialetto = csv.Sniffer().sniff(campione, delimiters=";,\t")
        except csv.Error:
            dialetto = csv.excel
            dialetto.delimiter = ";"
        return [r for r in csv.DictReader(f, dialect=dialetto)]


def valida(riga: dict, numero: int) -> tuple[dict | None, str]:
    """La riga pronta per il foglio, oppure `None` e il motivo dello scarto."""
    nome = (riga.get("Nome Agenzia / Franchising") or "").strip()
    provincia = (riga.get("Provincia") or "").strip()

    if not nome:
        return None, f"riga {numero}: senza nome"
    if nome.upper().startswith("ESEMPIO"):
        return None, f"riga {numero}: è la riga d'esempio del modello"
    if provincia not in PROVINCE:
        return None, f"riga {numero}: provincia «{provincia}» non fra quelle previste"

    contatti = [
        (riga.get(c) or "").strip()
        for c in ["Telefono Sede", "Email di Contatto", "Sito Web"]
    ]
    if not any(contatti):
        return None, f"riga {numero}: «{nome[:30]}» non ha telefono, email né sito"

    email = (riga.get("Email di Contatto") or "").strip()
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", email, re.I):
        return None, f"riga {numero}: email «{email}» non è un indirizzo"

    fonte = (riga.get("Fonte") or "elenco importato").strip()
    return {
        "Provincia": provincia,
        "Nome Agenzia / Franchising": nome,
        "Tipologia": (riga.get("Tipologia") or "Indipendente").strip(),
        "Città / Comune": (riga.get("Città / Comune") or "").strip(),
        "Indirizzo": (riga.get("Indirizzo") or "").strip(),
        "Telefono Sede": (riga.get("Telefono Sede") or "").strip(),
        "Email di Contatto": email,
        "Nome Titolare / Referente": (riga.get("Nome Titolare / Referente") or "").strip(),
        "Sito Web": (riga.get("Sito Web") or "").strip(),
        "Link Profilo Social": (riga.get("Link Profilo Social") or "").strip(),
        "Note / Stato Contatto": f"Da contattare · fonte: {fonte}",
    }, ""


def main() -> None:
    argomenti = sys.argv[1:]
    percorso = trova_file()

    if not argomenti or argomenti[0] == "--modello":
        scrivi_modello(percorso.parent / "Modello_Soci.csv")
        return

    wb = load_workbook(percorso)

    # Le impronte di quello che c'è già, per non aggiungerlo una seconda volta.
    esistenti: set[str] = set()
    for provincia in PROVINCE:
        foglio = wb[provincia]
        intestazioni = [c.value for c in foglio[1]]
        col = {n: i + 1 for i, n in enumerate(intestazioni)}
        for riga in range(2, foglio.max_row + 1):
            valori = {
                nome: foglio.cell(row=riga, column=indice).value
                for nome, indice in col.items()
            }
            if valori.get("Nome Agenzia / Franchising"):
                esistenti |= impronte({k: str(v or "") for k, v in valori.items()})

    print(f"Già in elenco: {len(esistenti)} agenzie\n")

    da_aggiungere: dict[str, list[dict]] = {p: [] for p in PROVINCE}
    scarti: list[str] = []
    doppioni = 0

    for argomento in argomenti:
        file_csv = Path(argomento)
        if not file_csv.exists():
            scarti.append(f"{file_csv}: non esiste")
            continue

        righe = leggi_csv(file_csv)
        print(f"{file_csv.name}: {len(righe)} righe")

        for numero, grezza in enumerate(righe, start=2):
            riga, motivo = valida(grezza, numero)
            if not riga:
                scarti.append(f"{file_csv.name} {motivo}")
                continue

            marchi = impronte(riga)
            if marchi & esistenti:
                doppioni += 1
                continue

            esistenti |= marchi
            da_aggiungere[riga.pop("Provincia")].append(riga)

    # ── Scrittura
    bordo = Border(*[Side(style="thin", color="C9D6E3")] * 4)
    corpo = Font(name="Arial", size=9)
    evidenza = PatternFill("solid", fgColor="EAF6EC")

    aggiunte = 0
    for provincia in PROVINCE:
        righe = da_aggiungere[provincia]
        if not righe:
            continue
        foglio = wb[provincia]
        intestazioni = [c.value for c in foglio[1]]
        prossima = foglio.max_row + 1

        for riga in righe:
            for indice, nome_colonna in enumerate(intestazioni, start=1):
                cella = foglio.cell(row=prossima, column=indice, value=riga.get(nome_colonna, ""))
                cella.font = corpo
                cella.border = bordo
                cella.alignment = Alignment(vertical="top", wrap_text=True)
                # Le righe importate si devono distinguere da quelle di OSM:
                # hanno una provenienza diversa e, se qualcosa non torna, si
                # deve poter risalire all'elenco da cui sono arrivate.
                cella.fill = evidenza
            prossima += 1
            aggiunte += 1

        foglio.auto_filter.ref = f"A1:{chr(64 + len(intestazioni))}{foglio.max_row}"
        print(f"  {provincia}: +{len(righe)}")

    try:
        wb.save(percorso)
    except PermissionError:
        raise SystemExit(
            "\nIl file è aperto in Excel e non posso scriverci. Chiudilo e rilancia."
        )

    print(f"\nAggiornato: {percorso}")
    print(f"Righe aggiunte: {aggiunte} · doppioni saltati: {doppioni} · scartate: {len(scarti)}")
    for scarto in scarti[:15]:
        print(f"   · {scarto}")
    if len(scarti) > 15:
        print(f"   · … e altre {len(scarti) - 15}")


if __name__ == "__main__":
    main()
