import { PropertyPortfolio } from "@/components/properties/property-portfolio";

export default function PropertiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Portafoglio Immobili</h1>
        <p className="text-sm text-muted-foreground">
          Gli immobili salvati dal modulo annunci, con i lead qualificati che corrispondono alle
          loro caratteristiche.
        </p>
      </div>

      <PropertyPortfolio />
    </div>
  );
}
