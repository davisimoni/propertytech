import {
  LayoutDashboard,
  MessagesSquare,
  FileSearch2,
  Share2,
  Building2,
  Mic,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Qualifica Lead", icon: MessagesSquare },
  { href: "/documents", label: "Analisi Documenti", icon: FileSearch2 },
  { href: "/social", label: "Social & Annunci", icon: Share2 },
  { href: "/properties", label: "Portafoglio Immobili", icon: Building2 },
  { href: "/voice-reports", label: "Report Venditori (Note Vocali)", icon: Mic },
  { href: "/settings", label: "Impostazioni & Piano", icon: Settings },
];
