/** @jsxHelpers zinc:ui/kit/host */
import { Body, values, changes, cleanups, mounts, fields, renders, list, memos, effects, effectCleanups } from './library';
import { state } from './model';
import { NuxtParent, nuxtValue, nuxtChange } from './nuxt';
import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';
let toggle: (value: boolean) => void = (value: boolean) => {};
let order: (value: string[]) => void = (value: string[]) => {};
let refresh: (value: i32) => void = (value: i32) => {};
let virtual: (value: boolean) => void = (value: boolean) => {};
let edits: i32 = 0;
export function App(): i32 {
  const [shown, show] = state(true), [items, setItems] = state(['A', 'B']), [revision, revise] = state<i32>(0), [rows, setRows] = state(true);
  toggle = show; order = setItems; refresh = revise; virtual = setRows;
  return <View className="grow"><Text>{revision()}</Text><NuxtParent /><Body shown={shown} order={items} virtual={rows} edited={() => { edits++; revise(edits); }} /></View>;
}
function get(id: string): i32 { const value = values.get(id); if (value === undefined) throw new Error('missing value ' + id); return value(); }
function set(id: string, value: i32): void { const change = changes.get(id); if (change === undefined) throw new Error('missing setter ' + id); change(value); }
function field(id: string): i32 { const ref = fields.get(id); if (ref === undefined || ref.node < 0) throw new Error('missing field ' + id); return ref.node; }
let frame: i32 = 0, input: i32 = -1, serial: i32 = 0;
let stale: (value: i32) => void = (value: i32) => {};
export function advance(dt: number): void {
  frame++;
  if (frame === 2) { set('first', 11); set('second', 22); set('A', 31); set('B', 32); nuxtChange(8); }
  if (frame === 3) { equal(get('second'), 22); equal(nuxtValue(), 8, 'canonical Nuxt nested child'); toggle(false); order(['B', 'A']); }
  if (frame === 4) { equal(get('second'), 22, 'conditional first sibling never steals second'); equal(memos.get('second')!(), 44, 'neutral memo follows state'); equal(effects.get('second') ?? 0, 2, 'deps avoid effect rerun on parent update'); equal(effectCleanups.get('second') ?? 0, 1, 'changed deps clean once'); equal(get('A'), 31, 'key A reordered'); equal(get('B'), 32, 'key B reordered'); equal(cleanups.get('first') ?? 0, 1); equal(cleanups.get('second') ?? 0, 0); toggle(true); }
  if (frame === 5) { equal(get('first'), 0, 'remount starts fresh'); equal(mounts.get('first') ?? 0, 2); input = field('row-0'); serial = ui.nodeSerial(input); ui.focusNode(input); ui.sendKey('a', 8); ui.insertText('7'); }
  if (frame === 6) { equal(get('row-0'), 7, 'row hooks own their edit'); equal(edits, 1); equal(field('row-0'), input, 'parent edit retains field'); equal(ui.nodeSerial(input), serial); equal(ui.focused(), input, 'parent edit retains focus'); equal(ui.getValue(input), '7'); stale = changes.get('row-0')!; ui.scrollTo(list.node, 0, 2400); }
  if (frame === 7) { equal(cleanups.get('row-0') ?? 0, 1, 'scroll unmounts row once'); stale(99); ui.scrollTo(list.node, 0, 0); }
  if (frame === 8) { equal(get('row-0'), 0, 'returned row is fresh'); equal(mounts.get('row-0') ?? 0, 2); virtual(false); }
  if (frame === 9) { equal(cleanups.get('row-0') ?? 0, 2, 'parent removal unmounts visible rows'); console.log('neutral ownership: pass'); }
}
