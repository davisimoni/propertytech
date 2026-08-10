import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "@/components/providers/session-provider";
import { BRAND } from "@/lib/brand";
import { SEO, SITE_URL } from "@/lib/seo";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  // Risolve gli URL relativi di OpenGraph in assoluti: senza, le anteprime
  // condivise su WhatsApp o LinkedIn restano senza immagine.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SEO.title,
    template: `%s | ${BRAND.name}`,
  },
  description: SEO.description,
  keywords: [...SEO.keywords],
  applicationName: BRAND.name,
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  publisher: BRAND.name,
  category: "business",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: BRAND.name,
    title: SEO.title,
    description: SEO.description,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SEO.title,
    description: SEO.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    // `default`: la barra di stato di iOS resta leggibile su sfondo chiaro e
    // scuro. `black-translucent` farebbe finire il contenuto sotto l'orologio.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * `viewport` separato da `metadata`: è ciò che Next richiede dalla 14 in poi.
 *
 * `viewportFit: cover` fa arrivare lo sfondo sotto la tacca degli iPhone,
 * necessario perché installata a schermo intero non sembri una pagina web con
 * una fascia bianca in cima.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0066FF" },
    { media: "(prefers-color-scheme: dark)", color: "#070F1E" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
