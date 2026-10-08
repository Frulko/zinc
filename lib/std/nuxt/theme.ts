// zinc:ui/nuxt, design tokens (ZN-357.01): Nuxt UI 4's colour aliases, semantic text / background / border tokens in light and dark, and its radius scale
// (nuxt/ui src/runtime/index.css and src/templates.ts; NOTICE.md). Values are exact hex of Tailwind 4's palettes, so components write them as arbitrary
// colour classes: `bg-${hex(t.primary)}` is `bg-[#00c950]`, `bg-${hex(t.primary, 10)}` adds the alpha step. The theme is a signal: under Solid,
// setColorMode('dark') restyles every mounted component; under React the next render picks it up.
import { createSignal } from 'zinc:ui/solid';

/** Tailwind 4.1 palettes, shades 50, 100, 200 ... 900, 950. */
export const PALETTES: Map<string, string[]> = new Map<string, string[]>();
PALETTES.set('slate', ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cad5e2', '#90a1b9', '#62748e', '#45556c', '#314158', '#1d293d', '#0f172b', '#020618']);
PALETTES.set('green', ['#f0fdf4', '#dcfce7', '#b9f8cf', '#7bf1a8', '#05df72', '#00c950', '#00a63e', '#008236', '#016630', '#0d542b', '#032e15']);
PALETTES.set('blue', ['#eff6ff', '#dbeafe', '#bedbff', '#8ec5ff', '#51a2ff', '#2b7fff', '#155dfc', '#1447e6', '#193cb8', '#1c398e', '#162456']);
PALETTES.set('yellow', ['#fefce8', '#fef9c2', '#fff085', '#ffdf20', '#fdc700', '#f0b100', '#d08700', '#a65f00', '#894b00', '#733e0a', '#432004']);
PALETTES.set('red', ['#fef2f2', '#ffe2e2', '#ffc9c9', '#ffa2a2', '#ff6467', '#fb2c36', '#e7000b', '#c10007', '#9f0712', '#82181a', '#460809']);
const SHADES: i32[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
/** The hex of `palette-shade` ('slate', 700 is '#314158'); white and black for the names. */
export function shade(palette: string, n: i32): string {
  if (palette === 'white') return '#ffffff';
  if (palette === 'black') return '#000000';
  const p = PALETTES.get(palette);
  const i = SHADES.indexOf(n);
  return p === undefined || i < 0 ? '#ff00ff' : p[i];
}

/** Which palette each alias uses (Nuxt UI's app.config `ui.colors`); the defaults are Nuxt UI's. */
export class NuxtColors {
  primary: string = 'green'; secondary: string = 'blue'; success: string = 'green'; info: string = 'blue'; warning: string = 'yellow'; error: string = 'red';
  neutral: string = 'slate';
}
export const COLOR_NAMES: string[] = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'];

/** The resolved tokens of one mode, as '#rrggbb'. */
export class NuxtTheme {
  mode: string = 'light';
  colors: NuxtColors = new NuxtColors();
  primary: string = ''; secondary: string = ''; success: string = ''; info: string = ''; warning: string = ''; error: string = '';   // shade 500 light, 400 dark
  textDimmed: string = ''; textMuted: string = ''; textToned: string = ''; text: string = ''; textHighlighted: string = ''; textInverted: string = '';
  bg: string = ''; bgMuted: string = ''; bgElevated: string = ''; bgAccented: string = ''; bgInverted: string = '';
  border: string = ''; borderMuted: string = ''; borderAccented: string = ''; borderInverted: string = '';
  /** An alias by name ('primary' ... 'error'); 'neutral' is the inverted background, as Nuxt UI's neutral solid button uses it. */
  color(name: string): string {
    if (name === 'primary') return this.primary; if (name === 'secondary') return this.secondary; if (name === 'success') return this.success;
    if (name === 'info') return this.info; if (name === 'warning') return this.warning; if (name === 'error') return this.error;
    return this.bgInverted;
  }
  /** Shade n of the palette behind an alias (light and dark variants of soft and subtle styles use 50..950 shades). */
  scale(name: string, n: i32): string {
    const c = this.colors;
    const p = name === 'primary' ? c.primary : name === 'secondary' ? c.secondary : name === 'success' ? c.success : name === 'info' ? c.info :
      name === 'warning' ? c.warning : name === 'error' ? c.error : c.neutral;
    return shade(p, n);
  }
}
/** The tokens of src/runtime/index.css for `mode` ('light' or 'dark'). */
export function makeTheme(mode: string, colors: NuxtColors): NuxtTheme {
  const t = new NuxtTheme();
  const dark = mode === 'dark';
  t.mode = dark ? 'dark' : 'light'; t.colors = colors;
  const a = dark ? 400 : 500, n = colors.neutral;
  t.primary = shade(colors.primary, a); t.secondary = shade(colors.secondary, a); t.success = shade(colors.success, a);
  t.info = shade(colors.info, a); t.warning = shade(colors.warning, a); t.error = shade(colors.error, a);
  t.textDimmed = shade(n, dark ? 500 : 400); t.textMuted = shade(n, dark ? 400 : 500); t.textToned = shade(n, dark ? 300 : 600);
  t.text = shade(n, dark ? 200 : 700); t.textHighlighted = dark ? '#ffffff' : shade(n, 900); t.textInverted = dark ? shade(n, 900) : '#ffffff';
  t.bg = dark ? shade(n, 900) : '#ffffff'; t.bgMuted = shade(n, dark ? 800 : 50); t.bgElevated = shade(n, dark ? 800 : 100);
  t.bgAccented = shade(n, dark ? 700 : 200); t.bgInverted = dark ? '#ffffff' : shade(n, 900);
  t.border = shade(n, dark ? 800 : 200); t.borderMuted = shade(n, dark ? 700 : 200); t.borderAccented = shade(n, dark ? 700 : 300);
  t.borderInverted = dark ? '#ffffff' : shade(n, 900);
  return t;
}

/** `[#rrggbb]` or `[#rrggbb]/alpha` for a class: `bg-${hex(t.primary, 10)}`. */
export function hex(c: string, alpha: i32 = 100): string { return alpha >= 100 ? '[' + c + ']' : '[' + c + ']/' + alpha; }

/** Nuxt UI's radius scale from --ui-radius (4 px): xs 2, sm 4, md 6, lg 8, xl 12, 2xl 16, 3xl 24 (zinc:ui's sm is 2, so the kit writes px). */
export function radius(size: string): number {
  const k = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'].indexOf(size);
  const f: number[] = [0.5, 1, 1.5, 2, 3, 4, 6, 2499.75];
  return k < 0 ? 4 : 4 * f[k];
}
/** `rounded-[6px]` for a radius size. */
export function rounded(size: string): string { return size === 'full' ? 'rounded-full' : 'rounded-[' + radius(size) + 'px]'; }

const [colors, setColorsSignal] = createSignal<NuxtColors>(new NuxtColors());
const [mode, setMode] = createSignal<string>('light');
/** The current tokens (reactive). */
let cached: NuxtTheme | null = null;
export function theme(): NuxtTheme {
  const m = mode(), c = colors();
  const k = cached;
  if (k !== null && k.mode === m && k.colors === c) return k;
  const t = makeTheme(m, c);
  cached = t;
  return t;
}
export function colorMode(): string { return mode(); }
/** 'light' or 'dark'. */
export function setColorMode(m: string): void { setMode(m === 'dark' ? 'dark' : 'light'); }
/** Which palettes the aliases use (Nuxt UI's app.config `ui.colors`). */
export function setColors(c: NuxtColors): void { setColorsSignal(c); }
