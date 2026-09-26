"""
Completa telefoni ed email leggendo i siti delle agenzie già nel database.

# Cosa fa, e cosa non fa

Apre il sito di ogni agenzia che ne ha uno e ne legge i recapiti **pubblicati
dall'agenzia stessa**: il numero che scrive in fondo alla pagina, l'indirizzo
di posta che mette nei contatti. Non cerca da nessun'altra parte, non deduce
un indirizzo dal dominio, non prova `info@` sperando che esista.

Un `info@` costruito a tavolino è la cosa che fa più danno in una lista come
questa: arriva a destinazione nel 70% dei casi, quindi nessuno si accorge del
30% che rimbalza, e intanto il dominio del mittente accumula bounce fino a
finire in blocco. Meglio venti indirizzi veri che duecento probabili.

# Perché `mailto:` e `tel:` prima del testo

Perché sono dichiarazioni esplicite: chi scrive `href="tel:0594729..."` sta
dicendo «questo è il mio numero, chiamami». Il testo della pagina invece è
pieno di sequenze che somigliano a un telefono senza esserlo — una partita
IVA, un codice fiscale, un numero di iscrizione al ruolo, un CAP accanto a un
civico. Il testo si guarda solo se i link non hanno dato niente, e con regole
più severe.

# Educazione verso i siti

Un sito per volta, con una pausa fra l'uno e l'altro, `robots.txt` rispettato,
e uno `User-Agent` che dice chi siamo e come farci smettere. Sono siti di
piccole imprese, spesso su hosting condivisi: una raffica di richieste si nota
e non è il modo di presentarsi a un potenziale cliente.

# Uso

    python scripts/arricchisci-agenzie.py [percorso.xlsx]

I risultati vengono anche salvati accanto al file, in `.arricchimento.json`:
se l'Excel è aperto e non si può scrivere, la scansione non va rifatta.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

from openpyxl import load_workbook

#: Dove vive il database.
#:
#: Si cerca invece di indovinare il percorso: la cartella viene spostata e
#: rinominata da chi la usa — «Liste Lead DA CONTATTARE» è diventata «Liste
#: Lead Immobiliari DA CONTATTARE» mentre uno script stava girando — e un
#: percorso scritto a mano si rompe a ogni riordino del desktop.
RADICE = Path(r"C:\Users\david\OneDrive\Desktop\PropertyTech")
NOME_FILE = "Database_Agenzie_Emilia.xlsx"

PROVINCE = ["Modena", "Bologna", "Parma", "Piacenza", "Reggio Emilia"]

UA = "PropertyTechBot/1.0 (+https://propertytechsolutions.net; info@propertytechsolutions.net)"

#: Pagine da provare oltre alla prima, quando la prima non basta.
PAGINE_CONTATTI = ["/contatti", "/contatti.html", "/contattaci", "/contact", "/chi-siamo"]

TIMEOUT = 20
PAUSA = 2.0
MAX_BYTE = 600_000

#: Domini di posta che un'agenzia immobiliare italiana non usa.
#:
#: Non è una lista di provider gratuiti: `gmail.com`, `libero.it` e
#: `virgilio.it` restano, perché una piccola agenzia ci lavora davvero e
#: quell'indirizzo è il suo. Qui ci sono i domini che su un sito italiano
#: segnalano altro — un modulo di contatto abusato, una pagina compromessa, un
#: commento di spam rimasto indicizzato. È così che in questo elenco era
#: finito `butcher56@mail.ru` come recapito di un'agenzia di Piacenza.
DOMINI_IMPLAUSIBILI = re.compile(r"@(mail\.ru|yandex\.|qq\.com|163\.com|126\.com|sina\.com)", re.I)

#: Indirizzi che compaiono nelle pagine ma non sono dell'agenzia.
EMAIL_DA_SCARTARE = re.compile(
    r"(sentry|wixpress|example\.|domain\.|yourmail|email@|tuo@|@2x|\.(png|jpe?g|gif|svg|webp|css|js)$"
    r"|godaddy|wordpress|sitejet|aruba\.it$|register\.it$)",
    re.I,
)

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

#: Un telefono italiano: fisso (0 + prefisso) o mobile (3xx), 9-11 cifre.
TELEFONO = re.compile(r"(?:\+39[\s.-]?)?(?:0\d{1,3}|3\d{2})[\s./-]?\d{5,8}")


def cifre(testo: str) -> str:
    return re.sub(r"\D", "", testo)


def telefono_plausibile(grezzo: str, da_link: bool = False) -> str:
    """
    Il numero normalizzato, o stringa vuota se non è un telefono.

    # Due severità, per due fonti diverse

    Un `href="tel:..."` è una dichiarazione: chi ha scritto quella pagina sta
    dicendo «questo numero si chiama». Il testo no: è pieno di sequenze che
    somigliano a un telefono senza esserlo — una partita IVA, un codice REA,
    un numero di iscrizione al ruolo, una data scritta con i punti.

    La distinzione serve perché le due regole si escludono a vicenda. Un fisso
    italiano può arrivare a undici cifre — `0542 1891731` è un numero vero di
    Imola — e anche una partita IVA ne ha undici. Scartarli tutti butta via
    numeri buoni; tenerli tutti fa chiamare i commercialisti. Con il link si
    tengono, nel testo si scartano: la fonte dice quale delle due ipotesi è
    più probabile.
    """
    n = cifre(grezzo)
    if n.startswith("39") and len(n) > 11:
        n = n[2:]

    # Un fisso italiano sta fra 9 e 11 cifre, un mobile ne ha 10.
    if not 9 <= len(n) <= 11:
        return ""
    if not (n.startswith("0") or n.startswith("3")):
        return ""
    # Undici cifre da 0 trovate nel testo: quasi sempre una partita IVA senza
    # il prefisso IT. Le stesse undici cifre dentro un `tel:` sono un numero.
    if len(n) == 11 and n.startswith("0") and not da_link:
        return ""
    # Tutte le cifre uguali, o due sole cifre diverse: è un segnaposto.
    if len(set(n)) <= 2:
        return ""
    return grezzo.strip()


def puo_leggere(url: str) -> bool:
    """`robots.txt` dice di no? Allora no, anche se il contenuto è pubblico."""
    try:
        pezzi = urllib.parse.urlparse(url)
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{pezzi.scheme}://{pezzi.netloc}/robots.txt")
        rp.read()
        return rp.can_fetch(UA, url)
    except Exception:
        # Un robots.txt irraggiungibile non è un divieto: è un'assenza.
        return True


def scarica(url: str) -> str:
    try:
        richiesta = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(richiesta, timeout=TIMEOUT) as risposta:
            tipo = risposta.headers.get_content_type()
            if tipo not in ("text/html", "application/xhtml+xml"):
                return ""
            grezzo = risposta.read(MAX_BYTE)
        carica = risposta.headers.get_content_charset() or "utf-8"
        return grezzo.decode(carica, errors="replace")
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return ""


def estrai(html: str, dominio: str) -> tuple[list[str], list[str]]:
    """Email e telefoni trovati, i link dichiarati prima del testo."""
    email_link = [
        urllib.parse.unquote(m.group(1)).split("?")[0].strip()
        for m in re.finditer(r'href=["\']mailto:([^"\'>]+)', html, re.I)
    ]
    tel_link = [
        urllib.parse.unquote(m.group(1)).strip()
        for m in re.finditer(r'href=["\']tel:([^"\'>]+)', html, re.I)
    ]

    # Il testo si guarda solo se i link non hanno dato niente: è la fonte
    # rumorosa, e mescolarla a quella pulita peggiora entrambe.
    email = email_link or EMAIL.findall(html)
    telefoni = tel_link or TELEFONO.findall(re.sub(r"<[^>]+>", " ", html))

    email = [
        e.lower()
        for e in dict.fromkeys(email)
        if "@" in e
        and not EMAIL_DA_SCARTARE.search(e)
        and not DOMINI_IMPLAUSIBILI.search(e)
        and len(e) < 64
    ]
    # Prima quelle sul dominio dell'agenzia: un'agenzia che pubblica anche
    # l'indirizzo del proprio commercialista non vuole che scriviamo a lui.
    email.sort(key=lambda e: 0 if dominio and dominio in e.split("@")[-1] else 1)

    telefoni = [
        t
        for t in (telefono_plausibile(x, bool(tel_link)) for x in dict.fromkeys(telefoni))
        if t
    ]
    # I fissi prima dei cellulari: la colonna si chiama «Telefono Sede».
    telefoni.sort(key=lambda t: 0 if cifre(t).lstrip("39").startswith("0") else 1)

    return email, telefoni


def esamina(url: str) -> dict:
    """Recapiti trovati sul sito di un'agenzia."""
    esito = {"email": [], "telefoni": [], "pagine": 0, "nota": ""}

    if not puo_leggere(url):
        esito["nota"] = "robots.txt lo vieta"
        return esito

    dominio = urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")

    html = scarica(url)
    if not html:
        esito["nota"] = "non raggiungibile"
        return esito
    esito["pagine"] = 1

    email, telefoni = estrai(html, dominio)

    # Le pagine dei contatti solo se serve: è dove i recapiti stanno quando
    # non sono in fondo alla prima, e non c'è motivo di chiederle se li
    # abbiamo già trovati.
    if not (email and telefoni):
        for percorso in PAGINE_CONTATTI:
            if email and telefoni:
                break
            time.sleep(PAUSA)
            altra = scarica(urllib.parse.urljoin(url, percorso))
            if not altra:
                continue
            esito["pagine"] += 1
            e2, t2 = estrai(altra, dominio)
            email = email or e2
            telefoni = telefoni or t2

    esito["email"] = email[:3]
    esito["telefoni"] = telefoni[:3]
    if not email and not telefoni:
        esito["nota"] = "nessun recapito pubblicato"
    return esito


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


def main() -> None:
    percorso = Path(sys.argv[1]) if len(sys.argv) > 1 else trova_file()
    cache = percorso.with_suffix(".arricchimento.json")

    wb = load_workbook(percorso)
    da_visitare: list[tuple[str, int, str, str]] = []

    for provincia in PROVINCE:
        foglio = wb[provincia]
        intestazioni = [c.value for c in foglio[1]]
        col = {nome: i + 1 for i, nome in enumerate(intestazioni)}
        for riga in range(2, foglio.max_row + 1):
            sito = foglio.cell(row=riga, column=col["Sito Web"]).value
            nome = foglio.cell(row=riga, column=col["Nome Agenzia / Franchising"]).value
            if sito and nome:
                da_visitare.append((provincia, riga, str(nome), str(sito)))

    print(f"Siti da visitare: {len(da_visitare)}\n")

    raccolto: dict[str, dict] = {}
    if cache.exists():
        raccolto = json.loads(cache.read_text(encoding="utf-8"))
        print(f"  ({len(raccolto)} già in cache, non li riscarico)\n")

    for indice, (provincia, _, nome, sito) in enumerate(da_visitare, start=1):
        if sito in raccolto:
            continue
        esito = esamina(sito)
        raccolto[sito] = esito
        trovato = (
            f"{len(esito['email'])} email, {len(esito['telefoni'])} tel"
            if (esito["email"] or esito["telefoni"])
            else esito["nota"] or "niente"
        )
        print(f"  {indice:>2}/{len(da_visitare)} {nome[:30]:<32} {trovato}")
        cache.write_text(json.dumps(raccolto, indent=1, ensure_ascii=False), encoding="utf-8")
        time.sleep(PAUSA)

    # ── Scrittura nel foglio
    aggiunte_mail = aggiunte_tel = 0
    for provincia in PROVINCE:
        foglio = wb[provincia]
        intestazioni = [c.value for c in foglio[1]]
        col = {nome: i + 1 for i, nome in enumerate(intestazioni)}

        for riga in range(2, foglio.max_row + 1):
            sito = foglio.cell(row=riga, column=col["Sito Web"]).value
            if not sito or sito not in raccolto:
                continue
            esito = raccolto[sito]

            cella_mail = foglio.cell(row=riga, column=col["Email di Contatto"])
            if not cella_mail.value and esito["email"]:
                cella_mail.value = esito["email"][0]
                aggiunte_mail += 1

            cella_tel = foglio.cell(row=riga, column=col["Telefono Sede"])
            if not cella_tel.value and esito["telefoni"]:
                cella_tel.value = esito["telefoni"][0]
                aggiunte_tel += 1

            # La nota dice da dove viene il dato: fra sei mesi nessuno si
            # ricorda quali righe sono state completate a macchina.
            if esito["email"] or esito["telefoni"]:
                nota = foglio.cell(row=riga, column=col["Note / Stato Contatto"])
                testo = str(nota.value or "")
                if "dal sito" not in testo:
                    nota.value = (testo + " · recapiti dal sito dell'agenzia").strip(" ·")

    try:
        wb.save(percorso)
    except PermissionError:
        raise SystemExit(
            f"\nIl file è aperto in Excel e non posso scriverci.\n"
            f"  Chiudilo e rilancia: la scansione è in cache, ci vogliono due secondi.\n"
            f"  ({cache})"
        )

    print(f"\nAggiornato: {percorso}")
    print(f"Email aggiunte: {aggiunte_mail} · Telefoni aggiunti: {aggiunte_tel}")


if __name__ == "__main__":
    main()
