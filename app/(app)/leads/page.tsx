import { WhatsAppModule } from "@/components/whatsapp/whatsapp-module";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Qualifica Lead</h1>
        <p className="text-sm text-muted-foreground">
          Intercetta i lead dai portali immobiliari e qualificali automaticamente via WhatsApp.
        </p>
      </div>

      <WhatsAppModule />
    </div>
  );
}
