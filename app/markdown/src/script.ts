// ZINC_READ_SCRIPT (tests): steps separated by ';' that call the same actions as the buttons and gestures, then quit.
//   open <path> | next | prev | toc <n> (the n-th heading of the table of contents) | link <href> (a tap on that link's box)
//   task <n> (a tap on the n-th task box of the page) | font <+1|-1> | back | draw <x0> <y0> <x1> <y1> (a pen stroke) | save
//   notion <token> <page> (Settings: Save) | sync | library | pages (prints the page count and the headings with their pages)
//   pictures (waits for the http(s) pictures, then prints how many the layout shows) | pinch <factor> (two fingers spread around the
//   middle of the screen, through the reading view's ZoomView: the text size nearest to the pinched one)
import * as sys from 'zinc:sys';
import { quit, PenFlag, width, height } from 'zinc:gfx';
import { touchAt } from 'zinc:ui';
import { doc, picturesLoading, openDoc, turn, jump, tapAt, setFont, back, saveInk, saveNotion, syncNotion, scanLibrary, library, say, setScreen, SCREEN_READ } from './state';
import { feedPen } from './pageview';
import { I_IMAGE } from './layout';

export function scripted(): boolean { return sys.env('ZINC_READ_SCRIPT') !== ''; }
function sleep(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }
function tapOn(cond: (href: string, task: i32) => boolean, what: string): void {
  for (const t of doc.lay.hits) {
    if (t.page !== doc.page || !cond(t.href, t.task)) continue;
    tapAt(t.x + t.w / 2, t.y + t.h / 2);
    return;
  }
  say('nothing to tap: ' + what);
}

export async function runScript(): Promise<void> {
  setScreen(SCREEN_READ);
  while (doc.w === 0) await sleep(20);   // the page view's size comes with its first frame
  for (const step of sys.env('ZINC_READ_SCRIPT').split(';')) {
    const w = step.trim().split(' ');
    const verb = w[0], arg = w.length > 1 ? w[1] : '';
    if (verb === 'open') openDoc(arg);
    else if (verb === 'next') turn(1);
    else if (verb === 'prev') turn(-1);
    else if (verb === 'toc') { const h = doc.lay.headings[parseInt(arg) as i32]; console.log('read: toc ' + h.text + ' -> page ' + (h.page + 1).toString()); jump(h.page); }
    else if (verb === 'link') tapOn((href: string, task: i32): boolean => href === arg, 'link ' + arg);
    else if (verb === 'task') {
      let n = parseInt(arg) as i32;
      tapOn((href: string, task: i32): boolean => { if (task < 0) return false; n--; return n < 0; }, 'task ' + arg);
    } else if (verb === 'font') setFont(parseInt(arg) as i32);
    else if (verb === 'back') back();
    else if (verb === 'draw') {
      const x0 = parseFloat(w[1]), y0 = parseFloat(w[2]), x1 = parseFloat(w[3]), y1 = parseFloat(w[4]);
      for (let i: i32 = 0; i <= 20; i++) feedPen(x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20, 0.8, PenFlag.Down);
      feedPen(x1, y1, 0, 0);
    } else if (verb === 'save') saveInk();
    else if (verb === 'notion') saveNotion(arg, w.length > 2 ? w[2] : '');
    else if (verb === 'sync') await syncNotion();
    else if (verb === 'library') { scanLibrary(); console.log('read: library ' + library().join(',')); }
    else if (verb === 'pages') {
      console.log('read: page ' + (doc.page + 1).toString() + ' of ' + doc.lay.pages.length.toString());
      for (const h of doc.lay.headings) console.log('read: heading ' + h.level.toString() + ' ' + h.text + ' p' + (h.page + 1).toString());
    } else if (verb === 'pictures') {
      await picturesLoading;
      let n: i32 = 0;
      for (const p of doc.lay.pages) for (const it of p) if (it.kind === I_IMAGE) n++;
      console.log('read: pictures ' + n.toString());
    } else if (verb === 'pinch') {
      const cx = width() / 2, cy = height() / 2, f = parseFloat(arg), r0 = 100;
      touchAt(1, cx - r0, cy, 0); await sleep(20); touchAt(2, cx + r0, cy, 0);
      for (let i: i32 = 1; i <= 10; i++) { await sleep(20); const r = r0 * (1 + (f - 1) * i / 10); touchAt(1, cx - r, cy, 1); touchAt(2, cx + r, cy, 1); }
      touchAt(2, cx + r0 * f, cy, 2); touchAt(1, cx - r0 * f, cy, 2);
    } else if (verb !== '') console.log('read: unknown script step ' + verb);
    await sleep(30);   // a frame between steps
  }
  setTimeout(() => { quit(); }, 300);   // a few frames for the last state (ZINC_SHOT)
}
