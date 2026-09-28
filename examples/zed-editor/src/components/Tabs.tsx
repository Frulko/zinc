// Tab bar: one tab per open buffer. A preview tab has an italic title; a modified buffer shows a dot that turns into
// the close button under the pointer; middle-click closes; double-click keeps a preview. The bar scrolls
// horizontally (wheel or trackpad) when the tabs do not fit, and keeps the active tab in view.
import { createSignal, createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { active, activate, buffers, Buffer, closeBuffer } from '../app/workspace';
import { drawFileIcon, I_CLOSE } from './icons';
import { Glyph } from './Controls';

export const tabsRef = createNodeRef();
const tabNodes = new Map<string, i32>();   // path -> tab node, to scroll the active tab into view

function Tab(props: { b: Buffer }): i32 {
  const b = props.b;
  const [hover, setHover] = createSignal<boolean>(false);
  const isActive = (): boolean => active() === b;
  // what the slot right of the title shows: 0 nothing, 1 the close button, 2 the modified dot
  const slot = (): i32 => hover() ? 1 : b.modified() ? 2 : isActive() ? 1 : 0;
  const tab = <View class={`flex-row items-center h-full pl-3 pr-1.5 gap-1.5 border-r cursor-pointer ${bd(theme().borderSoft)} ${isActive() ? bg(theme().bg) : `border-b ${bg(theme().surface)}`}`}
    onPointerDown={(e: ui.PointerEvent) => {
      if (e.button === 1) closeBuffer(b);
      else if (e.button === 0) { if (e.clicks >= 2) b.setPreview(false); activate(b); }
    }}
    onPointerEnter={(e: ui.PointerEvent) => setHover(true)} onPointerLeave={(e: ui.PointerEvent) => setHover(false)}>
    <Canvas style={{ width: 14, height: 14, lazy: 1 }}
      onDraw={(x: i32, y: i32, w: i32, h: i32) => drawFileIcon(b.name, false, false, x, y, w, theme())} />
    <Text class={`text-[13px] ${b.preview() ? 'font-[Inter-Italic]' : ''} ${fg(isActive() ? theme().text : theme().muted)}`}>{b.name}</Text>
    <View class={`w-[18] h-[18] rounded items-center justify-center hover:${bg(theme().hover)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0 || e.button === 1) closeBuffer(b); }}>
      {slot() === 1 && <Glyph kind={I_CLOSE} size={14} color={() => theme().muted} />}
      {slot() === 2 && <View class={`w-[7] h-[7] rounded-full ${bg(theme().modified)}`} />}
    </View>
  </View>;
  tabNodes.set(b.path, tab);
  return tab;
}

/** The tab node of an open file (-1 if none): scripted scenes press it. */
export function tabNode(path: string): i32 { return tabNodes.has(path) ? tabNodes.get(path) as i32 : -1; }

/** Scrolls the bar so the active tab is fully visible (called by the frame loop when the active buffer changes). */
export function revealActiveTab(): void {
  const b = active(), bar = tabsRef.node;
  if (b === null || bar < 0) return;
  const path = (b as Buffer).path;
  if (!tabNodes.has(path)) return;
  const box = ui.screenBox(bar), tb = ui.screenBox(tabNodes.get(path) as i32), left = ui.scrollLeft(bar);
  const x = tb[0] - box[0] + left;
  if (x < left) ui.scrollTo(bar, x, 0);
  else if (x + tb[2] > left + box[2]) ui.scrollTo(bar, x + tb[2] - box[2], 0);
}

export function Tabs(): i32 {
  return <View class={`flex-row h-[34] ${bg(theme().surface)}`}>
    <View ref={tabsRef} class="flex-row h-full overflow-x-auto"
      onWheel={(e: ui.PointerEvent) => {
        // vertical wheels scroll the bar sideways; trackpads send fractional steps (1/10 px on macOS)
        const frac = e.wheel !== Math.round(e.wheel) || e.wheelX !== Math.round(e.wheelX);
        const d = (e.wheelX - e.wheel) * (frac ? 10 : 40);
        ui.scrollTo(tabsRef.node, ui.scrollLeft(tabsRef.node) + d, 0);
      }}>
      <For each={buffers()}>{(b: Buffer, i: i32) => <Tab b={b} />}</For>
    </View>
    <View class={`grow border-b ${bd(theme().borderSoft)}`} />
  </View>;
}
