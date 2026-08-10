import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // La variabile è iniettata da next/font in app/layout.tsx. Il fallback
        // dentro var() è necessario: se la variabile non è definita — font non
        // scaricabile in build, o CSS disallineato — l'intera dichiarazione
        // font-family diventa invalida e il browser ripiega sul serif di
        // sistema. Con il fallback degrada su un sans-serif corretto.
        sans: ["var(--font-sans, ui-sans-serif)", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        // Colori semantici: risolti dalle variabili CSS, così i componenti
        // seguono automaticamente tema chiaro/scuro.
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },

        // Palette brand PropertyTech: valori fissi, indipendenti dal tema.
        brand: {
          navy: "#031735",
          blue: "#0066FF",
          cyan: "#00C8FF",
          "surface-light": "#F8FAFC",
          "surface-dark": "#070F1E",
          "surface-dark-elevated": "#0D1B2A",
        },

        // Colori di stato del dominio (badge lead, crediti, opt-out).
        status: {
          qualified: "#10B981",
          pending: "#F59E0B",
          blocked: "#EF4444",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(90deg, #0066FF 0%, #00C8FF 100%)",
      },
      borderRadius: {
        xl: "0.875rem",
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
    },
  },
  plugins: [],
};

export default config;
