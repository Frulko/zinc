// Sample SVG documents for the gallery, each exercising a part of the supported subset.

/** Stroked icons: arcs, relative commands, lines, polylines, round caps, currentColor. */
export const ICONS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 24" fill="none" stroke="currentColor" stroke-width="2" color="#1f2937">
  <g><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></g>
  <g transform="translate(24 0)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></g>
  <g transform="translate(48 0)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#ef4444" stroke="#b91c1c"/></g>
  <g transform="translate(72 0)"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9" stroke-dasharray="2 2"/></g>
</svg>`;

/** Gradients (linear, radial, userSpaceOnUse), rounded rects, opacity, <style> classes. */
export const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" style="stop-color:#fde68a"/><stop offset="1" style="stop-color:#f59e0b"/></radialGradient>
    <linearGradient id="bar" x1="20" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#ef4444"/></linearGradient>
  </defs>
  <style>.card { fill: url(#bg); } .dim { opacity: 0.35 } #sun { stroke: white; stroke-width: 3 }</style>
  <rect class="card" x="4" y="4" width="192" height="112" rx="18"/>
  <circle id="sun" cx="150" cy="44" r="24" fill="url(#glow)"/>
  <rect class="dim" x="20" y="24" width="90" height="12" rx="6" fill="white"/>
  <rect class="dim" x="20" y="44" width="60" height="12" rx="6" fill="white"/>
  <rect x="20" y="86" width="160" height="14" rx="7" fill="url(#bar)"/>
</svg>`;

/** Curves: cubic/quadratic with S and T shorthands, even-odd star, transforms (rotate, skew, scale, matrix). */
export const SHAPES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
  <path d="M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80" stroke="#0f766e" stroke-width="4" fill="none"/>
  <path d="M10 130 Q 52.5 80, 95 130 T 180 130" stroke="#7c3aed" stroke-width="3" fill="none"/>
  <polygon points="210,10 222,46 190,24 230,24 198,46" fill="#f59e0b" fill-rule="evenodd"/>
  <g transform="translate(200 100) rotate(30)"><rect x="-15" y="-15" width="30" height="30" fill="#ec4899" opacity="0.8"/></g>
  <g transform="translate(120 30) skewX(-20) scale(1.2)"><ellipse cx="0" cy="0" rx="18" ry="10" fill="#38bdf8" stroke="#0369a1"/></g>
  <g transform="matrix(0.8 0 0 0.8 150 120)"><circle r="12" fill="#84cc16"/></g>
</svg>`;

/** A landscape: gradient sky, ellipses, polygons, defs + use (repeated trees), preserveAspectRatio slice. */
export const LANDSCAPE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x2="0" y2="1"><stop offset="0" stop-color="#0c4a6e"/><stop offset="1" stop-color="#f9a8d4"/></linearGradient>
    <g id="tree"><rect x="-2" y="0" width="4" height="12" fill="#78350f"/><polygon points="0,-22 11,4 -11,4" fill="#166534"/></g>
  </defs>
  <rect width="320" height="180" fill="url(#sky)"/>
  <circle cx="250" cy="60" r="18" fill="#fef3c7"/>
  <polygon points="0,140 60,70 110,120 170,50 240,130 320,90 320,180 0,180" fill="#334155"/>
  <polygon points="0,160 80,120 160,150 240,115 320,150 320,180 0,180" fill="#475569"/>
  <ellipse cx="160" cy="178" rx="200" ry="22" fill="#14532d"/>
  <use xlink:href="#tree" x="40" y="150"/><use href="#tree" x="70" y="156"/><use href="#tree" x="260" y="152"/><use href="#tree" x="285" y="158"/>
</svg>`;

/** A map pin + compass: arcs (large-arc/sweep flags, packed "a1 1 0 01 10 10" syntax), holes via nonzero winding. */
export const COMPASS = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <path d="M32 2a30 30 0 1 0 0.01 0zM32 8a24 24 0 1 1-0.01 0z" fill="#1e3a8a"/>
  <path d="M32 12l6 20-6 20-6-20z" fill="#dc2626"/>
  <path d="M32 32l6 0-6 20-6-20z" fill="#e5e7eb"/>
  <circle cx="32" cy="32" r="3" fill="#111827"/>
  <path d="M60 32a28 28 0 01-28 28" stroke="#93c5fd" stroke-width="2" fill="none" stroke-dasharray="4 3"/>
</svg>`;

export const SAMPLES: string[] = [ICONS, BADGE, SHAPES, LANDSCAPE, COMPASS];
export const NAMES: string[] = ['icons (strokes, arcs)', 'badge (gradients, CSS)', 'curves & transforms', 'landscape (use, slice)', 'compass (arcs, dashes)'];
