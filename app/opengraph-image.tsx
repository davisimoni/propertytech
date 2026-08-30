import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const runtime = "nodejs";
export const alt = `${BRAND.name}: ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Anteprima social generata a runtime anziché come asset statico: resta
 * allineata a nome e payoff senza dover riesportare un PNG a ogni modifica.
 *
 * Usa solo stili inline supportati da Satori (niente Tailwind, niente CSS
 * esterno) e i font di sistema, così non dipende da download in build.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #031735 0%, #06214F 55%, #0A2E6E 100%)",
        }}
      >
        {/* Marchio: casa stilizzata + tracce da circuito, come il logo. */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
            <path
              d="M41 21 L25 8.5 L7 23 L7 51.5 L28 51.5 L36.5 43"
              stroke="#FFFFFF"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="14" y="29" width="6.5" height="6.5" rx="1.3" fill="#FFFFFF" />
            <rect x="23" y="29" width="6.5" height="6.5" rx="1.3" fill="#FFFFFF" />
            <rect x="14" y="38" width="6.5" height="6.5" rx="1.3" fill="#FFFFFF" />
            <rect x="23" y="38" width="6.5" height="6.5" rx="1.3" fill="#FFFFFF" />
            <path
              d="M36.5 43 L43 36.5 L43 25 L47.5 20.5 M43 31 L51 31 M43 36.5 L47 40.5 L47 44"
              stroke="#00C8FF"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="50.5" cy="17.5" r="3.4" stroke="#00C8FF" strokeWidth="3" fill="none" />
            <circle cx="54.5" cy="31" r="3.4" stroke="#00C8FF" strokeWidth="3" fill="none" />
            <circle cx="47" cy="47.5" r="3.4" stroke="#00C8FF" strokeWidth="3" fill="none" />
          </svg>

          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#FFFFFF" }}>{BRAND.nameParts.primary}</span>
            <span style={{ color: "#3D9BFF" }}>{BRAND.nameParts.accent}</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "48px",
            fontSize: 62,
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            maxWidth: "900px",
          }}
        >
          Il software AI per le agenzie immobiliari italiane
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "28px",
            fontSize: 28,
            color: "#9FC4F0",
            maxWidth: "880px",
            lineHeight: 1.4,
          }}
        >
          Qualifica i lead su WhatsApp 24/7, estrai i dati da visure e atti, genera annunci e report.
        </div>

        <div style={{ display: "flex", marginTop: "44px", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              padding: "12px 26px",
              borderRadius: "999px",
              background: "linear-gradient(90deg, #0066FF 0%, #00C8FF 100%)",
              color: "#FFFFFF",
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            15 crediti gratuiti inclusi
          </div>
          <div style={{ display: "flex", color: "#7FA8DC", fontSize: 22 }}>
            Nessuna carta di credito richiesta
          </div>
        </div>
      </div>
    ),
    size
  );
}
