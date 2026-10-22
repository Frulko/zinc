// Zinc Atelier: the place to write Zinc sketches and run them, written in Zinc. One window: the run control and the
// sketch's files as tabs, the editor, and a console that is one line of status until the program speaks.
//   zinc run app/atelier                 the sketch opened last time, else the start view (examples, a new sketch)
//   zinc run app/atelier -- <folder>     that sketch
// It drives the zinc binary it runs on ($ZINC_BIN): zinc run, zinc dev, zinc check, zinc plugins, and zinc lsp beside the editor.
// Tests: ZINC_ATELIER_HOME (the sketchbook), ZINC_ATELIER_SYNC=1 (a frame waits for the child), ZINC_ATELIER_PACE=ms (a frame
// lasts that long), ZINC_ATELIER_ECHO=1 (the console on stdout), ZINC_ATELIER_THEME=dark, ZINC_ATELIER_SCRIPT=file (a session:
// `<frame> <command id>`, `<frame> example:<folder>` or `<frame> quit` per line, run at that frame as the menu item would be;
// for the devices panel `<frame> pair:<name or address> <code>` fills its form and pairs, `<frame> device:<name>` is a press on
// that device, `<frame> clipboard` prints what the clipboard holds, `<frame> lang:<code>` switches the language, `<frame> template:<name> <folder>`
// makes a project from a template, `<frame> new:<style>` a new sketch in that style (drawing, scene, canvas, interface), `<frame> explain` clicks the first error code of the console, `<frame> tour:next|back|skip|fix` press
// that button of the tour's card, `<frame> tour:lang:<code>` a language of its first card and `<frame> tour:step` prints the step and its box;
// ZINC_ATELIER_TOUR=1 lets a test's sketchbook have the first-launch tour, `<frame> permission:<id>` allows or removes a permission of the project, and `<frame> wait:<text>` holds the frame until the console, the status line or the panel says it, 10 s at most),
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
import { Buffer, setHooks, applyFocus, stepNotice, openSketch, lastSketch, openFile, newSketch } from './app/workspace';
import { findOpen, closeFind } from './app/search';
import { COMMANDS, MENUS, Command, command, commandOf, paletteMode, closePalette, PAL_CLOSED, startOpen, setStartOpen, promptLabel, answer } from './app/commands';
import { check, stepTools, setJump, stopAll, consoleText, status, newProject } from './app/tools';
import { devicesOpen, closeDevices, setWho, setCode, pair, choose, panelText, refresh } from './app/devices';
import { stepCursors, stepMenuKeys, jumpTo, setMenuKeys, menuKey, noteKey } from './app/cursors';
import { stepLsp, setGo, stopLsp } from './app/lsp';
import { Header, EngineMenu, engineOpen, setEngineOpen } from './components/Header';
import { EditorCard, stepEditor } from './components/Editor';
import { ConsoleCard, stepConsole, explainFirst } from './components/Console';
import { StartView, EXAMPLES, Example, openExample } from './components/Start';
import { Palette } from './components/Palette';
import { Tour, stepTour, tourLine, fixCode } from './components/Tour';
import { tourOn, tourWanted, startTour, nextStep, backStep, endTour } from './app/tour';
import { DevicesPanel } from './components/Devices';
import { ProjectCard } from './components/Project';
import { projectOpen, setProjectOpen, projectText, togglePermission } from './app/project';
import { t, LANGUAGES, languageName, lang, setLanguage, setOnLanguage } from './app/text';

function App(): i32 {
  return <View className={`flex-col h-full ${bg(theme().chrome)}`}>
    <Header />
    <View className="grow flex-col px-2.5 pb-2.5 gap-2">
      <EditorCard />
      <ConsoleCard />
      <StartView />
    </View>
    <EngineMenu />
    <DevicesPanel />
    <ProjectCard />
    <Palette />
    <Tour />
  </View>;
}

// ---- the desktop menu, from the command table. On macOS it is the menu bar and it takes the shortcuts of its items;
// elsewhere the same shortcuts are handled below and the palette lists everything.
/** True when a real menu bar takes the shortcuts (not the recording simulator of headless and deterministic runs, which says it has every feature). */
const menuBar: boolean = menu.native && sys.platform() === 'macos' && sys.env('ZINC_HEADLESS') === '' && sys.env('ZINC_DETERMINISTIC') === '';
/** The menu bar in the language of the interface: built again when it changes (Tools > Language). */
/** A standard item of the system (Quit, Minimize...) named in the language of the interface, not the system's English. */
function roleItem(role: string, key: string): menu.Item { const i = menu.role(role); i.label = t('atelier.menu.' + key, ['app', 'Zinc Atelier']); return i; }
function buildMenu(): void {
  const bar: menu.Item[] = [menu.submenu('Zinc Atelier', [roleItem('about', 'about'), menu.separator(), roleItem('services', 'services'), menu.separator(),
    roleItem('hide', 'hide'), roleItem('hideOthers', 'hide_others'), roleItem('unhide', 'show_all'), menu.separator(), roleItem('quit', 'quit')])];
  for (const name of MENUS) {
    const items: menu.Item[] = [];
    for (const c of COMMANDS) {
      if (c.menu !== name) continue;
      if (c.sep) items.push(menu.separator());
      items.push(menu.item(c.id, c.name(), c.keys));
      if (c.id === 'examples') items.push(menu.submenu(t('atelier.menu.open_example'), EXAMPLES.map((e: Example) => menu.item('example:' + e.dir, e.name()))));
      if (c.id === 'redo') {
        items.push(menu.separator());
        const edits: string[] = ['cut', 'X', 'copy', 'C', 'paste', 'V', 'select-all', 'A'];
        for (let k = 0; k < edits.length; k += 2) items.push(menu.item(edits[k], t('atelier.cmd.' + edits[k]), 'CmdOrCtrl+' + edits[k + 1]));
      }
      if (c.id === 'theme') {
        const langs = LANGUAGES.map((code: string) => { const it = menu.item('lang:' + code, languageName(code)); it.type = 'radio'; it.checked = code === lang(); return it; });
        items.push(menu.submenu(t('atelier.menu.language'), langs));
      }
    }
    bar.push(menu.submenu(t('atelier.menu.' + name), items));
  }
  bar.push(menu.submenu(t('atelier.menu.window'), [roleItem('minimize', 'minimize'), roleItem('zoom', 'zoom'), menu.separator(), roleItem('front', 'front')]));
  menu.setApp(bar);
}
function installMenu(): void {
  buildMenu();
  setOnLanguage(buildMenu);
  for (const c of COMMANDS) menu.onClick(c.id, (source: string) => c.run());
  for (const e of EXAMPLES) menu.onClick('example:' + e.dir, (source: string) => { openExample(e.dir); });
  for (const code of LANGUAGES) menu.onClick('lang:' + code, (source: string) => setLanguage(code));
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
    if (tourOn()) endTour(true);
    else if (engineOpen()) setEngineOpen(false);
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
if (!opened && tourWanted()) startTour(true);   // a first launch: the language, then the tour
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
    else if (id.startsWith('lang:')) setLanguage(id.slice(5));   // Tools > Language
    else if (id.startsWith('new:')) { setStartOpen(false); newSketch(id.slice(4)); }   // a card of New sketch
    else if (id.startsWith('template:')) { const w = id.slice(9).split(' '); newProject(w[0], w.length > 1 ? w[1] : w[0]); }   // a template of the palette, named
    else if (id === 'explain') explainFirst();   // a click on the first error code of the console
    else if (id === 'tour:next') nextStep();
    else if (id === 'tour:back') backStep();
    else if (id === 'tour:skip') endTour(true);
    else if (id === 'tour:fix') fixCode();
    else if (id === 'tour:step') console.log(tourLine());
    else if (id.startsWith('tour:lang:')) setLanguage(id.slice(10));   // a language of the tour's first card
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
  stepTour();
});
