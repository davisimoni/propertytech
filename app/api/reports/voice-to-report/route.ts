import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import { incrementUsage } from "@/lib/usage";
import { reportRequestSchema } from "@/lib/ai/report-schema";
import { generateSellerReport, ReportGenerationError } from "@/lib/ai/report-generator";
import {
  MAX_AUDIO_BYTES,
  SUPPORTED_AUDIO_TYPES,
  transcribeAudio,
  TranscriptionError,
} from "@/lib/ai/transcription";

/**
 * Genera il report post-visita per il proprietario a partire da una nota
 * vocale (audio) o testuale dell'agente.
 *
 * GDPR: l'audio non viene mai scritto su disco né persistito. Resta in memoria
 * il tempo della trascrizione e viene poi scartato; nel database finisce solo
 * il testo trascritto (CLAUDE.md §5).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const accessResponse = await checkFeatureAccess(organizationId, "voiceSellerReporting");
  if (accessResponse) {
    return accessResponse;
  }

  const contentType = request.headers.get("content-type") ?? "";
  let propertyRef: string;
  let sellerName: string | undefined;
  let sellerPhone: string | undefined;
  let transcript: string;
  let sourceType: "audio" | "text";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    const audio = formData?.get("audio");

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: "missing_audio" }, { status: 400 });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "audio_too_large" }, { status: 400 });
    }

    // Alcuni browser inviano il MIME con codec (es. "audio/webm;codecs=opus").
    const baseType = audio.type.split(";")[0]?.trim() ?? "";
    if (!SUPPORTED_AUDIO_TYPES.includes(baseType)) {
      return NextResponse.json({ error: "unsupported_audio_type" }, { status: 400 });
    }

    propertyRef = String(formData?.get("propertyRef") ?? "").trim();
    sellerName = String(formData?.get("sellerName") ?? "").trim() || undefined;
    sellerPhone = String(formData?.get("sellerPhone") ?? "").trim() || undefined;

    if (propertyRef.length < 3) {
      return NextResponse.json({ error: "missing_property_ref" }, { status: 400 });
    }

    try {
      const buffer = Buffer.from(await audio.arrayBuffer());
      transcript = await transcribeAudio(buffer, audio.name || "nota-vocale.webm", baseType);
    } catch (error) {
      if (error instanceof TranscriptionError) {
        // 422 e non 502 per l'audio muto o illeggibile: non è un guasto del
        // server ma un file che l'agente può rifare, e distinguerli evita che
        // i registri si riempiano di finti errori di piattaforma.
        const status =
          error.code === "not_configured" ? 503 : error.code === "empty_result" ? 422 : 502;

        return NextResponse.json({ error: error.code, message: error.message }, { status });
      }
      console.error("[api/reports/voice-to-report] Transcription failed", error);
      return NextResponse.json({ error: "transcription_failed" }, { status: 502 });
    }

    sourceType = "audio";
  } else {
    const body = await request.json().catch(() => null);
    const parsed = reportRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    propertyRef = parsed.data.propertyRef;
    sellerName = parsed.data.sellerName;
    sellerPhone = parsed.data.sellerPhone;
    transcript = parsed.data.notes;
    sourceType = "text";
  }

  try {
    const report = await generateSellerReport({ propertyRef, sellerName, transcript });

    const saved = await prisma.voiceReport.create({
      data: {
        organizationId,
        propertyRef,
        sellerName: sellerName ?? null,
        sellerPhone: sellerPhone ?? null,
        transcript,
        report,
        sourceType,
      },
    });

    await incrementUsage(organizationId, "voice");

    return NextResponse.json({ reportId: saved.id, transcript, report });
  } catch (error) {
    if (error instanceof ReportGenerationError) {
      const status = error.code === "upstream_error" ? 502 : 422;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }

    console.error("[api/reports/voice-to-report] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
