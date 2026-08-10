import { z } from "zod";
import type { PortalSource, QualificationStatus } from "@prisma/client";

/** Un messaggio della cronologia chat, così come persistito in WhatsAppChat.messages. */
export const chatMessageSchema = z.object({
  sender: z.enum(["user", "bot"]),
  text: z.string(),
  timestamp: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessagesSchema = z.array(chatMessageSchema);

/**
 * WhatsAppChat.messages è una colonna Json non tipizzata: questo parse è
 * l'unico punto in cui il valore grezzo entra nel dominio tipizzato.
 * Su dati corrotti degrada a lista vuota anziché far fallire la request.
 */
export function parseChatMessages(raw: unknown): ChatMessage[] {
  const parsed = chatMessagesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export const PORTAL_SOURCE_LABELS: Record<PortalSource, string> = {
  IMMOBILIARE_IT: "Immobiliare.it",
  IDEALISTA: "Idealista",
  CASA_IT: "Casa.it",
  SITO_WEB: "Sito Web",
  QR_CODE: "QR in vetrina",
  IMPORT: "Rubrica importata",
};

export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  PENDING: "In attesa",
  IN_PROGRESS: "In corso",
  QUALIFIED: "Qualificato",
  UNQUALIFIED: "Non qualificato",
  OPT_OUT: "Opt-out",
};

/** Payload accettato da /api/whatsapp/inbound-lead. */
export const inboundLeadSchema = z.object({
  clientName: z.string().min(1, "Nome cliente obbligatorio").max(120),
  clientPhone: z
    .string()
    .min(6, "Numero di telefono non valido")
    .max(20)
    .regex(/^\+?[0-9\s.-]+$/, "Numero di telefono non valido"),
  portalSource: z.enum(["IMMOBILIARE_IT", "IDEALISTA", "CASA_IT", "SITO_WEB"]),
  propertyRef: z.string().min(1, "Riferimento immobile obbligatorio").max(200),
  budget: z.string().max(80).optional(),
});

export type InboundLeadPayload = z.infer<typeof inboundLeadSchema>;

/** Normalizza in E.164 senza "+": il formato richiesto da Meta Cloud API. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}
