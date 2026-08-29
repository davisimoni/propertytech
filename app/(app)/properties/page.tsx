import { auth } from "@/auth";
import { PropertyPortfolio } from "@/components/properties/property-portfolio";

/**
 * Il ruolo si legge qui e scende come proprieta': i componenti client non
 * hanno accesso alla sessione, e senza il ruolo mostrerebbero all'agente
 * comandi che il server rifiuta con un 403.
 */
export default async function PropertiesPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Portafoglio Immobili</h1>
        <p className="text-sm text-muted-foreground">
          Gli immobili salvati dal modulo annunci, con i lead qualificati che corrispondono alle
          loro caratteristiche.
        </p>
      </div>

      <PropertyPortfolio currentRole={session?.user?.role ?? "AGENT"} />
    </div>
  );
}
