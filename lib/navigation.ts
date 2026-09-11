import {
  LayoutDashboard,
  MessagesSquare,
  FileSearch2,
  Share2,
  Building2,
  Radar,
  Mic,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/*
 * Ordine che segue il flusso di lavoro, non il peso commerciale dei moduli.
 *
 * Si parte da dove arriva il cliente (il lead), si passa per i documenti che
 * porta con sé, poi per come l'immobile viene raccontato e archiviato, e si
 * finisce con gli strumenti di analisi e il dopo-visita. È l'ordine con cui
 * le cose accadono davvero in agenzia, ed è quello che gli utenti hanno in
 * mano da quando usano il prodotto: cambiarlo per dare risalto a un modulo
 * costa più di quanto renda, perché la posizione di una voce di menu diventa
 * memoria muscolare nel giro di pochi giorni.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Qualifica Lead", icon: MessagesSquare },
  { href: "/documents", label: "Analisi Documenti", icon: FileSearch2 },
  { href: "/social", label: "Social & Annunci", icon: Share2 },
  { href: "/properties", label: "Portafoglio Immobili", icon: Building2 },
  { href: "/radar", label: "Analisi & Due Diligence Aste", icon: Radar },
  { href: "/voice-reports", label: "Report Venditori (Note Vocali)", icon: Mic },
  { href: "/settings", label: "Impostazioni & Piano", icon: Settings },
];
