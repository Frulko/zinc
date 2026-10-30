// The live preview window: its picture comes from the preview worker (preview.worker.ts) as a Scene; the window shows the last one.
import * as win from 'zinc:system/window';
import { Worker, MessageEvent, Envelope, MessagePort, workerPort } from 'zinc:worker';
import type { PreviewInput, PreviewOutput } from '../protocol';
import { PREVIEW_W, PREVIEW_H, COLOR_PREVIEW_BG } from '../constants';

let port: MessagePort<PreviewInput, PreviewOutput> | null = null;
let previewWindow: win.AppWindow | null = null;
let lastScene: win.Scene | null = null;

/** The worker starts once, with the app; the window can close and open again and shows the latest scene. */
function startWorker(): void {
  const p = workerPort<PreviewInput, PreviewOutput>(new Worker<Envelope<PreviewInput>, Envelope<PreviewOutput>>(new URL('../preview.worker.ts', import.meta.url)));
  p.onmessage = (e: MessageEvent<PreviewOutput>) => {
    lastScene = e.data.scene;
    const w = previewWindow;
    if (w !== null && w.isOpen()) w.setScene(e.data.scene);
  };
  port = p;
}

export function previewOpen(): boolean { const w = previewWindow; return w !== null && w.isOpen(); }

/** Opens the window (again, when it was closed) at x,y. */
export function openPreview(x: i32, y: i32): void {
  if (previewOpen()) return;
  if (port === null) startWorker();
  const w = win.open({ title: 'Live preview', width: PREVIEW_W, height: PREVIEW_H });
  w.setPosition(x, y);
  const s = lastScene;
  w.setScene(s !== null ? s : { background: COLOR_PREVIEW_BG, shapes: [] });
  previewWindow = w;
}

/** Gives the worker the sprite and the playback; it answers with scenes. */
export function sendToPreview(input: PreviewInput): void {
  const p = port;
  if (p !== null) p.postMessage(input);
}
