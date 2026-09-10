import { WhatsAppModule } from "@/components/whatsapp/whatsapp-module";
import { InfoTip } from "@/components/shared/info-tip";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
          Qualifica Lead
          <InfoTip label="Una richiesta da un portale che resta senza risposta per un'ora è quasi sempre persa. Qui l'assistente risponde su WhatsApp in pochi secondi, chiede mutuo, tempistiche e se c'è un immobile da vendere, e ti consegna il contatto già qualificato con l'appuntamento fissato in agenda." />
        </h1>
        <p className="text-sm text-muted-foreground">
          Intercetta i lead dai portali immobiliari e qualificali automaticamente via WhatsApp.
        </p>
      </div>

      <WhatsAppModule />
    </div>
  );
}
