// Everything Atelier can do, once: the desktop menu, the command palette and the keyboard all read this table.
// Also the state of the palette (commands, examples, libraries) and of the one-line prompt of the status line.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as dialog from 'zinc:system/dialog';
import { Tween, easeOut, easeInOut } from './motion';
import { active, activate, Buffer, closeBuffer, cycle, saveAll, say, newSketch, openSketch, newFile, renameFile, deleteFile,
  sketchDir, sketchbook, mainFile, openFile, baseName } from './workspace';
import { openFind } from './search';
import { toggleTheme } from './theme';
import { openProject } from './project';
import { run, stop, build, check, inspect, copyConsole, showConsole, consoleOpen, clearConsole, loadLibraries, importLine, setEngine, setDevice, ENGINE_IDS, engineName, ZINC, updates, updateReady } from './tools';
import { openDevices } from './devices';
import { editCommand, setText, menuKey, goDefinition } from './cursors';
import { suggest } from './lsp';
import { t } from './text';

export class Command {
  id: string; menu: string; keys: string; run: () => void;
  /** 'separator' before this item in its menu. */
  sep: boolean = false;
  constructor(menu: string, id: string, keys: string, run: () => void) { this.menu = menu; this.id = id; this.keys = keys; this.run = run; }
  /** Its name in menus and the palette, in the language of the interface (atelier.cmd.<id>). */
  name(): string { return t('atelier.cmd.' + this.id); }
}
/** The menus of the desktop menu, in their order; their titles are atelier.menu.<id>. */
export const MENUS: string[] = ['file', 'edit', 'sketch', 'tools', 'help'];
export const COMMANDS: Command[] = [];
function add(menu: string, id: string, keys: string, run: () => void, sep: boolean = false): void {
  const c = new Command(menu, id, keys, run);
  c.sep = sep;
  COMMANDS.push(c);
}
function withBuffer(f: (b: Buffer) => void): () => void {
  return () => { const b = active(); if (b !== null) f(b as Buffer); else say(t('atelier.file.none_open')); };
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
/** Asks for one line of text (the name of a new file); `then` gets it when it is confirmed and not empty. */
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
export const PAL_CLOSED: i32 = -1, PAL_COMMANDS: i32 = 0, PAL_LIBRARIES: i32 = 1, PAL_FILES: i32 = 2;
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
  if (main === '') { say(t('atelier.sketch.no_code')); return; }
  const b = openFile(dir + '/' + main);
  if (b === null) return;
  const line = importLine(name), buf = b as Buffer;
  if (buf.text().indexOf(`'${name}'`) >= 0) { say(t('atelier.library.already', ['name', name])); return; }
  // after the leading comment lines, with the other imports
  const lines = buf.text().split('\n');
  let at: i32 = 0;
  while (at < lines.length && lines[at].startsWith('//')) at++;
  setText(buf, lines.slice(0, at).concat([line]).concat(lines.slice(at)).join('\n'));
  say(t('atelier.library.added', ['name', name]));
}

// ---------------------------------------------------------------- the table
add('file', 'new', 'CmdOrCtrl+N', () => { setStartOpen(false); newSketch(); });
/** Open Sketch…: the system's own folder dialog in a real window; the one-line prompt where there is none (a scripted or headless run, a desktop without dialogs). */
function chooseSketch(): void {
  const from = sketchDir() === '' ? sketchbook() : sketchDir();
  if (!dialog.isSupported() || sys.env('ZINC_HEADLESS') !== '' || sys.env('ZINC_DETERMINISTIC') !== '') { ask(t('atelier.sketch.open_prompt'), from, (v: string) => { if (openSketch(v)) setStartOpen(false); }); return; }
  const o = new dialog.OpenOptions();
  o.title = t('atelier.sketch.open_title'); o.directory = true; o.defaultPath = from;
  const abort = sys.env('ZINC_ATELIER_DIALOG_MS');   // a test: the dialog closes by itself after that long
  if (abort !== '') o.abortMs = parseInt(abort);
  dialog.open(o).then((paths: string[] | null) => { if (paths !== null && paths.length > 0 && openSketch(paths[0])) setStartOpen(false); });
}
add('file', 'open', 'CmdOrCtrl+O', () => chooseSketch());
add('file', 'examples', 'CmdOrCtrl+Shift+O', () => setStartOpen(true));
add('file', 'open-file', 'CmdOrCtrl+P', () => { if (sketchDir() !== '') openPalette(PAL_FILES); });
add('file', 'save', 'CmdOrCtrl+S', () => { saveAll(); const b = active(); if (b !== null && !(b as Buffer).modified()) say(t('atelier.file.saved_all')); check(); }, true);
add('file', 'close', 'CmdOrCtrl+W', withBuffer((b: Buffer) => closeBuffer(b)));

// undo and redo go to the focused field as their key (the editor's history, or the field's own in the find bar); see menuKey
add('edit', 'undo', 'CmdOrCtrl+Z', () => menuKey('z', ui.META));
add('edit', 'redo', 'CmdOrCtrl+Shift+Z', () => menuKey('z', ui.META | ui.SHIFT));
add('edit', 'find', 'CmdOrCtrl+F', () => openFind(), true);
add('edit', 'comment', 'CmdOrCtrl+Slash', () => { editCommand('comment'); }, true);
add('edit', 'indent', '', () => { editCommand('indent'); });
add('edit', 'outdent', '', () => { editCommand('outdent'); });
add('edit', 'line-up', 'Alt+Up', () => { editCommand('line-up'); }, true);
add('edit', 'line-down', 'Alt+Down', () => { editCommand('line-down'); });
add('edit', 'line-duplicate', 'CmdOrCtrl+Shift+D', () => { editCommand('line-duplicate'); });
add('edit', 'line-delete', 'CmdOrCtrl+Shift+K', () => { editCommand('line-delete'); });
add('edit', 'select-next', 'CmdOrCtrl+D', () => { editCommand('select-next'); }, true);
add('edit', 'cursor-above', 'CmdOrCtrl+Alt+Up', () => { editCommand('cursor-above'); });
add('edit', 'cursor-below', 'CmdOrCtrl+Alt+Down', () => { editCommand('cursor-below'); });
add('edit', 'suggest', 'Ctrl+Space', withBuffer((b: Buffer) => suggest(b)), true);
add('edit', 'definition', 'F12', () => goDefinition());

add('sketch', 'run', 'CmdOrCtrl+R', () => run(false));
add('sketch', 'stop', 'CmdOrCtrl+Period', () => stop());
add('sketch', 'debug', 'CmdOrCtrl+Shift+R', () => run(true));
for (let i = 0; i < ENGINE_IDS.length; i++) add('sketch', 'engine-' + ENGINE_IDS[i], '', () => { setEngine(i); setDevice(''); say(t('atelier.engine.chosen', ['engine', engineName(i)])); }, i === 0);
add('sketch', 'devices', '', () => openDevices());
add('sketch', 'project', '', () => openProject(), true);
add('sketch', 'build', '', () => build());
add('sketch', 'add-file', 'CmdOrCtrl+T', () => { if (sketchDir() !== '') ask(t('atelier.file.new_prompt'), '', (v: string) => newFile(v)); }, true);
add('sketch', 'rename-file', '', withBuffer((b: Buffer) => ask(t('atelier.file.rename_prompt', ['name', b.name]), baseName(b.path), (v: string) => renameFile(b, v))));
add('sketch', 'delete-file', '', withBuffer((b: Buffer) => ask(t('atelier.file.delete_prompt', ['name', b.name, 'word', t('atelier.file.delete_word')]), '', (v: string) => { if (v === t('atelier.file.delete_word')) deleteFile(b); })));
add('sketch', 'add-library', 'CmdOrCtrl+Shift+L', () => openPalette(PAL_LIBRARIES), true);

add('tools', 'palette', 'CmdOrCtrl+Shift+P', () => openPalette(PAL_COMMANDS));
add('tools', 'console', 'CmdOrCtrl+J', () => showConsole(!consoleOpen()));
add('tools', 'clear', '', () => clearConsole());
add('tools', 'copy-console', '', () => copyConsole());
add('tools', 'check', '', () => { saveAll(); check(); });
add('tools', 'inspector', '', () => inspect());
add('tools', 'theme', '', () => toggleTheme(), true);
add('tools', 'next-tab', 'CmdOrCtrl+Shift+BracketRight', () => cycle(1), true);
add('tools', 'prev-tab', 'CmdOrCtrl+Shift+BracketLeft', () => cycle(-1));

add('help', 'help-keys', '', () => openPalette(PAL_COMMANDS));
add('help', 'help-about', '', () => say(t('atelier.about', ['path', ZINC])));
add('help', 'update-check', '', () => updates(false), true);
add('help', 'update-install', '', () => updates(updateReady()));   // checks first when no update was found yet
