// Everything Atelier can do, once: the desktop menu, the command palette and the keyboard all read this table.
// Also the state of the palette (commands, examples, libraries) and of the one-line prompt of the status line.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Tween, easeOut, easeInOut } from './motion';
import { active, activate, Buffer, closeBuffer, cycle, saveAll, say, newSketch, openSketch, newFile, renameFile, deleteFile,
  sketchDir, sketchbook, mainFile, openFile, edited } from './workspace';
import { openFind } from './search';
import { toggleTheme } from './theme';
import { run, stop, check, showConsole, consoleOpen, clearConsole, loadLibraries, importLine, setEngine, ENGINES, ZINC } from './tools';
import { editCommand } from './cursors';

export class Command {
  id: string; menu: string; name: string; keys: string; run: () => void;
  /** 'separator' before this item in its menu. */
  sep: boolean = false;
  constructor(menu: string, id: string, name: string, keys: string, run: () => void) { this.menu = menu; this.id = id; this.name = name; this.keys = keys; this.run = run; }
}
export const COMMANDS: Command[] = [];
function add(menu: string, id: string, name: string, keys: string, run: () => void, sep: boolean = false): void {
  const c = new Command(menu, id, name, keys, run);
  c.sep = sep;
  COMMANDS.push(c);
}
function withBuffer(f: (b: Buffer) => void): () => void {
  return () => { const b = active(); if (b !== null) f(b as Buffer); else say('No open file'); };
}
/** Runs a command by id (a menu click, a scripted session). */
export function command(id: string): boolean {
  for (const c of COMMANDS) if (c.id === id) { c.run(); return true; }
  return false;
}

/** '⌘⇧K' for 'CmdOrCtrl+Shift+K'. */
export function keysText(keys: string): string {
  if (keys === '') return '';
  let out = '';
  const parts = keys.split('+');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i < parts.length - 1) out += p === 'CmdOrCtrl' ? '⌘' : p === 'Shift' ? '⇧' : p === 'Alt' ? '⌥' : p === 'Ctrl' ? '⌃' : p;
    else out += p === 'Up' ? '↑' : p === 'Down' ? '↓' : p === 'Slash' ? '/' : p === 'Enter' ? '↵' : p === 'Period' ? '.' : p === 'BracketLeft' ? '[' : p === 'BracketRight' ? ']' : p;
  }
  return out;
}
/** Whether a key event is the shortcut `keys`. */
function matches(keys: string, e: ui.KeyEvent): boolean {
  const parts = keys.split('+'), key = parts[parts.length - 1];
  const want = key === 'Up' ? 'ArrowUp' : key === 'Down' ? 'ArrowDown' : key === 'Slash' ? '/' : key === 'Period' ? '.' : key === 'BracketLeft' ? '[' : key === 'BracketRight' ? ']' : key.length === 1 ? key.toLowerCase() : key;
  if (e.key !== want) return false;
  return e.primary === (parts.indexOf('CmdOrCtrl') >= 0) && e.shift === (parts.indexOf('Shift') >= 0) && e.alt === (parts.indexOf('Alt') >= 0);
}
/** The command of a shortcut, or null. */
export function commandOf(e: ui.KeyEvent): Command | null {
  for (const c of COMMANDS) if (c.keys !== '' && matches(c.keys, e)) return c;
  return null;
}

// ---------------------------------------------------------------- the prompt: one line of text asked on the status line
export const [promptLabel, setPromptLabel] = createSignal<string>('');
export const [promptValue, setPromptValue] = createSignal<string>('');
let promptThen: (v: string) => void = (v: string) => {};
/** Asks for one line of text ('Name of the new file'); `then` gets it when it is confirmed and not empty. */
export function ask(label: string, value: string, then: (v: string) => void): void {
  promptThen = then;
  setPromptValue(value);
  setPromptLabel(label);
}
export function answer(ok: boolean): void {
  const v = promptValue();
  setPromptLabel('');
  const b = active();
  if (b !== null) activate(b as Buffer);
  if (ok && v.trim() !== '') promptThen(v.trim());
}

// ---------------------------------------------------------------- palette: commands, examples, libraries
export const PAL_CLOSED: i32 = -1, PAL_COMMANDS: i32 = 0, PAL_LIBRARIES: i32 = 1;
export const [paletteMode, setPaletteMode] = createSignal<i32>(PAL_CLOSED);
/** 0 closed → 1 open: fade and scale. */
export const paletteT = new Tween(0);
export function openPalette(mode: i32): void {
  if (mode === PAL_LIBRARIES) loadLibraries();
  setPaletteMode(mode);
  paletteT.to(1, 0.16, easeOut);
}
export function closePalette(): void {
  if (paletteMode() === PAL_CLOSED) return;
  paletteT.to(0, 0.12, easeInOut, () => setPaletteMode(PAL_CLOSED));
  const b = active();
  if (b !== null) activate(b as Buffer);
}

/** The start view (examples and a new sketch) over the editor. */
export const [startOpen, setStartOpen] = createSignal<boolean>(false);

/** Adds a library to the sketch: its import line at the top of the main file (the plugins `zinc plugins` lists come with zinc). */
export function addLibrary(name: string): void {
  const dir = sketchDir(), main = mainFile(dir);
  if (main === '') { say('The sketch has no code file'); return; }
  const b = openFile(dir + '/' + main);
  if (b === null) return;
  const line = importLine(name), buf = b as Buffer;
  if (buf.text().indexOf(`'${name}'`) >= 0) { say(`${name} is already imported`); return; }
  // after the leading comment lines, with the other imports
  const lines = buf.text().split('\n');
  let at: i32 = 0;
  while (at < lines.length && lines[at].startsWith('//')) at++;
  const text = lines.slice(0, at).concat([line]).concat(lines.slice(at)).join('\n'), h = buf.node();
  if (h >= 0) ui.setValue(h, text);
  edited(buf, text);
  say(`Added ${name}`);
}

// ---------------------------------------------------------------- the table
add('File', 'new', 'New Sketch', 'CmdOrCtrl+N', () => { setStartOpen(false); newSketch(); });
add('File', 'open', 'Open Sketch…', 'CmdOrCtrl+O', () => ask('Open the sketch folder', sketchDir() === '' ? sketchbook() : sketchDir(), (v: string) => { if (openSketch(v)) setStartOpen(false); }));
add('File', 'examples', 'Examples…', 'CmdOrCtrl+Shift+O', () => setStartOpen(true));
add('File', 'save', 'Save', 'CmdOrCtrl+S', () => { saveAll(); const b = active(); if (b !== null && !(b as Buffer).modified()) say('Saved'); check(); }, true);
add('File', 'close', 'Close Tab', 'CmdOrCtrl+W', withBuffer((b: Buffer) => closeBuffer(b)));

add('Edit', 'undo', 'Undo', 'CmdOrCtrl+Z', () => { editCommand('undo'); });
add('Edit', 'redo', 'Redo', 'CmdOrCtrl+Shift+Z', () => { editCommand('redo'); });
add('Edit', 'find', 'Find…', 'CmdOrCtrl+F', () => openFind(), true);
add('Edit', 'comment', 'Toggle Comment', 'CmdOrCtrl+Slash', () => { editCommand('comment'); }, true);
add('Edit', 'indent', 'Indent', '', () => { editCommand('indent'); });
add('Edit', 'outdent', 'Unindent', '', () => { editCommand('outdent'); });
add('Edit', 'line-up', 'Move Line Up', 'Alt+Up', () => { editCommand('line-up'); }, true);
add('Edit', 'line-down', 'Move Line Down', 'Alt+Down', () => { editCommand('line-down'); });
add('Edit', 'line-duplicate', 'Duplicate Line', 'CmdOrCtrl+Shift+D', () => { editCommand('line-duplicate'); });
add('Edit', 'line-delete', 'Delete Line', 'CmdOrCtrl+Shift+K', () => { editCommand('line-delete'); });
add('Edit', 'select-next', 'Select Next Occurrence', 'CmdOrCtrl+D', () => { editCommand('select-next'); }, true);
add('Edit', 'cursor-above', 'Add Cursor Above', 'CmdOrCtrl+Alt+Up', () => { editCommand('cursor-above'); });
add('Edit', 'cursor-below', 'Add Cursor Below', 'CmdOrCtrl+Alt+Down', () => { editCommand('cursor-below'); });

add('Sketch', 'run', 'Run', 'CmdOrCtrl+R', () => run(false));
add('Sketch', 'stop', 'Stop', 'CmdOrCtrl+Period', () => stop());
add('Sketch', 'debug', 'Debug', 'CmdOrCtrl+Shift+R', () => run(true));
for (let i = 0; i < ENGINES.length; i++) add('Sketch', 'engine-' + ENGINES[i].split(' ')[0].toLowerCase(), 'Run on: ' + ENGINES[i], '', () => { setEngine(i); say('Runs on: ' + ENGINES[i]); }, i === 0);
add('Sketch', 'add-file', 'Add File…', 'CmdOrCtrl+T', () => { if (sketchDir() !== '') ask('Name of the new file', '', (v: string) => newFile(v)); }, true);
add('Sketch', 'rename-file', 'Rename File…', '', withBuffer((b: Buffer) => ask('New name of ' + b.name, b.name, (v: string) => renameFile(b, v))));
add('Sketch', 'delete-file', 'Delete File', '', withBuffer((b: Buffer) => ask(`Type "delete" to remove ${b.name} from the sketch`, '', (v: string) => { if (v === 'delete') deleteFile(b); })));
add('Sketch', 'add-library', 'Add Library…', 'CmdOrCtrl+Shift+L', () => openPalette(PAL_LIBRARIES), true);

add('Tools', 'palette', 'Command Palette…', 'CmdOrCtrl+Shift+P', () => openPalette(PAL_COMMANDS));
add('Tools', 'console', 'Show or Hide the Console', 'CmdOrCtrl+J', () => showConsole(!consoleOpen()));
add('Tools', 'clear', 'Clear the Console', '', () => clearConsole());
add('Tools', 'check', 'Check the Sketch', '', () => { saveAll(); check(); });
add('Tools', 'theme', 'Light or Dark', '', () => toggleTheme(), true);
add('Tools', 'next-tab', 'Next Tab', 'CmdOrCtrl+Shift+BracketRight', () => cycle(1), true);
add('Tools', 'prev-tab', 'Previous Tab', 'CmdOrCtrl+Shift+BracketLeft', () => cycle(-1));

add('Help', 'help-keys', 'Keyboard Shortcuts', '', () => openPalette(PAL_COMMANDS));
add('Help', 'help-about', 'About Zinc Atelier', '', () => say('Zinc Atelier, running on ' + ZINC));
