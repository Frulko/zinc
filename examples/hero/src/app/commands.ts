// Everything the command palette (and the keyboard shortcuts) can do.
import { TABS, go, openDetailByIndex, replayIntro } from './router';
import { dark, setDark } from './prefs';
import { clearDone } from './tasks';
import { shake, resetBalls } from './physics';
import { toast, openDialog, Dialog } from './overlays';
import { ARTWORKS } from './art';

export class Command {
  group: string; label: string; keys: string; run: () => void;
  constructor(group: string, label: string, keys: string, run: () => void) { this.group = group; this.label = label; this.keys = keys; this.run = run; }
}

export function showShortcuts(): void {
  openDialog(new Dialog('Keyboard shortcuts',
    '1–5 switch screens · [ and ] previous / next · ⌘K or / command palette · D dark mode · ? this help · ' +
    'Esc closes the palette, a dialog or the artwork · ← → browse artworks · N new task (Tasks) · S shake (Playground)',
    'Got it', false, () => {}));
}

function goTo(i: i32): () => void { return () => go(i); }

export const COMMANDS: Command[] = [
  new Command('Go to', TABS[0].label, '1', goTo(0)),
  new Command('Go to', TABS[1].label, '2', goTo(1)),
  new Command('Go to', TABS[2].label, '3', goTo(2)),
  new Command('Go to', TABS[3].label, '4', goTo(3)),
  new Command('Go to', TABS[4].label, '5', goTo(4)),
  new Command('Theme', 'Toggle dark mode', 'D', () => setDark(!dark())),
  new Command('Gallery', `Open "${ARTWORKS[0].title}"`, '', () => openDetailByIndex(0)),
  new Command('Gallery', 'Open a random artwork', '', () => openDetailByIndex(Math.floor(Math.random() * ARTWORKS.length))),
  new Command('Tasks', 'Clear completed tasks', '', () => { const n = clearDone(); toast(n > 0 ? `Cleared ${n} task${n > 1 ? 's' : ''}` : 'Nothing to clear'); }),
  new Command('Playground', 'Shake the balls', 'S', () => { go(2); shake(); }),
  new Command('Playground', 'Reset the balls', '', () => { go(2); resetBalls(); }),
  new Command('Help', 'Keyboard shortcuts', '?', () => showShortcuts()),
  new Command('Help', 'Replay the intro', '', () => replayIntro()),
];
