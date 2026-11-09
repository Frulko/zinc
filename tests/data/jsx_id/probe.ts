import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';
export function attr(h: i32, key: string): string { const n = ui.inspectNode(h); if (n === null) throw new Error('missing node'); const i = n.attrK.indexOf(key); return i < 0 ? '' : n.attrV[i]; }
const firstHandles: i32[] = [];
export function cellId(step: i32): string | undefined { return step === 2 ? undefined : step === 3 ? '' : 'cell-' + step; }
export function listId(step: i32): string | null { return step === 2 ? null : step === 3 ? '' : 'list-' + step; }
export function verify(grid: i32, cell: i32, sibling: i32, list: i32, fixedList: i32, step: i32): void {
  equal(attr(cell, 'id'), cellId(step) ?? '', 'reactive host id');
  equal(attr(grid, 'aria-activedescendant'), attr(cell, 'id'), 'descendant IDREF');
  equal(attr(sibling, 'id'), 'sibling-fixed', 'literal sibling id');
  equal(attr(list, 'id'), listId(step) ?? '', 'reactive VirtualList id');
  equal(attr(fixedList, 'id'), 'fixed-list', 'literal VirtualList id');
  equal(attr(grid, 'id'), 'grid-fixed', 'literal host id');
  const handles = [grid, cell, sibling, list, fixedList];
  for (let i: i32 = 0; i < handles.length; i++) { if (step === 0) firstHandles.push(handles[i]); else equal(handles[i], firstHandles[i], 'id changes keep refs'); }
  const n = ui.inspectNode(cell);
  if (n === null) throw new Error('missing cell');
  equal(n.id, cell, 'generic id does not overwrite node handle');
  if (step === 3) console.log('jsx-id: pass');
}
