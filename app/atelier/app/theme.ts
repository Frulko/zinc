// Atelier's two themes: warm paper and warm ink, one accent (iris). Colours are 0xRRGGBB integers: canvases and the
// editor's decorations use them directly, classes use `bg(c)` / `fg(c)` / `bd(c)` (arbitrary `[#rrggbb]` tokens).
import { createSignal } from 'zinc:ui/solid';

export class Theme {
  name: string = ''; dark: boolean = true;
  // surfaces
  chrome: i32 = 0;        // the window: header, the space around the cards
  bg: i32 = 0;            // the cards: editor, console
  surface: i32 = 0;       // controls on the chrome (tabs, fields)
  elevated: i32 = 0;      // palette, menus
  border: i32 = 0; borderSoft: i32 = 0;
  text: i32 = 0; muted: i32 = 0; faint: i32 = 0;
  accent: i32 = 0; onAccent: i32 = 0; accentSoft: i32 = 0;
  hover: i32 = 0; active: i32 = 0; selected: i32 = 0;   // list rows and ghost buttons
  // editor
  lineHighlight: i32 = 0; lineNumber: i32 = 0; lineNumberActive: i32 = 0; indentGuide: i32 = 0;
  selection: i32 = 0; caret: i32 = 0; match: i32 = 0; matchCurrent: i32 = 0; bracket: i32 = 0;
  // status
  error: i32 = 0; errorSoft: i32 = 0; warning: i32 = 0; success: i32 = 0; info: i32 = 0; modified: i32 = 0;
  // syntax (see Tok in syntax.ts)
  keyword: i32 = 0; string: i32 = 0; number: i32 = 0; comment: i32 = 0; fn: i32 = 0; type: i32 = 0;
  property: i32 = 0; constant: i32 = 0; punctuation: i32 = 0; tag: i32 = 0; attribute: i32 = 0;
  heading: i32 = 0; link: i32 = 0; variable: i32 = 0;
  // console ANSI colours 30..37 (90..97 are drawn a little brighter)
  ansi: i32[] = [];
}

function paper(): Theme {
  const t = new Theme();
  t.name = 'Paper'; t.dark = false;
  t.chrome = 0xf3f1ec; t.bg = 0xfffefc; t.surface = 0xe9e6df; t.elevated = 0xfffefc; t.border = 0xd9d5cc; t.borderSoft = 0xe7e3db;
  t.text = 0x1d1b18; t.muted = 0x625d55; t.faint = 0x9a948a;
  t.accent = 0x5746e0; t.onAccent = 0xffffff; t.accentSoft = 0xe7e3fb;
  t.hover = 0xe6e3dc; t.active = 0xdcd8cf; t.selected = 0xebe8fb;
  t.lineHighlight = 0xf7f5f0; t.lineNumber = 0xbcb6ab; t.lineNumberActive = 0x4a463f; t.indentGuide = 0xeeebe4;
  t.selection = 0xcfc8fa; t.caret = 0x5746e0; t.match = 0xf5e2a0; t.matchCurrent = 0xf0b84a; t.bracket = 0xa39e95;
  t.error = 0xcf3a2b; t.errorSoft = 0xfbeae7; t.warning = 0xb7791f; t.success = 0x2f8f57; t.info = 0x2563c9; t.modified = 0x5746e0;
  t.keyword = 0xb5357d; t.string = 0x2f7d4f; t.number = 0xa8601a; t.comment = 0xa39e95; t.fn = 0x2563c9;
  t.type = 0x0e7c86; t.property = 0x5b5346; t.constant = 0xa8601a; t.punctuation = 0x6f6a62; t.tag = 0x2563c9;
  t.attribute = 0xa8601a; t.heading = 0xb5357d; t.link = 0x2563c9; t.variable = 0x1d1b18;
  t.ansi = [0x9a948a, 0xcf3a2b, 0x2f7d4f, 0xa8601a, 0x2563c9, 0xb5357d, 0x0e7c86, 0x1d1b18];
  return t;
}

function ink(): Theme {
  const t = new Theme();
  t.name = 'Ink'; t.dark = true;
  t.chrome = 0x151418; t.bg = 0x1c1b20; t.surface = 0x27262c; t.elevated = 0x24232a; t.border = 0x3a3842; t.borderSoft = 0x2b2a31;
  t.text = 0xeceaf0; t.muted = 0xa7a4b0; t.faint = 0x6f6c7a;
  t.accent = 0x9388ff; t.onAccent = 0x14121f; t.accentSoft = 0x2c2850;
  t.hover = 0x2a2930; t.active = 0x35333d; t.selected = 0x2f2c4d;
  t.lineHighlight = 0x222127; t.lineNumber = 0x55525f; t.lineNumberActive = 0xcfccd8; t.indentGuide = 0x29282e;
  t.selection = 0x3f3a7a; t.caret = 0x9388ff; t.match = 0x5a4b1c; t.matchCurrent = 0xa87d1f; t.bracket = 0x7b7887;
  t.error = 0xff7a6b; t.errorSoft = 0x3a2020; t.warning = 0xe8b06a; t.success = 0x6fd195; t.info = 0x7fb2ff; t.modified = 0x9388ff;
  t.keyword = 0xf27aa6; t.string = 0x8fd3a0; t.number = 0xe8b06a; t.comment = 0x6f6c7a; t.fn = 0x7fb2ff;
  t.type = 0x6fd3d6; t.property = 0xcfcbd8; t.constant = 0xe8b06a; t.punctuation = 0xa7a4b0; t.tag = 0x7fb2ff;
  t.attribute = 0xe8b06a; t.heading = 0xf27aa6; t.link = 0x7fb2ff; t.variable = 0xeceaf0;
  t.ansi = [0x6f6c7a, 0xff7a6b, 0x8fd3a0, 0xe8b06a, 0x7fb2ff, 0xf27aa6, 0x6fd3d6, 0xeceaf0];
  return t;
}

export const DARK: Theme = ink();
export const LIGHT: Theme = paper();
export const [theme, setTheme] = createSignal<Theme>(LIGHT);
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
