// Zinc Atelier: the place to write Zinc sketches and run them, written in Zinc. One window: the run control and the
// sketch's files as tabs, the editor, and a console that is one line of status until the program speaks.
//   zinc run next/app/atelier                 the sketch opened last time, else the start view (examples, a new sketch)
//   zinc run next/app/atelier -- <folder>     that sketch
// It drives the zinc binary it runs on ($ZINC_BIN): zinc run, zinc dev, zinc check, zinc plugins, and zinc lsp beside the editor.
// Tests: ZINC_ATELIER_HOME (the sketchbook), ZINC_ATELIER_SYNC=1 (a frame waits for the child), ZINC_ATELIER_PACE=ms (a frame
// lasts that long), ZINC_ATELIER_ECHO=1 (the console on stdout), ZINC_ATELIER_THEME=dark, ZINC_ATELIER_SCRIPT=file (a session:
// `<frame> <command id>`, `<frame> example:<folder>` or `<frame> quit` per line, run at that frame as the menu item would be;
// for the devices panel `<frame> pair:<name or address> <code>` fills its form and pairs, `<frame> device:<name>` is a press on
// that device, `<frame> clipboard` prints what the clipboard holds, `<frame> permission:<id>` allows or removes a permission of the project, and `<frame> wait:<text>` holds the frame until the console, the status line or the panel says it, 10 s at most),
// ZINC_ATELIER_BROWSE=ms (how long the list of devices waits for the network; 0: the paired ones only).
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
import { quit, clipboardText } from 'zinc:gfx';
import { stepMotion } from './app/motion';
import { theme, bg, setTheme, DARK } from './app/theme';
import { Buffer, setHooks, applyFocus, stepNotice, openSketch, lastSketch, openFile } from './app/workspace';
import { findOpen, closeFind } from './app/search';
import { COMMANDS, Command, command, commandOf, paletteMode, closePalette, PAL_CLOSED, startOpen, setStartOpen, promptLabel, answer } from './app/commands';
import { check, stepTools, setJump, stopAll, consoleText, status } from './app/tools';
import { devicesOpen, closeDevices, setWho, setCode, pair, choose, panelText, refresh } from './app/devices';
import { stepCursors, stepMenuKeys, jumpTo, setMenuKeys, menuKey, noteKey } from './app/cursors';
import { stepLsp, setGo, stopLsp } from './app/lsp';
import { Header, EngineMenu, engineOpen, setEngineOpen } from './components/Header';
import { EditorCard, stepEditor } from './components/Editor';
import { ConsoleCard, stepConsole } from './components/Console';
import { StartView, EXAMPLES, Example, openExample } from './components/Start';
import { Palette } from './components/Palette';
import { DevicesPanel } from './components/Devices';
import { ProjectCard } from './components/Project';
import { projectOpen, setProjectOpen, projectText, togglePermission } from './app/project';

function App(): i32 {
  return <View class={`flex-col h-full ${bg(theme().chrome)}`}>
    <Header />
    <View class="grow flex-col px-2.5 pb-2.5 gap-2">
      <EditorCard />
      <ConsoleCard />
      <StartView />
    </View>
    <EngineMenu />
    <DevicesPanel />
    <ProjectCard />
    <Palette />
  </View>;
}

// ---- the desktop menu, from the command table. On macOS it is the menu bar and it takes the shortcuts of its items;
// elsewhere the same shortcuts are handled below and the palette lists everything.
/** True when a real menu bar takes the shortcuts (not the recording simulator of headless and deterministic runs, which says it has every feature). */
const menuBar: boolean = menu.native && sys.platform() === 'macos' && sys.env('ZINC_HEADLESS') === '' && sys.env('ZINC_DETERMINISTIC') === '';
function installMenu(): void {
  const bar: menu.Item[] = [menu.role('appMenu')];
  for (const name of ['File', 'Edit', 'Sketch', 'Tools', 'Help']) {
    const items: menu.Item[] = [];
    for (const c of COMMANDS) {
      if (c.menu !== name) continue;
      if (c.sep) items.push(menu.separator());
      items.push(menu.item(c.id, c.name, c.keys));
      if (c.id === 'examples') items.push(menu.submenu('Open Example', EXAMPLES.map((e: Example) => menu.item('example:' + e.dir, e.title))));
      if (c.id === 'redo') {
        items.push(menu.separator());
        items.push(menu.item('cut', 'Cut', 'CmdOrCtrl+X')); items.push(menu.item('copy', 'Copy', 'CmdOrCtrl+C'));
        items.push(menu.item('paste', 'Paste', 'CmdOrCtrl+V')); items.push(menu.item('select-all', 'Select All', 'CmdOrCtrl+A'));
      }
    }
    bar.push(menu.submenu(name, items));
  }
  bar.push(menu.role('windowMenu'));
  menu.setApp(bar);
  for (const c of COMMANDS) menu.onClick(c.id, (source: string) => c.run());
  for (const e of EXAMPLES) menu.onClick('example:' + e.dir, (source: string) => { openExample(e.dir); });
  // the field handles these keys itself: the item's click is replayed as the key when it was made with the mouse
  menu.onClick('cut', (source: string) => menuKey('x', ui.META));
  menu.onClick('copy', (source: string) => menuKey('c', ui.META));
  menu.onClick('paste', (source: string) => menuKey('v', ui.META));
  menu.onClick('select-all', (source: string) => menuKey('a', ui.META));
  setMenuKeys(menuBar);
}

// ---- keyboard: what the focused field did not take. Overlays first, then the shortcuts of the command table.
ui.onKey((e: ui.KeyEvent) => {
  noteKey(e);
  if (e.key === 'Escape') {
    if (engineOpen()) setEngineOpen(false);
    else if (paletteMode() !== PAL_CLOSED) closePalette();
    else if (devicesOpen()) closeDevices();
    else if (projectOpen()) setProjectOpen(false);
    else if (promptLabel() !== '') answer(false);
    else if (findOpen()) closeFind();
    else if (startOpen()) setStartOpen(false);
    else return;
    e.preventDefault();
    return;
  }
  if (menuBar) return;
  const c = commandOf(e);
  if (c === null) return;
  (c as Command).run();
  e.preventDefault();
});

// ---- the way out: the running sketch, its inspector and the language server end with Atelier, whether it is Quit of the app
// menu (⌘Q) or the window's close button (the system plugin then closes the window and ends the app by itself)
function leave(): void { stopAll(); stopLsp(); }
menu.onClick('role:quit', (source: string) => { leave(); system.quit(); });
system.on('window', (a: string[]) => { if (a.length > 0 && a[0] === 'close-requested') leave(); });

setHooks((b: Buffer) => {}, (b: Buffer) => check());
setJump(jumpTo);
setGo((path: string, line: i32, col: i32) => { const b = openFile(path); if (b !== null) jumpTo(b as Buffer, line, col); });
installMenu();
if (sys.env('ZINC_ATELIER_THEME') === 'dark') setTheme(DARK);

const args = sys.args();
let opened = false;
if (args.length > 0 && args[0] !== '') opened = openSketch(args[0].startsWith('/') ? args[0] : sys.launchDir() + '/' + args[0]);
if (!opened) { const last = lastSketch(); if (last !== '') opened = openSketch(last); }
if (opened) check(); else setStartOpen(true);
refresh('', '0');   // the paired devices, for the menu of the run control: read from a file, no network

// ---- scripted sessions
const scriptAt: i32[] = [], scriptDo: string[] = [];
if (sys.env('ZINC_ATELIER_SCRIPT') !== '') {
  for (const l of fs.readText(sys.env('ZINC_ATELIER_SCRIPT')).split('\n')) {
    const sp = l.indexOf(' ');
    if (sp > 0) { scriptAt.push(parseInt(l.slice(0, sp))); scriptDo.push(l.slice(sp + 1).trim()); }
  }
}
let frame: i32 = 0;
function says(text: string): boolean { return consoleText().indexOf(text) >= 0 || status().indexOf(text) >= 0 || panelText().indexOf(text) >= 0 || projectText().indexOf(text) >= 0; }
function stepScript(): void {
  frame++;
  for (let i = 0; i < scriptAt.length; i++) {
    if (scriptAt[i] !== frame) continue;
    const id = scriptDo[i];
    if (id === 'quit') { leave(); quit(); }
    else if (id.startsWith('example:')) openExample(id.slice(8));
    else if (id.startsWith('pair:')) { const w = id.slice(5).split(' '); setWho(w[0]); setCode(w.length > 1 ? w[1] : ''); pair(); }
    else if (id.startsWith('device:')) choose(id.slice(7));
    else if (id.startsWith('permission:')) togglePermission(id.slice(11));   // the project card: allows it, or removes it
    else if (id === 'clipboard') console.log('[clipboard] ' + clipboardText().split('\n').join(' | '));   // what a copy took, for the tests
    else if (id.startsWith('wait:')) {
      let n = 0;
      while (!says(id.slice(5)) && n++ < 1000) sys.poll(10);
      if (n > 1000) console.log('atelier script: nothing said ' + id.slice(5));
    }
    else if (!command(id)) console.log('atelier script: no command ' + id);
  }
}

render(App, 0xf3f1ec, (dt: number) => {
  if (scriptAt.length > 0) stepScript();
  stepMotion(dt);
  stepNotice(dt);
  applyFocus();
  stepCursors();
  stepLsp(dt);
  stepEditor();
  stepTools();
  stepConsole();
  stepMenuKeys();
});
