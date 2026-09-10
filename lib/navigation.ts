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
 * Ordine deliberato, non alfabetico né cronologico.
 *
 * I quattro moduli che fanno risparmiare più tempo a un'agenzia — leggere una
 * perizia, qualificare un lead, estrarre una visura, scrivere un report post
 * visita — stanno in testa, nell'ordine in cui pesano di più sul lavoro di
 * chi è sul campo. Social & Annunci scende sotto Portafoglio Immobili: resta
 * raggiungibile, ma un generatore di contenuti non deve essere la prima cosa
 * che si vede aprendo il software, o il prodotto sembra un wrapper attorno a
 * un generatore di testi invece che uno strumento operativo per il resto.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/radar", label: "Analisi & Due Diligence Aste", icon: Radar },
  { href: "/leads", label: "Qualifica Lead", icon: MessagesSquare },
  { href: "/documents", label: "Analisi Documenti", icon: FileSearch2 },
  { href: "/voice-reports", label: "Report Venditori (Note Vocali)", icon: Mic },
  { href: "/properties", label: "Portafoglio Immobili", icon: Building2 },
  { href: "/social", label: "Social & Annunci", icon: Share2 },
  { href: "/settings", label: "Impostazioni & Piano", icon: Settings },
];
