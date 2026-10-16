// The palette: one line per thing that can be added to the table (presets.ts), each with a small drawing of it made by the top
// view's own code. A click chooses an entry; the next clicks on the table place it. The plunger lane is added at once: where it goes
// follows from the size of the board. The advanced mode shows the key of each entry: typed after "+" in the box that goes to things
// (Cmd+G), it chooses the entry from the keyboard.
import { createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Preset, LANE, miniature } from './presets';
import { ENTRIES, tool, pickTool, addLane, advanced } from './state';
import { drawPlain } from './topview';
import { Outline } from './shapes';
import { Heading } from './widgets';
import * as L from './strings';
import { t, listName, uiLang } from './strings';

// the drawing of each entry, made the first time it is shown
const drawn: Outline[][] = [];
const made: boolean[] = [];
for (const e of ENTRIES) { drawn.push([]); made.push(false); }
function drawingOf(i: i32): Outline[] {
  if (!made[i]) { made[i] = true; try { drawn[i] = miniature(ENTRIES[i]); } catch (e) { drawn[i] = []; } }   // a kind that cannot be shown yet still has its line
  return drawn[i];
}
/** The name of an entry in the interface language. */
export function entryName(p: Preset): string { return p.en === '' ? listName(p.list, true) : uiLang() === 'fr' ? p.fr : p.en; }

function Mini(p: { at: i32 }): i32 {
  return <Canvas className="shrink-0" style={{ width: 30, height: 22, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const all = drawingOf(p.at);
    if (all.length === 0) return;
    let x0 = all[0].x0, x1 = all[0].x1, y0 = all[0].y0, y1 = all[0].y1;
    for (const o of all) { x0 = Math.min(x0, o.x0); x1 = Math.max(x1, o.x1); y0 = Math.min(y0, o.y0); y1 = Math.max(y1, o.y1); }
    const z = Math.min(3.4, Math.min((w - 2) / Math.max(0.5, x1 - x0), (h - 2) / Math.max(0.5, y1 - y0)));
    for (const o of all) drawPlain(o, x + w / 2 - (x0 + x1) / 2 * z, y + h / 2 - (y0 + y1) / 2 * z, z);
  }} />;
}
function Entry(p: { at: i32 }): i32 {
  const e = ENTRIES[p.at], on = (): boolean => tool() === e;
  return <Button className={`flex-row items-center justify-start gap-2 h-7 px-2 rounded cursor-pointer ${on() ? 'bg-amber-400' : 'bg-zinc-900 hover:bg-zinc-800'}`}
    onClick={() => { if (e === LANE) addLane(); else pickTool(on() ? null : e); }}>
    <Mini at={p.at} />
    <Text className={`grow truncate text-xs ${on() ? 'font-bold text-zinc-900' : 'text-zinc-200'}`} style={{ maxWidth: 96 }}>{advanced() ? `+${e.key}` : entryName(e)}</Text>
  </Button>;
}
export function Palette(): i32 {
  createEffect(() => { tool(); ui.repaint(); });
  const places: i32[] = [];
  for (let i = 0; i < ENTRIES.length; i++) places.push(i);
  return <View className="w-[150] shrink-0 flex-col bg-zinc-900 border-r border-zinc-800">
    <View className="flex-row items-center h-9 px-3 shrink-0 border-b border-zinc-800"><Heading label={t(L.ADD)} /></View>
    <ScrollView className="grow basis-0 min-h-0 flex-col gap-[1] p-1">
      {places.map((i: i32, k: i32) => <Entry at={i} />)}
    </ScrollView>
  </View>;
}
