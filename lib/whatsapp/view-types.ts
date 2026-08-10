import type {
  DealStage,
  PortalSource,
  PropertyType,
  QualificationStatus,
  SellerCategory,
} from "@prisma/client";
import type { ChatMessage } from "./types";

/** Forma del lead restituita da /api/whatsapp/leads e consumata dalla GUI. */
export interface LeadView {
  id: string;
  clientName: string;
  clientPhone: string;
  portalSource: PortalSource;
  propertyRef: string;
  qualificationStatus: QualificationStatus;
  budget: string | null;
  mortgageApproved: boolean | null;
  mustSellFirst: boolean | null;
  timeframe: string | null;
  appointmentSlot: string | null;
  /** Portafoglio immobili rilevato: `null` = mai rilevato, `0` = acquirente puro. */
  ownedPropertiesCount: number | null;
  sellerCategory: SellerCategory | null;
  /** Collaboratore che segue il contatto; `null` = non ancora assegnato. */
  assignedToId: string | null;
  assignedToName: string | null;
  /** Fase della trattativa sulla board Kanban, mossa a mano dall'agente. */
  dealStage: DealStage;
  /** Preferenze di ricerca: `null` = criterio non dichiarato, non "zero". */
  preferredZone: string | null;
  preferredType: PropertyType | null;
  budgetMin: number | null;
  budgetMax: number | null;
  minSquareMeters: number | null;
  /** Corrispondenze visura ↔ lead ancora da validare dall'agente. */
  pendingMatches: PortfolioMatchView[];
  /** `true` = ha confermato, `false` = ha disdetto, `null` = non ha risposto. */
  appointmentConfirmed: boolean | null;
  reminderSentAt: string | null;
  crmDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** Una corrispondenza proposta fra un intestatario di visura e questo lead. */
export interface PortfolioMatchView {
  id: string;
  ownerName: string;
  comune: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  categoriaCatastale: string | null;
  quotaProprieta: string | null;
  createdAt: string;
}

/** Forma della configurazione restituita da /api/whatsapp/config. */
export interface WhatsAppConfigView {
  isConnected: boolean;
  phoneNumber: string | null;
  metaPhoneAccountId: string | null;
  hasAccessToken: boolean;
  inboundToken: string;
  webhookVerifyToken: string | null;
}

/** Classi Tailwind del badge di stato, allineate al codice colore del Modulo 1. */
export const STATUS_BADGE_CLASSES: Record<QualificationStatus, string> = {
  QUALIFIED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  UNQUALIFIED: "bg-red-500/10 text-red-600 dark:text-red-400",
  OPT_OUT: "bg-red-500/10 text-red-600 dark:text-red-400",
  PENDING: "bg-muted text-muted-foreground",
};
