// Sprite Studio: a pixel-art editor in three windows. The canvas (this window) owns the sprite; the tools window drives it over a
// MessageChannel and shows the state it gets back; the live preview window shows the scenes a worker computes from the frames.
// This file mounts the canvas, places and reopens the windows, routes the keys and sends each change on once per frame.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as win from 'zinc:system/window';
import { MessageChannel, MessageEvent } from 'zinc:worker';
import { CanvasPage } from './pages/canvas/CanvasPage';
import { openTools } from './windows/tools';
import { openPreview, sendToPreview } from './windows/preview';
import { saveSprite, loadSprite, savePath } from './services/file';
import { applyToolsCommand } from './commands';
import * as st from './state';
import type { ToolsCommand, CanvasState } from './protocol';
import { CANVAS_W, TOOLS_W, PREVIEW_W, WINDOW_GAP, FALLBACK_SCREEN_W, FALLBACK_TOP, COLOR_BACKGROUND,
  TOOL_PENCIL, TOOL_ERASER, TOOL_FILL, TOOL_PICKER } from './constants';

// ---- the channel to the tools window: the canvas posts its state, the tools post commands
const channel = new MessageChannel<CanvasState, ToolsCommand>();
const toolsPort = channel.port1;
toolsPort.onmessage = (e: MessageEvent<ToolsCommand>) => applyToolsCommand(e.data);
toolsPort.handle((c: ToolsCommand): CanvasState => st.snapshotState());   // 'hello': a window that opens asks for the state

// ---- where the windows go: the canvas in the middle of the screen, the tools on its left, the preview on its right
let canvasX: i32 = 0, canvasY: i32 = FALLBACK_TOP;
function placeCanvas(): void {
  let screenX: i32 = 0, screenW: i32 = FALLBACK_SCREEN_W;
  try {
    const d = win.displays();
    if (d.length > 0) { screenX = d[0].x as i32; screenW = d[0].w as i32; canvasY = (d[0].y as i32) + FALLBACK_TOP; }
  } catch (e) { /* headless, or no display services: the fallback screen */ }
  const total = TOOLS_W + WINDOW_GAP + CANVAS_W + WINDOW_GAP + PREVIEW_W;
  canvasX = screenX + Math.max(0, (screenW - total) / 2) as i32 + TOOLS_W + WINDOW_GAP;
  win.get(0).setPosition(canvasX, canvasY);
}
function showTools(): void { openTools(channel.port2, canvasX - WINDOW_GAP - TOOLS_W, canvasY); }
function showPreview(): void { openPreview(canvasX + CANVAS_W + WINDOW_GAP, canvasY); }

function save(): void {
  const err = saveSprite(st.currentSprite());
  st.setNotice(err === '' ? `Saved ${savePath()}` : err);
  console.log(err === '' ? `saved ${savePath()}` : `save failed: ${err}`);
}
function load(): void {
  const r = loadSprite();
  const s = r.sprite;
  if (s !== null) { st.replaceSprite(s); st.setNotice(`Loaded ${savePath()}`); console.log(`loaded ${s.frames.length} frames`); }
  else st.setNotice(r.error);
}

ui.onKey((e: ui.KeyEvent) => {
  const k = e.key.toLowerCase();
  if (e.primary) {
    if (k === 'z') { if (e.shift) st.redo(); else st.undo(); } else if (k === 'y') st.redo();
    else if (k === 's') save(); else if (k === 'o') load(); else return;
  } else if (k === 'b') st.setTool(TOOL_PENCIL); else if (k === 'e') st.setTool(TOOL_ERASER);
  else if (k === 'g') st.setTool(TOOL_FILL); else if (k === 'i') st.setTool(TOOL_PICKER);
  else if (k === 'arrowleft') st.selectFrame(st.frameIndex() - 1); else if (k === 'arrowright') st.selectFrame(st.frameIndex() + 1);
  else if (k === 'n') st.addFrame(); else if (k === ' ' || k === 'space') st.togglePlaying();
  else if (k === 't') showTools(); else if (k === 'p') showPreview();
  else return;
  e.preventDefault();
});

/** Once a frame at most: the canvas repaints and the other windows hear of the change. */
function sendChanges(dt: number): void {
  if (!st.takeChanged()) return;
  ui.repaint();
  toolsPort.postMessage(st.snapshotState());
  sendToPreview({ fps: st.fps(), playing: st.playing(), frame: st.frameIndex(), sprite: st.currentSprite() });
}

render(() => <CanvasPage save={save} load={load} showTools={showTools} showPreview={showPreview} />, COLOR_BACKGROUND, sendChanges);
placeCanvas();
showTools();
showPreview();
console.log(`windows: ${win.list().map((w: win.AppWindow) => { const b = w.bounds(); return `${w.id}@${b.x},${b.y} ${b.w}x${b.h}`; }).join(' ')}`);
