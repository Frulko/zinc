// ZINC_WEB_SCRIPT (tests): steps separated by ';' that call the same actions as the buttons and gestures, then quit.
//   relay <url> <token> | open <url> | next | prev | zoom <z> | link <href suffix> (a tap on its middle) | back
//   draw <x0> <y0> <x1> <y1> (a pen stroke in view pixels) | save | export | bookmark | refresh
//   tool <name> (a pen of zinc:ink's TOOLS) | smaller | larger (page size) | full | normal (full screen on, off)
//   tab <url> (a new tab) | switch <i> | close <i> | inbox (what the relay received)
//   dash <url> (dashboard mode) | ticks <n> (waits until the dashboard's timer made n renders) | widget (draws the widget) | undash
import * as sys from 'zinc:sys';
import { quit, PenFlag } from 'zinc:gfx';
import { ink, view, busy, setScreen, SCREEN_PAGE, openUrl, back, turn, zoomTo, tapAt, newTab, switchTab, closeTab, checkInbox, pageSize, setFullScreen, saveInk, exportPng, addBookmark, saveRelay, refresh } from './state';
import { feedPen } from './pageview';
import { Doc } from './relay';
import { dash, startDash, stopDash, setWidgetPreview } from './dashboard';

export function scripted(): boolean { return sys.env('ZINC_WEB_SCRIPT') !== ''; }
function sleep(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }

export async function runScript(): Promise<void> {
  for (const step of sys.env('ZINC_WEB_SCRIPT').split(';')) {
    const w = step.trim().split(' ');
    const verb = w[0], arg = w.length > 1 ? w[1] : '';
    if (verb === 'relay') { saveRelay(arg, w.length > 2 ? w[2] : ''); setScreen(SCREEN_PAGE); continue; }
    if (verb === 'dash') { startDash(arg); continue; }
    if (verb === 'ticks') { const n = parseInt(arg); while (dash.count < n || dash.busy) await sleep(20); continue; }
    if (verb === 'widget') { setWidgetPreview(true); await sleep(300); continue; }
    if (verb === 'undash') { stopDash(); continue; }
    while (view.w === 0) await sleep(20);   // the page view's size comes with its first frame
    if (verb === 'open') await openUrl(arg);
    else if (verb === 'next') await turn(1);
    else if (verb === 'prev') await turn(-1);
    else if (verb === 'zoom') await zoomTo(parseFloat(arg), view.w / 2, view.h / 2);
    else if (verb === 'back') await back();
    else if (verb === 'tab') await newTab(arg);
    else if (verb === 'switch') await switchTab(parseInt(arg));
    else if (verb === 'close') await closeTab(parseInt(arg));
    else if (verb === 'tool') ink.tool = arg;
    else if (verb === 'inbox') await checkInbox();
    else if (verb === 'smaller' || verb === 'larger') { pageSize(verb === 'smaller' ? -1 : 1); while (busy()) await sleep(20); }
    else if (verb === 'full' || verb === 'normal') { setFullScreen(verb === 'full'); await sleep(200); }
    else if (verb === 'link') {
      const d = view.doc;
      let done = false;
      if (d !== null) for (const l of (d as Doc).links) {
        if (done || !l.href.endsWith(arg)) continue;
        done = true;
        console.log('web: tap on ' + l.href);
        await tapAt((l.x + l.w / 2 - view.ox) * view.zoom, (l.y + l.h / 2 - view.oy) * view.zoom);
      }
      if (!done) console.log('web: no link ending with ' + arg);
    } else if (verb === 'draw') {
      const x0 = parseFloat(w[1]), y0 = parseFloat(w[2]), x1 = parseFloat(w[3]), y1 = parseFloat(w[4]);
      for (let i: i32 = 0; i <= 20; i++) feedPen(x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20, 0.8, PenFlag.Down);
      feedPen(x1, y1, 0, 0);
    }
    else if (verb === 'save') saveInk();
    else if (verb === 'export') await exportPng();
    else if (verb === 'bookmark') addBookmark();
    else if (verb === 'refresh') refresh();
    else if (verb !== '') console.log('web: unknown script step ' + verb);
  }
  setTimeout(() => { quit(); }, 300);   // a few frames for the last state (ZINC_SHOT)
}
