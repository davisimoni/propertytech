import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Marchio PropertyTech: sagoma di casa il cui lato destro si apre in tracce da
 * circuito stampato. Reso in SVG anziché come bitmap per restare nitido a ogni
 * dimensione e adattarsi al tema.
 *
 * `gradientId` va reso univoco quando più marchi coesistono nella stessa
 * pagina: id duplicati fanno collassare i gradienti su una sola definizione.
 */
export function LogoMark({
  className,
  gradientId = "pt-logo",
}: {
  className?: string;
  gradientId?: string;
}) {
  const houseGradient = `${gradientId}-house`;
  const circuitGradient = `${gradientId}-circuit`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={houseGradient} x1="10" y1="10" x2="40" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#031735" />
          <stop offset="0.6" stopColor="#0A2A5C" />
          <stop offset="1" stopColor="#0066FF" />
        </linearGradient>
        <linearGradient id={circuitGradient} x1="38" y1="48" x2="60" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0066FF" />
          <stop offset="1" stopColor="#00C8FF" />
        </linearGradient>
      </defs>

      {/* Sagoma della casa: spiovente destro, apice, parete sinistra, base e
          smusso in basso a destra. Il tracciato resta aperto sul lato destro,
          dove il circuito prende il posto della parete. */}
      <path
        d="M41 21 L25 8.5 L7 23 L7 51.5 L28 51.5 L36.5 43"
        stroke={`url(#${houseGradient})`}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Finestra a quattro riquadri */}
      <g fill="#031735" className="dark:fill-[#1B4586]">
        <rect x="14" y="29" width="6.5" height="6.5" rx="1.3" />
        <rect x="23" y="29" width="6.5" height="6.5" rx="1.3" />
        <rect x="14" y="38" width="6.5" height="6.5" rx="1.3" />
        <rect x="23" y="38" width="6.5" height="6.5" rx="1.3" />
      </g>

      {/* Tracce da circuito: un tronco sale dallo smusso e si dirama verso tre
          nodi, con angoli retti come su un circuito stampato. */}
      <g
        stroke={`url(#${circuitGradient})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M36.5 43 L43 36.5 L43 25 L47.5 20.5" />
        <path d="M43 31 L51 31" />
        <path d="M43 36.5 L47 40.5 L47 44" />
      </g>

      {/* Nodi terminali: anelli cavi, come nel marchio. */}
      <g fill="none" stroke={`url(#${circuitGradient})`} strokeWidth="3">
        <circle cx="50.5" cy="17.5" r="3.4" />
        <circle cx="54.5" cy="31" r="3.4" />
        <circle cx="47" cy="47.5" r="3.4" />
      </g>
    </svg>
  );
}

/** Wordmark: "Property" nel colore di testo, "Tech" in electric blue. */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight text-foreground", className)}>
      {BRAND.nameParts.primary}
      <span className="text-primary">{BRAND.nameParts.accent}</span>
    </span>
  );
}

const SIZES = {
  sm: { mark: "h-7 w-7", text: "text-sm" },
  md: { mark: "h-9 w-9", text: "text-lg" },
  lg: { mark: "h-14 w-14", text: "text-2xl" },
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** Mostra il payoff sotto al wordmark (login, register). */
  withTagline?: boolean;
  /** Dispone marchio e testo in colonna anziché in riga. */
  stacked?: boolean;
  gradientId?: string;
  className?: string;
}

export function Logo({
  size = "md",
  withTagline = false,
  stacked = false,
  gradientId,
  className,
}: LogoProps) {
  const dimensions = SIZES[size];

  return (
    <div
      className={cn(
        "flex",
        stacked ? "flex-col items-center gap-2 text-center" : "flex-row items-center gap-2.5",
        className
      )}
    >
      <LogoMark className={dimensions.mark} gradientId={gradientId} />
      <div className={stacked ? "" : "min-w-0"}>
        <LogoWordmark className={cn("block leading-tight", dimensions.text)} />
        {withTagline && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{BRAND.tagline}</span>
        )}
      </div>
    </div>
  );
}
