"use client";

import { useEffect, useState } from "react";
import type { ContractType, EnergyClass, PropertyType } from "@prisma/client";
import { CheckCircle2, FileCode2, Loader2, Save, Users } from "lucide-react";
import {
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  ENERGY_CLASSES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  isContractType,
  isPropertyType,
  parseNumericHint,
} from "@/lib/listings/property-fields";
import type { ImportedListingView } from "./listing-import";
import { cn } from "@/lib/utils";

interface PropertyExportPanelProps {
  /** Titolo dell'immobile dal form principale, riusato come titolo annuncio. */
  propertyTitle: string;
  /** Testo dell'annuncio generato dall'AI, finisce nella descrizione del feed. */
  description: string | null;
  /** Dati grezzi dell'annuncio importato, per precompilare i campi. */
  imported: ImportedListingView | null;
}

interface SaveOutcome {
  propertyId: string;
  reference: string;
  matched: number;
  evaluated: number;
}

/**
 * "Dati per i portali": i campi strutturati che il testo pubblicitario non
 * contiene e senza i quali nessun feed XML viene accettato.
 *
 * L'immobile va prima salvato in archivio e solo dopo esportato: il feed si
 * genera leggendo dal database, così il file scaricato e ciò che l'agenzia ha
 * effettivamente in portafoglio non possono divergere. È lo stesso salvataggio
 * che fa scattare lo Smart Matching con i lead qualificati.
 */
export function PropertyExportPanel({
  propertyTitle,
  description,
  imported,
}: PropertyExportPanelProps) {
  const [reference, setReference] = useState("");
  const [contract, setContract] = useState<ContractType>("VENDITA");
  const [type, setType] = useState<PropertyType>("APPARTAMENTO");
  const [comune, setComune] = useState("");
  const [provincia, setProvincia] = useState("");
  const [zona, setZona] = useState("");
  const [priceEur, setPriceEur] = useState("");
  const [squareMeters, setSquareMeters] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [floor, setFloor] = useState("");
  const [energyClass, setEnergyClass] = useState<EnergyClass | "">("");

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Precompilazione da un annuncio importato.
   *
   * Si riempiono solo i campi ancora vuoti: quello che l'agente ha gia'
   * corretto a mano vince sempre sul dato estratto, anche se il dato estratto
   * arriva dopo. E' la ragione per cui ogni set passa dalla forma
   * `(current) => current || ...` invece di assegnare il valore secco.
   *
   * Tipologia e contratto sono l'eccezione, e vale la pena dire perche': non
   * partono vuoti ma dal valore piu' comune (APPARTAMENTO / VENDITA), quindi
   * "ancora vuoto" non si puo' verificare. Si sovrascrive il valore
   * predefinito solo quando l'AI ha trovato qualcosa nella fonte, e solo
   * finche' l'agente non ha aperto il menu: da quel momento comanda lui.
   */
  const [tipoTocco, setTipoTocco] = useState(false);
  const [contrattoTocco, setContrattoTocco] = useState(false);

  useEffect(() => {
    if (!imported) return;

    setZona((current) => current || imported.zone || "");
    setPriceEur((current) => current || String(parseNumericHint(imported.price) ?? ""));
    setSquareMeters((current) => current || String(parseNumericHint(imported.squareMeters) ?? ""));
    setRooms((current) => current || String(parseNumericHint(imported.rooms) ?? ""));

    setComune((current) => current || imported.comune || "");
    // Sigla in maiuscolo: il campo ne accetta due, e "mo" non sarebbe valido.
    setProvincia((current) => current || (imported.provincia ?? "").toUpperCase().slice(0, 2));
    setBathrooms((current) => current || String(parseNumericHint(imported.bathrooms) ?? ""));
    setFloor((current) => current || imported.floor || "");
    setEnergyClass((current) => current || ((imported.energyClass ?? "") as EnergyClass | ""));

    if (!tipoTocco && imported.propertyType && isPropertyType(imported.propertyType)) {
      setType(imported.propertyType);
    }
    if (!contrattoTocco && imported.contract && isContractType(imported.contract)) {
      setContract(imported.contract);
    }
  }, [imported, tipoTocco, contrattoTocco]);

  function numberOrUndefined(value: string): number | undefined {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  async function save() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: reference.trim(),
          title: propertyTitle.trim(),
          description: description ?? undefined,
          contract,
          type,
          comune: comune.trim(),
          provincia: provincia.trim() || undefined,
          zona: zona.trim() || undefined,
          priceEur: numberOrUndefined(priceEur),
          squareMeters: numberOrUndefined(squareMeters),
          rooms: numberOrUndefined(rooms),
          bathrooms: numberOrUndefined(bathrooms),
          floor: floor.trim() || undefined,
          energyClass: energyClass || undefined,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Salvataggio non riuscito. Controlla i campi obbligatori.");
        return;
      }

      setSaved({
        propertyId: body.propertyId as string,
        reference: reference.trim(),
        matched: body.matching?.matched ?? 0,
        evaluated: body.matching?.evaluated ?? 0,
      });
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  const canSave =
    reference.trim().length > 0 &&
    comune.trim().length > 0 &&
    numberOrUndefined(priceEur) !== undefined &&
    numberOrUndefined(squareMeters) !== undefined &&
    propertyTitle.trim().length > 2;

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileCode2 className="h-4 w-4 text-primary" />
        Dati per i portali
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        I portali richiedono questi campi per accettare un annuncio: il testo pubblicitario da solo
        non basta. Salvando, l&apos;immobile entra in portafoglio e viene confrontato con i lead
        qualificati.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="prop-ref" className="text-xs font-medium text-muted-foreground">
            Riferimento *
          </label>
          <input
            id="prop-ref"
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="A102"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-contract" className="text-xs font-medium text-muted-foreground">
            Contratto *
          </label>
          <select
            id="prop-contract"
            value={contract}
            onChange={(event) => {
              setContrattoTocco(true);
              setContract(event.target.value as ContractType);
            }}
            className="input-field mt-1"
          >
            {CONTRACT_TYPES.map((option) => (
              <option key={option} value={option}>
                {CONTRACT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="prop-type" className="text-xs font-medium text-muted-foreground">
            Tipologia *
          </label>
          <select
            id="prop-type"
            value={type}
            onChange={(event) => {
              setTipoTocco(true);
              setType(event.target.value as PropertyType);
            }}
            className="input-field mt-1"
          >
            {PROPERTY_TYPES.map((option) => (
              <option key={option} value={option}>
                {PROPERTY_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="prop-comune" className="text-xs font-medium text-muted-foreground">
            Comune *
          </label>
          <input
            id="prop-comune"
            type="text"
            value={comune}
            onChange={(event) => setComune(event.target.value)}
            placeholder="Milano"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-provincia" className="text-xs font-medium text-muted-foreground">
            Provincia
          </label>
          <input
            id="prop-provincia"
            type="text"
            value={provincia}
            onChange={(event) => setProvincia(event.target.value)}
            placeholder="MI"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-zona" className="text-xs font-medium text-muted-foreground">
            Zona / Quartiere
          </label>
          <input
            id="prop-zona"
            type="text"
            value={zona}
            onChange={(event) => setZona(event.target.value)}
            placeholder="Navigli"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-price" className="text-xs font-medium text-muted-foreground">
            Prezzo in € *
          </label>
          <input
            id="prop-price"
            type="number"
            inputMode="numeric"
            min={1}
            value={priceEur}
            onChange={(event) => setPriceEur(event.target.value)}
            placeholder="250000"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-mq" className="text-xs font-medium text-muted-foreground">
            Superficie in mq *
          </label>
          <input
            id="prop-mq"
            type="number"
            inputMode="numeric"
            min={1}
            value={squareMeters}
            onChange={(event) => setSquareMeters(event.target.value)}
            placeholder="95"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-rooms" className="text-xs font-medium text-muted-foreground">
            Locali
          </label>
          <input
            id="prop-rooms"
            type="number"
            inputMode="numeric"
            min={0}
            value={rooms}
            onChange={(event) => setRooms(event.target.value)}
            placeholder="3"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-baths" className="text-xs font-medium text-muted-foreground">
            Bagni
          </label>
          <input
            id="prop-baths"
            type="number"
            inputMode="numeric"
            min={0}
            value={bathrooms}
            onChange={(event) => setBathrooms(event.target.value)}
            placeholder="2"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-floor" className="text-xs font-medium text-muted-foreground">
            Piano
          </label>
          <input
            id="prop-floor"
            type="text"
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
            placeholder="2"
            className="input-field mt-1"
          />
        </div>

        <div>
          <label htmlFor="prop-energy" className="text-xs font-medium text-muted-foreground">
            Classe energetica
          </label>
          <select
            id="prop-energy"
            value={energyClass}
            onChange={(event) => setEnergyClass(event.target.value as EnergyClass | "")}
            className="input-field mt-1"
          >
            <option value="">Non indicata</option>
            {ENERGY_CLASSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">* Campi obbligatori per i portali.</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={save} disabled={!canSave || isSaving} className="btn-brand">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva in portafoglio
        </button>

        <a
          href={saved ? `/api/properties/xml?reference=${encodeURIComponent(saved.reference)}` : "#"}
          download
          aria-disabled={!saved}
          onClick={(event) => {
            if (!saved) event.preventDefault();
          }}
          className={cn("btn-outline", !saved && "pointer-events-none opacity-50")}
        >
          <FileCode2 className="h-4 w-4" />
          Scarica XML Portali
        </a>
      </div>

      {!saved && (
        <p className="mt-2 text-xs text-muted-foreground">
          Salva prima l&apos;immobile: il feed viene generato dal portafoglio, così il file
          scaricato e ciò che hai in archivio non possono divergere.
        </p>
      )}

      {saved && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg border border-status-qualified/30 bg-status-qualified/10 p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified" />
          <div className="text-sm text-foreground">
            <p>
              Immobile <span className="font-medium">{saved.reference}</span> salvato in
              portafoglio.
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {saved.matched === 0
                ? `Nessun lead compatibile fra i ${saved.evaluated} qualificati in archivio.`
                : `${saved.matched} lead compatibil${saved.matched === 1 ? "e" : "i"} su ${saved.evaluated} qualificati.`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
