// zed-editor: a code editor in the style of Zed, written in Zinc with zinc:ui (Solid model), drawn by the software
// renderer. A project tree read with zinc:fs, tabs with preview semantics, a code editor with syntax highlighting,
// decorations and a minimap, a command palette and a fuzzy file finder, find in file, diagnostics from
// `zinc check`, and a terminal panel running the project. See README.md for the shortcuts.
//
//   zinc run examples/zed-editor                     the bundled sample project
//   zinc run examples/zed-editor -- path/to/folder   another folder
//   ZINC_DEMO=<scene> zinc run examples/zed-editor   scripted scenes for screenshots and measurements (demo.ts)
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stepMotion } from './app/motion';
import { theme } from './app/theme';
import { initProject, root } from './app/project';
import { active, Buffer, buffers, save, closeBuffer, cycle, openFile, setHooks, applyFocus, focusLater, stepNotice } from './app/workspace';
import { togglePanel, toggleTerminal, showTerminal, zoom, setFontIndex, DEFAULT_FONT } from './app/settings';
import { findOpen, openFind, closeFind, next } from './app/search';
import { paletteMode, openPalette, closePalette, PAL_CLOSED, PAL_COMMANDS, PAL_FILES } from './app/commands';
import { check, runProject } from './app/tools';
import { TitleBar } from './components/TitleBar';
import { ProjectPanel, focusPanel } from './components/ProjectPanel';
import { EditorPane, stepEditor, findRef } from './components/Editor';
import { TerminalPanel, stepTerminal } from './components/Terminal';
import { StatusBar } from './components/StatusBar';
import { Palette } from './components/Palette';
import { stepDemo } from './demo';
import * as fs from 'zinc:fs';

function App(): i32 {
  return <View class="flex-col h-full" bg={theme().bg}>
    <TitleBar />
    <View class="grow flex-row">
      <ProjectPanel />
      <View class="grow flex-col">
        <EditorPane />
        <TerminalPanel />
      </View>
    </View>
    <StatusBar />
    <Palette />
  </View>;
}

// ---- keyboard: overlays first, then the app-wide shortcuts (the focused editor handles its own keys before these)
function shortcut(e: ui.KeyEvent): boolean {
  const k = e.key;
  if (k === 'Escape') {
    if (paletteMode() !== PAL_CLOSED) closePalette();
    else if (findOpen()) closeFind();
    else return false;
    return true;
  }
  if (!e.primary) return false;
  const b = active();
  if (k === 'p') openPalette(e.shift ? PAL_COMMANDS : PAL_FILES);
  else if (k === 's' && e.alt) { for (const x of buffers()) if (x.modified()) save(x); }
  else if (k === 's' && b !== null) save(b as Buffer);
  else if (k === 'f') { openFind(); focusLater(findRef.node); }
  else if (k === 'g') next(e.shift ? -1 : 1);
  else if (k === 'b') togglePanel();
  else if (k === 'j') toggleTerminal();
  else if (k === 'r') { showTerminal(true); runProject(); }
  else if (k === '=' || k === '+') zoom(1);
  else if (k === '-') zoom(-1);
  else if (k === '0') setFontIndex(DEFAULT_FONT);
  else if (k === 'w' && b !== null) closeBuffer(b as Buffer);
  else if (k === ']' && e.shift) cycle(1);
  else if (k === '[' && e.shift) cycle(-1);
  else if (k === 'e' && e.shift) focusPanel();
  else return false;
  return true;
}
ui.onKey((e: ui.KeyEvent) => { if (shortcut(e)) e.preventDefault(); });

// diagnostics when a TypeScript file opens and after each save
setHooks((b: Buffer) => check(b), (b: Buffer) => check(b));

/** The project's entry file (zinc.json "entry"), opened at start. */
function entryFile(): string {
  try {
    const cfg = fs.readText(root.path + '/zinc.json'), k = cfg.indexOf('"entry"');
    if (k >= 0) { const a = cfg.indexOf('"', cfg.indexOf(':', k) + 1), z = cfg.indexOf('"', a + 1); if (a > 0 && z > a) return cfg.slice(a + 1, z); }
  } catch (e) { }
  return 'README.md';
}

function tick(dt: number): void {
  stepMotion(dt);
  stepNotice(dt);
  applyFocus();
  stepEditor();
  stepTerminal();
  stepDemo(dt);
}

initProject();
const entry = entryFile();
if (fs.exists(root.path + '/' + entry)) openFile(root.path + '/' + entry, entry.slice(entry.lastIndexOf('/') + 1), false);
render(App, 0x282c34, tick);
