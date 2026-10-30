// The canvas's state and its actions: the sprite, the tool, the colour, the frame, the history. The canvas window and the commands that
// come from the tools window both call these; nothing here draws or talks to another window (main.tsx sends the state on).
import { createSignal, batch } from 'zinc:ui/solid';
import { Sprite, Frame, blankFrame, copyFrame, copySprite, strokeLine, floodFill, pixelAt } from './sprite';
import { starterSprite } from './starter';
import { TOOL_PENCIL, TOOL_ERASER, TOOL_FILL, TOOL_PICKER, TRANSPARENT, MAX_FRAMES, UNDO_LIMIT, FPS_CHOICES } from './constants';
import type { CanvasState } from './protocol';

let sprite: Sprite = starterSprite();
export function currentSprite(): Sprite { return sprite; }
/** The colour drawn with now (follows palette edits). */
export function selectedColor(): i32 { version(); return sprite.palette[colorIndex()]; }

/** Bumped by every change to the pixels or the palette: the canvas repaints and the other windows hear of it. */
export const [version, setVersion] = createSignal<i32>(0);
export const [tool, setToolSignal] = createSignal<string>(TOOL_PENCIL);
export const [colorIndex, setColorIndexSignal] = createSignal<i32>(13);
export const [brush, setBrushSignal] = createSignal<i32>(1);
export const [frameIndex, setFrameIndexSignal] = createSignal<i32>(0);
export const [frameCount, setFrameCount] = createSignal<i32>(sprite.frames.length);
export const [onion, setOnionSignal] = createSignal<boolean>(false);
export const [fps, setFpsSignal] = createSignal<i32>(8);
export const [playing, setPlayingSignal] = createSignal<boolean>(true);
export const [notice, setNotice] = createSignal<string>('');

// ---- what changed since the windows were last told (main.tsx sends it once per frame)
let stateChanged = true;
export function takeChanged(): boolean { const c = stateChanged; stateChanged = false; return c; }
function changed(): void { stateChanged = true; }
function edited(): void { setVersion(version() + 1); changed(); }

// ---- history: a snapshot of the sprite before each edit
class Snapshot { sprite: Sprite; frame: i32; constructor(s: Sprite, f: i32) { this.sprite = s; this.frame = f; } }
const undoStack: Snapshot[] = [], redoStack: Snapshot[] = [];
export const [historySize, setHistorySize] = createSignal<i32>(0);   // undo and redo depths, so the buttons follow
function historyMoved(): void { setHistorySize(undoStack.length * 1000 + redoStack.length); }
export function canUndo(): boolean { historySize(); return undoStack.length > 0; }
export function canRedo(): boolean { historySize(); return redoStack.length > 0; }

function pushUndo(before: Sprite): void {
  undoStack.push(new Snapshot(before, frameIndex()));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  historyMoved();
}
function remember(): void { pushUndo(copySprite(sprite)); }
function restore(s: Snapshot): void {
  sprite = s.sprite;
  batch(() => { setFrameCount(sprite.frames.length); setFrameIndexSignal(Math.min(s.frame, sprite.frames.length - 1) as i32); });
  edited();
}
export function undo(): void {
  const s = undoStack.pop();
  if (s === undefined) return;
  redoStack.push(new Snapshot(sprite, frameIndex()));
  restore(s);
  historyMoved();
  setNotice('Undo');
}
export function redo(): void {
  const s = redoStack.pop();
  if (s === undefined) return;
  undoStack.push(new Snapshot(sprite, frameIndex()));
  restore(s);
  historyMoved();
  setNotice('Redo');
}

// ---- tools and choices
export function setTool(t: string): void { if (t !== tool()) { setToolSignal(t); changed(); } }
export function setColorIndex(i: i32): void {
  if (i < 1 || i >= sprite.palette.length || i === colorIndex()) return;
  setColorIndexSignal(i);
  if (tool() === TOOL_ERASER || tool() === TOOL_PICKER) setToolSignal(TOOL_PENCIL);   // choosing a colour means drawing with it
  changed();
}
export function setBrush(b: i32): void { if (b >= 1 && b !== brush()) { setBrushSignal(b); changed(); } }
export function toggleOnion(): void { setOnionSignal(!onion()); changed(); }
export function setFps(f: i32): void { if (f > 0 && f !== fps()) { setFpsSignal(f); changed(); } }
export function nextFps(): void { const i = FPS_CHOICES.indexOf(fps()); setFps(FPS_CHOICES[(i + 1) % FPS_CHOICES.length]); }
export function togglePlaying(): void { setPlayingSignal(!playing()); changed(); }
/** A palette colour changed: every pixel of that index changes with it. */
export function editColor(i: i32, color: i32): void {
  if (i < 1 || i >= sprite.palette.length || color < 0 || sprite.palette[i] === color) return;
  remember();
  sprite.palette[i] = color;
  edited();
}

// ---- frames
export function currentFrame(): Frame { return sprite.frames[frameIndex()]; }
export function selectFrame(i: i32): void {
  if (i < 0 || i >= sprite.frames.length || i === frameIndex()) return;
  setFrameIndexSignal(i);
  edited();   // the canvas shows another frame: it repaints
}
function insertFrame(f: Frame): void {
  if (sprite.frames.length >= MAX_FRAMES) { setNotice(`At most ${MAX_FRAMES} frames`); return; }
  remember();
  const at = frameIndex() + 1;
  sprite.frames.splice(at, 0, f);
  batch(() => { setFrameCount(sprite.frames.length); setFrameIndexSignal(at); });
  edited();
}
export function addFrame(): void { insertFrame(blankFrame()); }
export function duplicateFrame(): void { insertFrame(copyFrame(currentFrame())); }
export function deleteFrame(): void {
  if (sprite.frames.length <= 1) { setNotice('A sprite keeps one frame'); return; }
  remember();
  sprite.frames.splice(frameIndex(), 1);
  batch(() => { setFrameCount(sprite.frames.length); setFrameIndexSignal(Math.min(frameIndex(), sprite.frames.length - 1) as i32); });
  edited();
}

// ---- drawing: a stroke is one undo step, however many pixels it crosses
let strokeX: i32 = -1, strokeY: i32 = -1, stroking = false, strokeSaved = false;
function strokeIndex(): i32 { return tool() === TOOL_ERASER ? TRANSPARENT : colorIndex(); }
export function pressPixel(x: i32, y: i32): void {
  const t = tool();
  if (t === TOOL_PICKER) {
    const i = pixelAt(currentFrame(), x, y);
    if (i !== TRANSPARENT) setColorIndex(i); else setTool(TOOL_ERASER);
    return;
  }
  if (t === TOOL_FILL) {
    const before = copySprite(sprite);
    if (floodFill(currentFrame(), x, y, colorIndex())) { pushUndo(before); edited(); }
    return;
  }
  stroking = true; strokeSaved = false; strokeX = x; strokeY = y;
  dragPixel(x, y);
}
export function dragPixel(x: i32, y: i32): void {
  if (!stroking) return;
  const before = strokeSaved ? null : copySprite(sprite);
  if (strokeLine(currentFrame(), strokeX, strokeY, x, y, brush(), strokeIndex())) {
    if (before !== null) { pushUndo(before); strokeSaved = true; }
    edited();
  }
  strokeX = x; strokeY = y;
}
export function releasePixel(): void { stroking = false; }

// ---- the document
export function replaceSprite(s: Sprite): void {
  remember();
  sprite = s;
  batch(() => { setFrameCount(s.frames.length); setFrameIndexSignal(0); });
  edited();
}

export function snapshotState(): CanvasState {
  return { tool: tool(), colorIndex: colorIndex(), brush: brush(), frame: frameIndex(), onion: onion(), fps: fps(), playing: playing(),
    canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, sprite: sprite };
}
