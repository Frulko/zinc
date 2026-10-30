// Atelier's two themes, after macOS's own (System Settings, Xcode): a grey sidebar, white content, hairline borders, one
// accent (the system blue). Colours are 0xRRGGBB integers: canvases and the editor's decorations use them directly, classes
// use `bg(c)` / `fg(c)` / `bd(c)` (arbitrary `[#rrggbb]` tokens).
import { createSignal } from 'zinc:ui/solid';

export class Theme {
  name: string = ''; dark: boolean = true;
  // surfaces
  chrome: i32 = 0;        // the toolbar, the start view
  sidebar: i32 = 0;       // the sidebar
  bg: i32 = 0;            // the content: editor, console, the settings' page
  surface: i32 = 0;       // controls on the chrome (tabs, fields)
  elevated: i32 = 0;      // palette, menus, the groups of the settings
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

function light(): Theme {
  const t = new Theme();
  t.name = 'Light'; t.dark = false;
  t.chrome = 0xfbfbfd; t.sidebar = 0xf2f2f5; t.bg = 0xffffff; t.surface = 0xececf0; t.elevated = 0xffffff; t.border = 0xdcdce1; t.borderSoft = 0xe8e8ec;
  t.text = 0x1d1d1f; t.muted = 0x6e6e73; t.faint = 0xa1a1a6;
  t.accent = 0x007aff; t.onAccent = 0xffffff; t.accentSoft = 0xe3efff;
  t.hover = 0xebebef; t.active = 0xe0e0e5; t.selected = 0xe3efff;
  t.lineHighlight = 0xf6f8fb; t.lineNumber = 0xb4b4ba; t.lineNumberActive = 0x3a3a3c; t.indentGuide = 0xefeff2;
  t.selection = 0xb4d8fd; t.caret = 0x007aff; t.match = 0xfff0a6; t.matchCurrent = 0xffd257; t.bracket = 0xa1a1a6;
  t.error = 0xd70015; t.errorSoft = 0xffedec; t.warning = 0xb26b00; t.success = 0x248a3d; t.info = 0x0066cc; t.modified = 0x007aff;
  t.keyword = 0x9b2393; t.string = 0xc41a16; t.number = 0x1c00cf; t.comment = 0x707f8c; t.fn = 0x326d74;
  t.type = 0x0b4f79; t.property = 0x4b21b0; t.constant = 0x1c00cf; t.punctuation = 0x5c5c61; t.tag = 0x0b4f79;
  t.attribute = 0x815f03; t.heading = 0x9b2393; t.link = 0x0e5fd8; t.variable = 0x1d1d1f;
  t.ansi = [0xa1a1a6, 0xd70015, 0x248a3d, 0xb26b00, 0x0066cc, 0x9b2393, 0x0b7a8a, 0x1d1d1f];
  return t;
}

function dark(): Theme {
  const t = new Theme();
  t.name = 'Dark'; t.dark = true;
  t.chrome = 0x262628; t.sidebar = 0x2b2b2e; t.bg = 0x1e1e20; t.surface = 0x353538; t.elevated = 0x2a2a2d; t.border = 0x3d3d41; t.borderSoft = 0x313134;
  t.text = 0xf5f5f7; t.muted = 0x98989f; t.faint = 0x67676d;
  t.accent = 0x0a84ff; t.onAccent = 0xffffff; t.accentSoft = 0x0d2c4f;
  t.hover = 0x333336; t.active = 0x3d3d41; t.selected = 0x16395f;
  t.lineHighlight = 0x252528; t.lineNumber = 0x5b5b61; t.lineNumberActive = 0xd1d1d6; t.indentGuide = 0x2c2c2f;
  t.selection = 0x3a5a80; t.caret = 0x0a84ff; t.match = 0x5a4b1c; t.matchCurrent = 0xa87d1f; t.bracket = 0x7c7c82;
  t.error = 0xff6961; t.errorSoft = 0x3a2121; t.warning = 0xffb340; t.success = 0x30d158; t.info = 0x64d2ff; t.modified = 0x0a84ff;
  t.keyword = 0xfc5fa3; t.string = 0xfc6a5d; t.number = 0xd0bf69; t.comment = 0x6c7986; t.fn = 0x67b7a4;
  t.type = 0x5dd8ff; t.property = 0xa167e6; t.constant = 0xd0bf69; t.punctuation = 0xa1a1a6; t.tag = 0x5dd8ff;
  t.attribute = 0xd9a85b; t.heading = 0xfc5fa3; t.link = 0x6aa9ff; t.variable = 0xf5f5f7;
  t.ansi = [0x6c7986, 0xff6961, 0x30d158, 0xffb340, 0x64d2ff, 0xfc5fa3, 0x5dd8ff, 0xf5f5f7];
  return t;
}

export const DARK: Theme = dark();
export const LIGHT: Theme = light();
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
