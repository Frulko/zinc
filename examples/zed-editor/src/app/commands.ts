// Everything the command palette (⌘⇧P) and the keyboard can do, named like Zed's actions ("namespace: action"),
// plus the palette / file finder state.
import { createSignal } from 'zinc:ui/solid';
import { Tween, easeOut, easeInOut } from './motion';
import { active, activate, Buffer, buffers, closeBuffer, cycle, save, say } from './workspace';
import { togglePanel, toggleTerminal, showTerminal, zoom, setFontIndex, DEFAULT_FONT, softWrap, setSoftWrap, minimapOn, setMinimapOn } from './settings';
import { openFind } from './search';
import { toggleTheme, theme } from './theme';
import { reveal } from './project';
import { runProject, clearTerminal, check } from './tools';

export class Command {
  name: string; keys: string; run: () => void;
  constructor(name: string, keys: string, run: () => void) { this.name = name; this.keys = keys; this.run = run; }
}

function withBuffer(f: (b: Buffer) => void): () => void {
  return () => { const b = active(); if (b !== null) f(b as Buffer); else say('No open file'); };
}

export const COMMANDS: Command[] = [
  new Command('file finder: toggle', '⌘P', () => openPalette(PAL_FILES)),
  new Command('workspace: save', '⌘S', withBuffer((b: Buffer) => save(b))),
  new Command('workspace: save all', '⌥⌘S', () => { for (const b of buffers()) if (b.modified()) save(b); }),
  new Command('pane: close active item', '⌘W', withBuffer((b: Buffer) => closeBuffer(b))),
  new Command('pane: activate next item', '⌘⇧]', () => cycle(1)),
  new Command('pane: activate previous item', '⌘⇧[', () => cycle(-1)),
  new Command('buffer search: deploy', '⌘F', () => openFind()),
  new Command('editor: toggle soft wrap', '⌥Z', () => { setSoftWrap(!softWrap()); say(softWrap() ? 'Soft wrap on' : 'Soft wrap off'); }),
  new Command('editor: toggle minimap', '', () => setMinimapOn(!minimapOn())),
  new Command('zed: increase buffer font size', '⌘=', () => zoom(1)),
  new Command('zed: decrease buffer font size', '⌘-', () => zoom(-1)),
  new Command('zed: reset buffer font size', '⌘0', () => setFontIndex(DEFAULT_FONT)),
  new Command('project panel: toggle', '⌘B', () => togglePanel()),
  new Command('project panel: reveal active file', '', withBuffer((b: Buffer) => { reveal(b.path); })),
  new Command('terminal panel: toggle', '⌘J', () => toggleTerminal()),
  new Command('task: run project', '⌘R', () => { showTerminal(true); runProject(); }),
  new Command('terminal: clear', '', () => clearTerminal()),
  new Command('diagnostics: check file', '', withBuffer((b: Buffer) => check(b))),
  new Command('theme selector: toggle light / dark', '', () => { toggleTheme(); say(theme().name); }),
];

// ---- the palette: one overlay, two modes
export const PAL_CLOSED: i32 = -1, PAL_COMMANDS: i32 = 0, PAL_FILES: i32 = 1;
export const [paletteMode, setPaletteMode] = createSignal<i32>(PAL_CLOSED);
/** 0 closed → 1 open: fade and scale. */
export const paletteT = new Tween(0);
export function openPalette(mode: i32): void {
  setPaletteMode(mode);
  paletteT.to(1, 0.16, easeOut);
}
export function closePalette(): void {
  if (paletteMode() === PAL_CLOSED) return;
  paletteT.to(0, 0.12, easeInOut, () => setPaletteMode(PAL_CLOSED));
  const b = active();
  if (b !== null) activate(b as Buffer);
}
