// One Dark and One Light, after Zed's default themes. Colours are 0xRRGGBB integers: canvases and the editor's
// decorations use them directly, classes use `bg(c)` / `fg(c)` / `bd(c)` (arbitrary `[#rrggbb]` tokens).
import { createSignal } from 'zinc:ui/solid';

export class Theme {
  name: string = ''; dark: boolean = true;
  // surfaces
  bg: i32 = 0;            // editor
  surface: i32 = 0;       // title bar, panels, tab bar, status bar
  elevated: i32 = 0;      // palette, dialogs
  border: i32 = 0; borderSoft: i32 = 0;
  text: i32 = 0; muted: i32 = 0; faint: i32 = 0;
  accent: i32 = 0;
  hover: i32 = 0; active: i32 = 0; selected: i32 = 0;   // list rows and ghost buttons
  // editor
  lineHighlight: i32 = 0; lineNumber: i32 = 0; lineNumberActive: i32 = 0; indentGuide: i32 = 0;
  selection: i32 = 0; caret: i32 = 0; match: i32 = 0; matchCurrent: i32 = 0; bracket: i32 = 0;
  minimap: i32 = 0; minimapThumb: i32 = 0;
  // status
  error: i32 = 0; warning: i32 = 0; success: i32 = 0; info: i32 = 0; modified: i32 = 0;
  // syntax (see Tok in syntax.ts)
  keyword: i32 = 0; string: i32 = 0; number: i32 = 0; comment: i32 = 0; fn: i32 = 0; type: i32 = 0;
  property: i32 = 0; constant: i32 = 0; punctuation: i32 = 0; tag: i32 = 0; attribute: i32 = 0;
  heading: i32 = 0; link: i32 = 0; variable: i32 = 0;
  // terminal ANSI colours 30..37 (90..97 are drawn a little brighter)
  ansi: i32[] = [];
}

function oneDark(): Theme {
  const t = new Theme();
  t.name = 'One Dark'; t.dark = true;
  t.bg = 0x282c34; t.surface = 0x2f343e; t.elevated = 0x2f343e; t.border = 0x464b57; t.borderSoft = 0x363c46;
  t.text = 0xdce0e5; t.muted = 0xa9afbc; t.faint = 0x878a98; t.accent = 0x74ade8;
  t.hover = 0x363c46; t.active = 0x454a56; t.selected = 0x3b414d;
  t.lineHighlight = 0x2c313a; t.lineNumber = 0x4e5a5f; t.lineNumberActive = 0xd0d4da; t.indentGuide = 0x363b45;
  t.selection = 0x3e5a80; t.caret = 0x74ade8; t.match = 0x5b6b3d; t.matchCurrent = 0xb58a3a; t.bracket = 0x7b8496;
  t.minimap = 0x2a2e36; t.minimapThumb = 0x5c6370;
  t.error = 0xd07277; t.warning = 0xdec184; t.success = 0xa1c181; t.info = 0x74ade8; t.modified = 0xdec184;
  t.keyword = 0xb477cf; t.string = 0xa1c181; t.number = 0xbf956a; t.comment = 0x5d636f; t.fn = 0x73ade9;
  t.type = 0x6eb4bf; t.property = 0xd07277; t.constant = 0xdfc184; t.punctuation = 0xacb2be; t.tag = 0x74ade8;
  t.attribute = 0xbf956a; t.heading = 0xd07277; t.link = 0x74ade8; t.variable = 0xdce0e5;
  t.ansi = [0x5d636f, 0xd07277, 0xa1c181, 0xdec184, 0x74ade8, 0xb477cf, 0x6eb4bf, 0xdce0e5];
  return t;
}

function oneLight(): Theme {
  const t = new Theme();
  t.name = 'One Light'; t.dark = false;
  t.bg = 0xfafafa; t.surface = 0xebebec; t.elevated = 0xf4f4f5; t.border = 0xc9c9ca; t.borderSoft = 0xdfdfe0;
  t.text = 0x242529; t.muted = 0x58585a; t.faint = 0x7e8086; t.accent = 0x5c78e2;
  t.hover = 0xdfdfe0; t.active = 0xcacacb; t.selected = 0xd8dcf2;
  t.lineHighlight = 0xf0f0f1; t.lineNumber = 0xb4b4b6; t.lineNumberActive = 0x242529; t.indentGuide = 0xe4e4e6;
  t.selection = 0xb9c6f2; t.caret = 0x5c78e2; t.match = 0xd4e3b0; t.matchCurrent = 0xf2c46b; t.bracket = 0x9a9ca3;
  t.minimap = 0xf2f2f3; t.minimapThumb = 0xb4b4b6;
  t.error = 0xd36151; t.warning = 0xc18401; t.success = 0x669f59; t.info = 0x5c78e2; t.modified = 0xc18401;
  t.keyword = 0xa449ab; t.string = 0x649f57; t.number = 0xad6e25; t.comment = 0xa2a3a7; t.fn = 0x5b79e3;
  t.type = 0x3882b7; t.property = 0xd3604f; t.constant = 0xc18401; t.punctuation = 0x4d4f52; t.tag = 0x5b79e3;
  t.attribute = 0xad6e25; t.heading = 0xd3604f; t.link = 0x5b79e3; t.variable = 0x242529;
  t.ansi = [0xa2a3a7, 0xd36151, 0x649f57, 0xc18401, 0x5b79e3, 0xa449ab, 0x3882b7, 0x242529];
  return t;
}

export const DARK: Theme = oneDark();
export const LIGHT: Theme = oneLight();
export const [theme, setTheme] = createSignal<Theme>(DARK);
export function toggleTheme(): void { setTheme(theme().dark ? LIGHT : DARK); }

/** Characters outside ASCII that file contents and program output often use: listed here so they are baked into the
 *  program's fonts with the ones of its own strings (text drawn at runtime can only use baked glyphs). */
export const EXTRA_GLYPHS = '°±×÷…–—‘’“”•·→←↑↓⇧⌘⌥⌃✓✗▁▂▃▄▅▆▇█░▒▓│─┌┐└┘├┤éèêëàâäçîïôöùûüÉÀÇœæßñ€£¥©®™';

const HEX = '0123456789abcdef';
/** 0xRRGGBB as an arbitrary-value class token: '[#rrggbb]'. */
export function hex(c: i32): string {
  let s = '';
  for (let i = 20; i >= 0; i -= 4) { const d = (c >> i) & 15; s += HEX.slice(d, d + 1); }
  return `[#${s}]`;
}
export function bg(c: i32): string { return `bg-${hex(c)}`; }
export function fg(c: i32): string { return `text-${hex(c)}`; }
export function bd(c: i32): string { return `border-${hex(c)}`; }

/** a..b by t (0..1), per channel: hover states and fades drawn on canvases. */
export function mix(a: i32, b: i32, t: number): i32 {
  const r: i32 = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g: i32 = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const l: i32 = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | l;
}
