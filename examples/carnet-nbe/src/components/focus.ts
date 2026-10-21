// Moving the caret between blocks. A block made by a key press has no node until the next render, so the focus is asked
// here and given by the frame loop (applyFocus), with the caret where the action wants it.
import * as ui from 'zinc:ui';
import { Block, Page, setFocusedBlock, setFollow, currentPage, commitTitle } from '../state';

let wantedBlock: Block | null = null;
let wantedTitle: Page | null = null;
let wantedCaret: number = 0;
const blockOfNode = new Map<i32, Block>();

/** Puts the caret in a block at the next frame; `caret` -1 is the end. */
export function focusBlock(b: Block, caret: number): void { wantedBlock = b; wantedTitle = null; wantedCaret = caret; }
setFollow(focusBlock);   // a command of Carnet's leaves its selection: the caret goes there
export function focusTitle(p: Page): void { wantedTitle = p; wantedBlock = null; }

/** Called once per frame. */
export function applyFocus(): void {
  if (wantedTitle !== null) {
    const h = (wantedTitle as Page).titleRef.node;
    if (h >= 0) { ui.focusNode(h); ui.select(h, 0, ui.getValue(h).length); wantedTitle = null; }   // typing replaces the name
    return;
  }
  if (wantedBlock === null) return;
  const h = (wantedBlock as Block).ref.node;
  if (h < 0) return;
  const n = ui.getValue(h).length, c = wantedCaret < 0 || wantedCaret > n ? n : wantedCaret;
  ui.focusNode(h);
  ui.select(h, c, c);
  wantedBlock = null;
}

/** The block fields register themselves, so a focus move names its block. */
export function registerField(h: i32, b: Block): void { blockOfNode.set(h, b); }
export function unregisterField(h: i32): void { blockOfNode.delete(h); }
let titled: Page | null = null;   // the note whose title has the caret
export function watchFocus(): void {
  ui.onFocusChange((h: i32) => {
    const b = blockOfNode.get(h);
    setFocusedBlock(b === undefined ? null : b);
    const p = currentPage();
    if (titled !== null && (titled !== p || h !== (titled as Page).titleRef.node)) commitTitle(titled as Page);   // left: the note is renamed
    titled = p !== null && h >= 0 && h === (p as Page).titleRef.node ? p : null;
  });
}
