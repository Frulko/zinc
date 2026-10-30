// The tools and palette window, a zinc:ui tree of its own. It knows only what the canvas tells it over its port (CanvasState) and changes
// nothing itself: each button posts a ToolsCommand, and the canvas answers with its new state, so both windows always agree.
import { createSignal, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as win from 'zinc:system/window';
import { MessagePort, MessageEvent } from 'zinc:worker';
import type { ToolsCommand, CanvasState } from '../protocol';
import { Chip } from '../components/Chip';
import { drawChecker, drawPixels } from '../components/pixels';
import { hexColor } from '../sprite';
import { starterSprite } from '../starter';
import { TOOLS, TOOL_LABELS, BRUSH_SIZES, TOOLS_W, TOOLS_H, COLOR_PANEL, SPRITE_SIZE } from '../constants';

const THUMB: i32 = 44;

let port: MessagePort<ToolsCommand, CanvasState> | null = null;
let toolsWindow: win.AppWindow | null = null;
let toolsRoot: i32 = -1;   // built once: reopening the window shows the same tree
const [state, setState] = createSignal<CanvasState>({ tool: '', colorIndex: 1, brush: 1, frame: 0, onion: false, fps: 0, playing: false,
  canUndo: false, canRedo: false, sprite: starterSprite() });
const [hexDraft, setHexDraft] = createSignal<string>('');

function send(kind: string, text: string, value: i32): void { const p = port; if (p !== null) p.postMessage({ kind: kind, text: text, value: value }); }
function received(s: CanvasState): void {
  setState(s);
  setHexDraft(hexColor(s.sprite.palette[s.colorIndex]));
  ui.repaint();   // the thumbnails are lazy canvases: they draw again with the new frames
}

function indices(from: i32, to: i32): i32[] { const out: i32[] = []; for (let i = from; i < to; i++) out.push(i); return out; }
const PALETTE_ROWS: i32[][] = [indices(1, 6), indices(6, 11), indices(11, 16)];

function Section(p: { title: string }): i32 {
  return <Text className="text-[11px] font-semibold text-[#8b93a3] mt-2">{p.title}</Text>;
}

function Swatch(p: { index: i32 }): i32 {
  return <Button onClick={() => send('color', '', p.index)} aria-label={`Colour ${p.index}`}
    className={`h-[30] grow basis-0 rounded-[5] border-2 ${state().colorIndex === p.index ? 'border-white' : 'border-[#262a33]'}`}
    style={{ backgroundColor: state().sprite.palette[p.index] }} />;
}

function Thumb(p: { index: i32 }): i32 {
  return <Button onClick={() => send('frame', '', p.index)} aria-label={`Frame ${p.index + 1}`}
    className={`w-[${THUMB}] h-[${THUMB}] rounded-[5] border-2 overflow-hidden ${state().frame === p.index ? 'border-[#4b6cff]' : 'border-[#3a3f4a]'}`}>
    <Canvas className={`w-[${THUMB - 4}] h-[${THUMB - 4}]`} style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const s = state().sprite;
      if (p.index >= s.frames.length) return;
      const scale = w / SPRITE_SIZE;
      drawChecker(x, y, w, w / 4);
      drawPixels(s, s.frames[p.index], x, y, scale, 255, 0);
    }} />
  </Button>;
}

function frameIndices(): i32[] { return indices(0, state().sprite.frames.length); }

function ToolsPanel(): i32 {
  return <View className="flex-col gap-2 p-3 w-full h-full">
    <Text className="text-[15px] font-semibold text-white">Tools</Text>
    <Text className="text-[11px] text-[#8b93a3]" numberOfLines={1}>
      {`${state().tool} · colour ${state().colorIndex} · frame ${state().frame + 1}/${state().sprite.frames.length}`}
    </Text>
    <View className="flex-row gap-2">
      <Chip label={TOOL_LABELS[0]} active={() => state().tool === TOOLS[0]} onPress={() => send('tool', TOOLS[0], 0)} />
      <Chip label={TOOL_LABELS[1]} active={() => state().tool === TOOLS[1]} onPress={() => send('tool', TOOLS[1], 0)} />
    </View>
    <View className="flex-row gap-2">
      <Chip label={TOOL_LABELS[2]} active={() => state().tool === TOOLS[2]} onPress={() => send('tool', TOOLS[2], 0)} />
      <Chip label={TOOL_LABELS[3]} active={() => state().tool === TOOLS[3]} onPress={() => send('tool', TOOLS[3], 0)} />
    </View>
    <Section title="Brush" />
    <View className="flex-row gap-2">
      <For each={BRUSH_SIZES}>{(b: i32, i: i32) => <Chip label={`${b} px`} active={() => state().brush === b} onPress={() => send('brush', '', b)} />}</For>
    </View>
    <Section title="Palette" />
    <For each={PALETTE_ROWS}>{(row: i32[], r: i32) => <View className="flex-row gap-1">
      <For each={row}>{(index: i32, i: i32) => <Swatch index={index} />}</For>
    </View>}</For>
    <View className="flex-row w-full gap-2 items-center">
      <Text className="text-[11px] text-[#8b93a3]">Edit colour</Text>
      <Input value={hexDraft()} onChange={(v: string) => send('edit-color', v.trim(), state().colorIndex)} aria-label="Selected colour as #rrggbb"
        className="h-[28] grow min-w-0 px-2 text-[12px] rounded-[5] bg-[#1d2027] border border-[#3a3f4a] text-[#e6e9ef]" />
    </View>
    <Section title="Frames" />
    <View className="flex-row flex-wrap gap-1">
      <For each={frameIndices()}>{(i: i32, k: i32) => <Thumb index={i} />}</For>
    </View>
    <View className="flex-row gap-2">
      <Chip label="Add" active={() => false} onPress={() => send('add-frame', '', 0)} />
      <Chip label="Duplicate" active={() => false} onPress={() => send('duplicate-frame', '', 0)} />
      <Chip label="Delete" active={() => false} onPress={() => send('delete-frame', '', 0)} />
    </View>
    <View className="flex-row gap-2">
      <Chip label="Onion skin" active={() => state().onion} onPress={() => send('onion', '', 0)} />
    </View>
    <Section title="Preview" />
    <View className="flex-row gap-2">
      <Chip label={state().playing ? 'Pause' : 'Play'} active={() => state().playing} onPress={() => send('play', '', 0)} />
      <Chip label={`${state().fps} fps`} active={() => false} onPress={() => send('fps', '', 0)} />
    </View>
    <View className="flex-row gap-2">
      <Chip label="Undo" active={() => false} onPress={() => send('undo', '', 0)} />
      <Chip label="Redo" active={() => false} onPress={() => send('redo', '', 0)} />
    </View>
  </View>;
}

export function toolsOpen(): boolean { const w = toolsWindow; return w !== null && w.isOpen(); }

/** Opens the tools window at x,y on its end of the channel; it first asks the canvas for its state. */
export function openTools(p: MessagePort<ToolsCommand, CanvasState>, x: i32, y: i32): void {
  if (toolsOpen()) return;
  if (port === null) {
    port = p;
    p.onmessage = (e: MessageEvent<CanvasState>) => received(e.data);
    toolsRoot = ui.createNode(ui.VIEW);
    ui.insert(toolsRoot, ToolsPanel(), -1);
  }
  const w = win.get(ui.mountWindow('Tools', TOOLS_W, TOOLS_H, toolsRoot, COLOR_PANEL));
  w.setPosition(x, y);
  toolsWindow = w;
  p.request({ kind: 'hello', text: '', value: 0 }).then((s: CanvasState) => received(s));
}
