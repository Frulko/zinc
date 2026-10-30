// The messages between the windows. The tools window and the canvas talk over a MessageChannel (both on the main thread); the canvas
// and the preview worker over the worker's port (records copied to its thread).
import type { Scene } from 'zinc:system/window';
import type { Sprite } from './sprite';

/** What the tools window asks of the canvas. `kind`: 'hello' (a request: the state now), 'tool' (text), 'color' (value: the palette
 *  index), 'edit-color' (value: the index, text: '#rrggbb'), 'brush', 'frame', 'fps' (value), 'add-frame', 'duplicate-frame',
 *  'delete-frame', 'onion', 'play', 'undo', 'redo'. */
export interface ToolsCommand { kind: string; text: string; value: i32 }

/** What the canvas tells the tools window after a change, and answers to 'hello'. */
export interface CanvasState {
  tool: string; colorIndex: i32; brush: i32; frame: i32; onion: boolean; fps: i32; playing: boolean;
  canUndo: boolean; canRedo: boolean; sprite: Sprite;
}

/** What the preview worker gets whenever the sprite or the playback changes: it plays `sprite` at `fps`, or shows `frame` when paused. */
export interface PreviewInput { fps: i32; playing: boolean; frame: i32; sprite: Sprite }
/** Each scene the worker computes for the preview window. */
export interface PreviewOutput { frame: i32; shapes: i32; scene: Scene }
