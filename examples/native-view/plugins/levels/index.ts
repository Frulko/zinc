// zinc:levels, an example of a plugin's own native view (ZN-1075, docs/plugins/appkit.md "Plugin views"): <LevelIndicator> is AppKit's NSLevelIndicator
// under the AppKit host ("ui": {"render": "native"} on macOS with zinc:appkit imported), declared in native/levels.spec.ts and mounted by the host
// through the glue `zinc native-gen --views` writes. Anywhere else the same node draws a row of cells.
import * as ui from 'zinc:ui';
import { nativeControl } from 'zinc:ui/kit';
import { createEffect } from 'zinc:ui/solid';
import Levels from './native/levels.spec';

/** Whether the plugin's views are registered for a native host (false: they are drawn). */
export function registered(): boolean { return Levels.registered(); }

export interface LevelIndicatorProps {
  value: () => number;                  // the level, from 0 to max
  max?: number;                         // the number of cells (5)
  style?: string;                       // 'discrete' (cells, the default), 'continuous' (a bar), 'rating' (stars)
  editable?: boolean;                   // the person sets the level by clicking it
  onChange?: (value: number) => void;   // the level the person set (a controlled value: the program sets it back through `value`)
  className?: string;
}

/** `<LevelIndicator value={level} max={5} editable onChange={setLevel} />`: the native view's kind is the spec's interface, its props are attributes. */
export function LevelIndicator(p: LevelIndicatorProps): i32 {
  const max = p.max ?? 5;
  const h = ui.createNode(ui.VIEW);
  ui.setClass(h, `flex-row items-center gap-[2px] h-[16px] ${p.className ?? ''}`);
  const cells: i32[] = [];
  for (let i = 0; i < max; i++) {   // the drawn fallback: a cell per level, clickable when editable
    const cell = ui.createNode(ui.VIEW);
    ui.insert(h, cell, -1);
    cells.push(cell);
    const level = i + 1;
    if (p.editable === true) ui.listen(cell, () => { if (p.onChange !== undefined) p.onChange(level); });
  }
  createEffect(() => {
    const v = p.value();
    for (let i = 0; i < max; i++) ui.setClass(cells[i], `w-[14px] h-[14px] rounded-[3px] ${i < v ? 'bg-[#34c759]' : 'bg-[#d8d8d8]'}`);
  });
  if (!Levels.registered()) return h;   // no native view here (or the module's first call: it registers them as it starts)
  const attrs = (): string[] => ['value', `${p.value()}`, 'max', `${max}`, 'style', p.style ?? 'discrete', 'editable', p.editable === true ? 'true' : 'false'];
  return nativeControl(h, 'LevelIndicator', attrs, (event: string) => {   // the view's events: their name, then their arguments, joined by U+001F
    const parts = event.split('\u001f');
    if (parts[0] === 'onChange' && p.onChange !== undefined) p.onChange(parseFloat(parts[1]));
  });
}
