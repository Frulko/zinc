// hero: a complete app in the Solid model. An animated intro, then a shell with five screens and transitions
// between them, a gallery whose artworks grow into a detail page, physics, animated lists, live charts,
// theming, toasts, a modal and a command palette. One frame callback drives everything (tick below).
//
//   zinc run examples/hero            ZINC_DEMO=<step> scripts a tour (screenshots, see README.md)
import { render, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { stepMotion } from './app/motion';
import { stepClock } from './app/clock';
import { tab, go, next, introShown, introOut, leaveIntro, detail, closeDetail, entrances, GALLERY, TASKS, PLAYGROUND, openDetailByIndex } from './app/router';
import { dark, setDark } from './app/prefs';
import { stepToasts, toast, overlayOpen, dialog, closeDialog, paletteOpen, openPalette, closePalette } from './app/overlays';
import { stepPhysics, shake } from './app/physics';
import { seedTasks, addTask } from './app/tasks';
import { showShortcuts } from './app/commands';
import { Shell, Screen, syncStage } from './components/Shell';
import { Overlays, preparePalette } from './components/Overlays';
import { Home, series } from './screens/Home';
import { Gallery } from './screens/Gallery';
import { Detail, browseDetail } from './screens/Detail';
import { Playground } from './screens/Playground';
import { Tasks, taskInput } from './screens/Tasks';
import { Settings } from './screens/Settings';
import { Intro } from './screens/Intro';

function App(): i32 {
  return <View class="h-full">
    <View class="absolute inset-0" style={{ translateY: (1 - introOut.get()) * 24 }}>
      <Shell>
        <Screen index={0}><Home /></Screen>
        <Screen index={1}><Gallery /></Screen>
        <Screen index={2}><Playground /></Screen>
        <Screen index={3}><Tasks /></Screen>
        <Screen index={4}><Settings /></Screen>
        <Detail />
      </Shell>
    </View>
    <Intro />
    <Overlays />
  </View>;
}

// ---- keyboard: overlays first, then the intro, then app-wide shortcuts (typing in a field never triggers them)
ui.onKey((e: ui.KeyEvent) => {
  if (e.key === 'Escape') {
    if (paletteOpen()) closePalette();
    else if (dialog() !== null) closeDialog();
    else if (detail() >= 0) closeDetail();
    else return;   // unhandled: zinc:ui blurs the focus or leaves fullscreen / quits
    e.preventDefault();
    return;
  }
  if (overlayOpen()) return;
  if (introShown()) { if (e.key === 'Enter' || e.key === ' ') { leaveIntro(); e.preventDefault(); } return; }
  if ((e.primary && e.key === 'k') || (e.key === '/' && !e.shift)) { openPalette(); e.preventDefault(); return; }
  if (e.primary || e.alt) return;
  const k = e.key;
  if (k.length === 1 && k >= '1' && k <= '5') go(k.charCodeAt(0) - 49);
  else if (k === '[') next(-1);
  else if (k === ']') next(1);
  else if (k === 'd') setDark(!dark());
  else if (k === '/' && e.shift) showShortcuts();
  else if (k === 'n' && tab() === TASKS) ui.focusNode(taskInput.node);
  else if (k === 's' && tab() === PLAYGROUND) shake();
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && detail() >= 0) browseDetail(k === 'ArrowLeft' ? -1 : 1);
  else return;
  e.preventDefault();
});

// the palette's search field takes the focus when it opens
createEffect(() => { if (paletteOpen()) preparePalette(); });

// ---- optional scripted tour (ZINC_DEMO=home|gallery|detail|playground|tasks|settings|palette|dialog|dark|bench)
const demo = env('ZINC_DEMO');
let frame: i32 = 0;
// ZINC_DEMO=bench: every screen, the detail page, dark mode, the palette and a dialog, 60 frames each, then quits
// (zinc bench times the frames, budget in zinc.json)
function bench(): void {
  if (frame === 2) leaveIntro();
  if (frame < 30 || (frame - 30) % 60 !== 0) return;
  const i: i32 = (frame - 30) / 60;
  if (i === 0) go(GALLERY);
  else if (i === 1) openDetailByIndex(1);
  else if (i === 2) { closeDetail(); go(PLAYGROUND); }
  else if (i === 3) go(TASKS);
  else if (i === 4) go(4);
  else if (i === 5) { setDark(true); go(0); }
  else if (i === 6) openPalette();
  else if (i === 7) { closePalette(); showShortcuts(); }
  else if (i === 8) { closeDialog(); setDark(false); }
  else quit();
}
function script(): void {
  frame++;
  if (demo === 'bench') { bench(); return; }
  if (demo === '' || frame !== 2) return;
  leaveIntro();
  if (demo === 'gallery') go(GALLERY);
  else if (demo === 'detail') openDetailByIndex(1);
  else if (demo === 'playground') go(PLAYGROUND);
  else if (demo === 'tasks') { go(TASKS); addTask('Try the command palette (⌘K)', 'Docs'); }
  else if (demo === 'settings') go(4);
  else if (demo === 'palette') openPalette();
  else if (demo === 'dialog') showShortcuts();
  else if (demo === 'dark') { setDark(true); toast('Dark mode', 'Every kit component follows the theme.', 'success'); }
}

function tick(dt: number): void {
  stepClock(dt);
  syncStage();
  stepMotion(dt);
  stepToasts(dt);
  stepPhysics(dt);
  series.step(dt);
  script();
}

seedTasks();
entrances[0].restart();
render(App, 0xfafafa, tick);
