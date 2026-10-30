// The live preview window: its picture comes from the preview worker (preview.worker.ts) as a Scene; the window shows the last one.
import * as win from 'zinc:system/window';
import { Worker, MessageEvent, Envelope, MessagePort, workerPort } from 'zinc:worker';
import type { PreviewInput, PreviewOutput } from '../protocol';
import { PREVIEW_W, PREVIEW_H, COLOR_PREVIEW_BG, COLOR_PREVIEW_TEXT } from '../constants';

let port: MessagePort<PreviewInput, PreviewOutput> | null = null;
let previewWindow: win.AppWindow | null = null;
let lastScene: win.Scene | null = null;
let workerError = '';

/** The worker starts once, with the app; the window can close and open again and shows the latest scene. */
function startWorker(): void {
  try {
    const p = workerPort<PreviewInput, PreviewOutput>(new Worker<Envelope<PreviewInput>, Envelope<PreviewOutput>>(new URL('../preview.worker.ts', import.meta.url)));
    p.onmessage = (e: MessageEvent<PreviewOutput>) => {
      lastScene = e.data.scene;
      const w = previewWindow;
      if (w !== null && w.isOpen()) w.setScene(e.data.scene);
    };
    port = p;
  } catch (e) {
    workerError = `${e}`;
    console.log(`preview: ${workerError}`);
  }
}

/** Why there is no preview, wrapped to the window's width (the scene's text does not wrap). */
function errorScene(): win.Scene {
  const shapes: win.Shape[] = [], words = `No live preview. ${workerError}`.split(' ');
  let line = '', y = 16;
  for (const w of words) {
    if (line.length + w.length + 1 > ERROR_LINE_CHARS && line !== '') {
      shapes.push({ kind: 'text', x: 16, y: y, w: 0, h: 0, r: 1, color: COLOR_PREVIEW_TEXT, text: line });
      line = ''; y += 14;
    }
    line = line === '' ? w : line + ' ' + w;
  }
  shapes.push({ kind: 'text', x: 16, y: y, w: 0, h: 0, r: 1, color: COLOR_PREVIEW_TEXT, text: line });
  return { background: COLOR_PREVIEW_BG, shapes: shapes };
}
const ERROR_LINE_CHARS = 60;

export function previewOpen(): boolean { const w = previewWindow; return w !== null && w.isOpen(); }

/** Opens the window (again, when it was closed) at x,y. */
export function openPreview(x: i32, y: i32): void {
  if (previewOpen()) return;
  if (port === null && workerError === '') startWorker();
  const w = win.open({ title: 'Live preview', width: PREVIEW_W, height: PREVIEW_H });
  w.setPosition(x, y);
  const s = lastScene;
  w.setScene(workerError !== '' ? errorScene() : s !== null ? s : { background: COLOR_PREVIEW_BG, shapes: [] });
  previewWindow = w;
}

/** Gives the worker the sprite and the playback; it answers with scenes. */
export function sendToPreview(input: PreviewInput): void {
  const p = port;
  if (p !== null) p.postMessage(input);
}
