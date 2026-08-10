/**
 * Genera le icone PWA a partire dal marchio PropertyTech.
 *
 * Il tracciato è lo stesso di `components/brand/logo.tsx` — casa navy aperta
 * sul lato destro, finestra a quattro riquadri, tracce da circuito con tre nodi
 * ad anello — così l'icona sul telefono e il logo nell'app sono lo stesso segno
 * e non due disegni che si somigliano.
 *
 * Si usa il **solo marchio, senza la scritta**: a 192 pixel "PropertyTech"
 * sarebbe una macchia illeggibile, ed è il motivo per cui le icone applicative
 * portano quasi sempre il simbolo e non il logo completo.
 *
 * Uso: node scripts/generate-icons.mjs
 *
 * `sharp` non è dichiarato fra le dipendenze: arriva con Next, che lo usa per
 * l'ottimizzazione delle immagini. Va bene perché questo script si lancia a
 * mano e i PNG che produce sono versionati — la build non ne ha bisogno. Se un
 * domani Next smettesse di portarselo dietro, basta un `npm i -D sharp` prima
 * di rigenerare le icone.
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const NAVY = "#031735";
const SURFACE_LIGHT = "#F8FAFC";

/**
 * Marchio in SVG.
 *
 * `padding` è lo spazio attorno al segno in unità di viewBox: le icone
 * maskable ne vogliono di più perché Android le ritaglia in un cerchio e
 * mangia circa un decimo per lato.
 *
 * `radius` a 0 per iOS, che applica già la propria maschera e su un PNG con
 * angoli arrotondati mostrerebbe un doppio bordo.
 */
function markSvg({ size, padding = 9, radius = 0.22, background = SURFACE_LIGHT }) {
  // Il marchio vive fra 6 e 58 nel viewBox originale: lo si riporta a 0 e lo si
  // riscala nell'area utile, altrimenti resterebbe decentrato in basso a
  // sinistra come nel logo completo, dove è affiancato dalla scritta.
  const box = 64;
  const inner = box - padding * 2;
  const scale = inner / 54;
  const offsetX = padding - 5 * scale;
  const offsetY = padding - 6 * scale;
  const r = radius * box;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}">
  <defs>
    <linearGradient id="house" x1="10" y1="10" x2="40" y2="54" gradientUnits="userSpaceOnUse">
      <stop stop-color="#031735"/>
      <stop offset="0.6" stop-color="#0A2A5C"/>
      <stop offset="1" stop-color="#0066FF"/>
    </linearGradient>
    <linearGradient id="circuit" x1="38" y1="48" x2="60" y2="14" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0066FF"/>
      <stop offset="1" stop-color="#00C8FF"/>
    </linearGradient>
  </defs>

  <rect width="${box}" height="${box}" rx="${r}" ry="${r}" fill="${background}"/>

  <g transform="translate(${offsetX} ${offsetY}) scale(${scale})">
    <path d="M41 21 L25 8.5 L7 23 L7 51.5 L28 51.5 L36.5 43"
          stroke="url(#house)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>

    <g fill="${NAVY}">
      <rect x="14" y="29" width="6.5" height="6.5" rx="1.3"/>
      <rect x="23" y="29" width="6.5" height="6.5" rx="1.3"/>
      <rect x="14" y="38" width="6.5" height="6.5" rx="1.3"/>
      <rect x="23" y="38" width="6.5" height="6.5" rx="1.3"/>
    </g>

    <g stroke="url(#circuit)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M36.5 43 L43 36.5 L43 25 L47.5 20.5"/>
      <path d="M43 31 L51 31"/>
      <path d="M43 36.5 L47 40.5 L47 44"/>
    </g>

    <g fill="none" stroke="url(#circuit)" stroke-width="3">
      <circle cx="50.5" cy="17.5" r="3.4"/>
      <circle cx="54.5" cy="31" r="3.4"/>
      <circle cx="47" cy="47.5" r="3.4"/>
    </g>
  </g>
</svg>`);
}

const outDir = join(process.cwd(), "public");
mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, options: {} },
  { file: "icon-512.png", size: 512, options: {} },
  // Maskable: più margine e nessun angolo arrotondato — la maschera la mette
  // il sistema, e un raggio nostro produrrebbe un doppio bordo.
  { file: "icon-maskable-512.png", size: 512, options: { padding: 11, radius: 0 } },
  // iOS: sfondo pieno e spigoli vivi, il ritaglio lo applica il sistema.
  { file: "apple-icon.png", size: 180, options: { radius: 0 } },
];

for (const { file, size, options } of targets) {
  const buffer = await sharp(markSvg({ size, ...options }))
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(join(outDir, file), buffer);
  console.log(`  ${file.padEnd(24)} ${size}×${size}  ${(buffer.length / 1024).toFixed(1)} KB`);
}
