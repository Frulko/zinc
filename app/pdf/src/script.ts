// ZINC_PDF_SCRIPT (tests): steps separated by ';' that call the same actions as the buttons and gestures, then quit.
//   open <file> | next | prev | page <n> | zoom <z> | draw <x0> <y0> <x1> <y1> (a pen stroke in view pixels) | erase <x> <y> (the Marker's
//   eraser end) | write <x0> <y0> <x1> <y1> (the same, one sample a frame: logs the most draw commands of a frame) | undo | save | export | library
import * as sys from 'zinc:sys';
import { quit, PenFlag } from 'zinc:gfx';
import { view, scale, openDoc, turn, goTo, zoomTo, saveInk, undoInk, exportPdf, showLibrary } from './state';
import { feedPen, penCommands } from './pageview';

export function scripted(): boolean { return sys.env('ZINC_PDF_SCRIPT') !== ''; }
function sleep(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }

export async function runScript(): Promise<void> {
  for (const step of sys.env('ZINC_PDF_SCRIPT').split(';')) {
    const w = step.trim().split(' ');
    const verb = w[0], arg = w.length > 1 ? w[1] : '';
    if (verb === 'open') {
      openDoc(arg);
      while (view.w === 0) await sleep(20);   // the page view's size comes with its first frame
      console.log('pdf: view ' + view.w.toString() + 'x' + view.h.toString() + ' at ' + scale().toFixed(4) + ' px/pt, origin ' + view.ox.toFixed(2) + ' ' + view.oy.toFixed(2));
      continue;
    }
    if (verb === 'next') turn(1);
    else if (verb === 'prev') turn(-1);
    else if (verb === 'page') goTo(parseInt(arg) - 1);
    else if (verb === 'zoom') zoomTo(parseFloat(arg), view.w / 2, view.h / 2);
    else if (verb === 'draw') {
      const x0 = parseFloat(w[1]), y0 = parseFloat(w[2]), x1 = parseFloat(w[3]), y1 = parseFloat(w[4]);
      for (let i: i32 = 0; i <= 20; i++) feedPen(x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20, 0.8, PenFlag.Down);
      feedPen(x1, y1, 0, 0);
    } else if (verb === 'write') {
      const x0 = parseFloat(w[1]), y0 = parseFloat(w[2]), x1 = parseFloat(w[3]), y1 = parseFloat(w[4]);
      for (let i: i32 = 0; i <= 20; i++) { feedPen(x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20, 0.8, PenFlag.Down); await sleep(20); }
      feedPen(x1, y1, 0, 0);
      console.log('pdf: ' + penCommands().toString() + ' draw commands at most a frame while writing');
    } else if (verb === 'erase') {
      feedPen(parseFloat(w[1]), parseFloat(w[2]), 0.5, PenFlag.Down | PenFlag.Eraser);
      feedPen(parseFloat(w[1]), parseFloat(w[2]), 0, 0);
    }
    else if (verb === 'undo') undoInk();
    else if (verb === 'save') saveInk();
    else if (verb === 'export') exportPdf();
    else if (verb === 'library') showLibrary();
    else if (verb !== '') console.log('pdf: unknown script step ' + verb);
    await sleep(30);   // a frame between steps, as a hand would leave
  }
  setTimeout(() => { quit(); }, 300);   // a few frames for the last state (ZINC_SHOT)
}
