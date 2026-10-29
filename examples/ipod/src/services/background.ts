// Keeps the music going when the window goes away. Closing the window while a Sonos group plays from the iPod plugged into this computer
// hides it instead: the app stays in the menu bar (an icon whose menu shows the track, Play or Pause, Next, Show iPod and Quit) and goes on
// serving the songs to the speakers. Cmd+Q in that case asks first ("Sonos is playing from this iPod: quitting stops the music": Keep
// playing in background, Quit, Quit and clear the Sonos queue, Cancel) and waits for the transfers not finished; the quit itself is
// services/quit.ts.
import { createEffect } from 'zinc:ui/solid';
import * as window from 'zinc:system/window';
import * as tray from 'zinc:system/tray';
import * as menu from 'zinc:system/menu';
import * as dialog from 'zinc:system/dialog';
import * as ipod from 'zinc:ipod';
import { current, isPlaying, toggle, next, playingLibrary } from './player';
import { output } from './sonos';
import { PodLibrary } from './ipod';
import { pending, runningJob, cancelWaiting, Job } from './transfers';
import { quitNow, isQuitting } from './quit';

const TRAY_ID = 'ipod';
const TRAY_ICON = 'trayTemplate.png';   // in the project (zinc run works from there); a missing file draws a dot

let bar: tray.Tray | null = null;

/** A Sonos group plays the songs of the iPod plugged into this computer (served by this app: it must keep running). */
export function sonosPlaysFromThisPod(): boolean {
  const lib = playingLibrary();
  return output() !== '' && isPlaying() && lib !== null && (lib as PodLibrary).remote === '';
}

function trackLine(): string {
  const t = current();
  if (t === null) return 'Nothing playing';
  const tr = t as ipod.Track;
  return `${tr.title !== '' ? tr.title : 'Untitled'}${tr.artist !== '' ? ' — ' + tr.artist : ''}`;
}
function trayMenu(): menu.Item[] {
  const now = menu.item('tray-track', trackLine());
  now.enabled = false;
  return [now, menu.separator(), menu.item('tray-toggle', isPlaying() ? 'Pause' : 'Play'), menu.item('tray-next', 'Next'), menu.separator(),
    menu.item('tray-show', 'Show iPod'), menu.item('tray-quit', 'Quit iPod')];
}

/** Hides the window and puts the app in the menu bar. */
export async function toBackground(): Promise<void> {
  window.hide();
  if (bar !== null) return;
  const o = new tray.Options(TRAY_ID);
  o.icon = TRAY_ICON; o.tooltip = trackLine(); o.menu = trayMenu(); o.hasMenu = true;
  bar = await tray.create(o);
}
/** Back to the window: the menu bar icon goes. */
function toForeground(): void {
  window.show();
  const b = bar;
  bar = null;
  if (b !== null) (b as tray.Tray).destroy();
}

// what a quit does to a group playing songs this app serves: 'pause' or 'clear' (stopped, our queue taken off), as the confirm said
let release = 'pause';
/** The quit's step for the speaker (services/player.ts release): a group fed by the iPod daemon is left playing. */
export function releaseMode(): string {
  const lib = playingLibrary();
  return lib !== null && (lib as PodLibrary).remote !== '' ? 'leave' : release;
}

/** Waits for the transfers: the one running always ends (stopping it halfway would leave a file without its database entry). */
async function finishTransfers(): Promise<void> {
  while (pending() > 0) await new Promise<void>((r: () => void) => { setTimeout(r, 200); });
}
function plural(n: i32, one: string): string { return `${n} ${one}${n === 1 ? '' : 's'}`; }

/** Cmd+Q, Quit in the menu bar item, the window closed: asks first while Sonos plays from this iPod or transfers are not done. */
export async function askQuit(): Promise<void> {
  if (isQuitting()) return;
  const playing = sonosPlaysFromThisPod(), jobs = pending();
  if (!playing && jobs === 0) { quitNow(); return; }
  const running = runningJob();
  const work = jobs === 0 ? '' : `${plural(jobs, 'transfer')} not finished${running !== null ? ` (${(running as Job).label} under way)` : ''}.`;
  let o = new dialog.MessageOptions(work);
  if (playing) {
    o = new dialog.MessageOptions('Sonos is playing from this iPod: quitting stops the music');
    o.detail = 'The speakers play the songs this app serves from the iPod. In the background the app stays in the menu bar and the music goes on. '
      + 'Quit pauses the speakers; Quit and clear also takes this app\'s songs off their queue.' + (work !== '' ? ` ${work} The transfer under way ends first.` : '');
    o.buttons = ['Keep playing in background', 'Quit', 'Quit and clear the Sonos queue', 'Cancel'];
  } else {
    o.detail = 'The transfer under way ends first: stopping it halfway would leave the iPod with a file its database does not know.';
    o.buttons = ['Finish them, then quit', 'Cancel the others and quit', 'Cancel'];
  }
  o.kind = 'warning';
  const b = await dialog.message(o);
  if (playing) {
    if (b === 0) { toBackground(); return; }
    if (b !== 1 && b !== 2) return;
    release = b === 2 ? 'clear' : 'pause';
  } else {
    if (b !== 0 && b !== 1) return;
    if (b === 1) cancelWaiting();
  }
  await finishTransfers();
  quitNow();
}

/** Wires the window's close, Cmd+Q and the menu bar item. */
export function install(): void {
  window.onCloseRequested(() => {   // the window stays while the quit runs (services/quit.ts); with Sonos playing it only hides
    window.keepOpen();
    if (sonosPlaysFromThisPod()) toBackground(); else askQuit();
  });
  menu.onClick('role:quit', (source: string) => { askQuit(); });
  menu.onClick('tray-toggle', (source: string) => toggle());
  menu.onClick('tray-next', (source: string) => next());
  menu.onClick('tray-show', (source: string) => toForeground());
  menu.onClick('tray-quit', (source: string) => { askQuit(); });
  createEffect(() => {   // the menu follows the track and play or pause
    const line = trackLine(), menuItems = trayMenu();
    const b = bar;
    if (b !== null) { (b as tray.Tray).setMenu(menuItems); (b as tray.Tray).setTooltip(line); }
  });
}
