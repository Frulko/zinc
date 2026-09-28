// Forms and a node canvas (zinc:ui/solid): text fields, a code editor, draggable cards on a pannable / zoomable view.
//   zinc run examples/ui/forms
// Canvas: drag a card to move it, drag the background to pan, wheel / pinch to zoom around the pointer,
// double click the background to add a node, right click a card to duplicate it, Delete removes the selected one.
// Cmd/Ctrl+S "saves". ZINC_DEMO=1 scripts a few edits (screenshots).
import { createSignal, createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stroke } from 'zinc:gfx';
import { env } from 'zinc:sys';

class GNode {
  id: i32;
  name: () => string; setName: (v: string) => void;
  x: () => number; setX: (v: number) => void;
  y: () => number; setY: (v: number) => void;
  constructor(id: i32, name: string, x: number, y: number) {
    this.id = id;
    const [n, sn] = createSignal<string>(name); this.name = n; this.setName = sn;
    const [gx, sx] = createSignal<number>(x); this.x = gx; this.setX = sx;
    const [gy, sy] = createSignal<number>(y); this.y = gy; this.setY = sy;
  }
}
let nextId: i32 = 4;
const [nodes, setNodes] = createSignal<GNode[]>([new GNode(1, 'Say hello', 30, 40), new GNode(2, 'Wait 2 s', 230, 130), new GNode(3, 'Wave arm', 70, 220)]);
function add(n: GNode): void { const list = nodes().slice(); list.push(n); setNodes(list); setSelected(n); }
const [selected, setSelected] = createSignal<GNode | null>(nodes()[0]);
const [zoom, setZoom] = createSignal<number>(1);
const [panX, setPanX] = createSignal<number>(0);
const [panY, setPanY] = createSignal<number>(0);
const [status, setStatus] = createSignal<string>('Ready');
const [pin, setPin] = createSignal<string>('');
const [notes, setNotes] = createSignal<string>('Behaviour for the welcome scene. The robot greets the visitor, waits, then waves.');
const [script, setScript] = createSignal<string>(`// onStart runs when the box is triggered
export function onStart(robot: Robot): void {
  const name = robot.memory.get('visitor') ?? 'friend';
  robot.say(\`Hello \${name}!\`);
  for (let i = 0; i < 3; i++) robot.wave(0.5);
}`);
const CARD_W = 150, CARD_H = 58;

// ---- canvas interactions: world coordinates are the local coordinates of the world view
const worldRef = createNodeRef(), nameRef = createNodeRef(), scriptRef = createNodeRef(), canvasRef = createNodeRef();
let dragged: GNode | null = null, grabX: number = 0, grabY: number = 0;
let panning = false, panFromX: number = 0, panFromY: number = 0;
function toWorld(gx: number, gy: number): number[] { return ui.toLocal(worldRef.node, gx, gy); }
function cardDown(n: GNode, e: ui.PointerEvent): void {
  setSelected(n);
  if (e.button !== 0) return;
  const p = toWorld(e.gx, e.gy);
  dragged = n; grabX = p[0] - n.x(); grabY = p[1] - n.y();
}
function cardMove(e: ui.PointerEvent): void {
  const d = dragged;
  if (d === null) return;
  const p = toWorld(e.gx, e.gy);
  d.setX(Math.round(p[0] - grabX)); d.setY(Math.round(p[1] - grabY));
}
function duplicate(n: GNode): void {
  const c = new GNode(nextId++, n.name() + ' copy', n.x() + 24, n.y() + 24);
  add(c);
  setStatus(`Duplicated "${n.name()}"`);
}
function remove(n: GNode): void {
  setNodes(nodes().filter((x: GNode) => x !== n));
  setSelected(null);
  setStatus(`Deleted "${n.name()}"`);
}
function zoomAt(e: ui.PointerEvent): void {
  const z = zoom(), z2 = Math.max(0.5, Math.min(2, z * (e.pinch !== 1 ? e.pinch : e.wheel > 0 ? 1.1 : 1 / 1.1)));
  // keep the world point under the pointer in place
  const wx = (e.x - panX()) / z, wy = (e.y - panY()) / z;
  setZoom(z2); setPanX(e.x - wx * z2); setPanY(e.y - wy * z2);
}
/** Links between consecutive nodes, drawn under the cards. */
function drawLinks(x: i32, y: i32, w: i32, h: i32): void {
  const list = nodes(), z = zoom();
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i], b = list[i + 1];
    const x0 = x + panX() + (a.x() + CARD_W) * z, y0 = y + panY() + (a.y() + CARD_H / 2) * z;
    const x1 = x + panX() + b.x() * z, y1 = y + panY() + (b.y() + CARD_H / 2) * z;
    const pts: number[] = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16, u = 1 - t, dx = Math.max(40 * z, Math.abs(x1 - x0) / 2);
      // cubic bezier with horizontal tangents
      pts.push(u * u * u * x0 + 3 * u * u * t * (x0 + dx) + 3 * u * t * t * (x1 - dx) + t * t * t * x1);
      pts.push(u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1);
    }
    stroke(pts, 2 * z, 0x38bdf8, 200, false);
  }
}
ui.onKey((e: ui.KeyEvent) => {
  if (e.primary && e.key === 's') { setStatus('Saved (Cmd/Ctrl+S)'); e.preventDefault(); return; }
  const s = selected();
  if ((e.key === 'Delete' || e.key === 'Backspace') && s !== null) remove(s as GNode);
});

interface FieldProps { label: string; children: () => i32 }
function Field(props: FieldProps): i32 {
  return <view class="flex-col gap-1">
    <text class="text-xs text-slate-400">{props.label}</text>
    {props.children()}
  </view>;
}
function Card(n: GNode): i32 {
  return <view class={`absolute rounded-lg border shadow-lg cursor-grab ${selected() === n ? 'bg-slate-700 border-sky-400' : 'bg-slate-800 border-slate-600 hover:border-slate-400'}`}
    style={{ left: n.x(), top: n.y(), width: CARD_W, height: CARD_H }}
    onPointerDown={(e: ui.PointerEvent) => cardDown(n, e)} onPointerMove={(e: ui.PointerEvent) => cardMove(e)}
    onPointerUp={(e: ui.PointerEvent) => { dragged = null; }}
    onContextMenu={(e: ui.PointerEvent) => duplicate(n)}>
    <view class="px-3 py-2 flex-col gap-1">
      <view class="flex-row items-center gap-2">
        <view class="w-[8] h-[8] rounded-full bg-sky-400" />
        <text class="text-sm font-bold text-white">{n.name()}</text>
      </view>
      <text class="text-xs text-slate-400">box #{n.id}</text>
    </view>
  </view>;
}
function App(): i32 {
  return <view class="flex-row h-full bg-slate-950">
    <view class="w-[300] flex-col gap-3 p-4 bg-slate-900">
      <text class="text-lg font-bold text-white">Box properties</text>
      <Field label="Name">
        <input ref={nameRef} class="w-full focus:border-sky-400" placeholder="Select a box" value={selected() !== null ? (selected() as GNode).name() : ''}
          onInput={(v: string) => { const s = selected(); if (s !== null) s.setName(v); }}
          onChange={(v: string) => setStatus(`Renamed to "${v}"`)} />
      </Field>
      <Field label="Robot PIN">
        <input class="w-full" password placeholder="4 digits" value={pin()} onInput={(v: string) => setPin(v)} />
      </Field>
      <Field label="Notes">
        <textarea class="w-full text-sm" rows={4} value={notes()} onInput={(v: string) => setNotes(v)} />
      </Field>
      <view class="flex-row gap-2">
        <button class="bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-md px-3 py-1 cursor-pointer" onClick={() => setStatus('Saved')}><text class="text-sm text-white">Save</text></button>
        <button class="bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1 cursor-pointer" onClick={() => { setZoom(1); setPanX(0); setPanY(0); setStatus('View reset'); }}><text class="text-sm text-white">Reset view</text></button>
      </view>
      <text class="text-xs text-slate-400">{status()}</text>
    </view>
    <view class="grow flex-col">
      <view class="h-[200] flex-col p-3 gap-1 bg-slate-900 border-slate-800">
        <text class="text-xs text-slate-400">onStart.ts</text>
        <textarea ref={scriptRef} class="grow w-full font-mono text-sm bg-slate-950" lineNumbers wrap={false} value={script()}
          onInput={(v: string) => setScript(v)} highlight={(l: string) => ui.tsHighlight(l)} />
      </view>
      <view ref={canvasRef} class="grow overflow-hidden bg-slate-950 cursor-move"
        onPointerDown={(e: ui.PointerEvent) => { panning = true; panFromX = e.x - panX(); panFromY = e.y - panY(); setSelected(null); }}
        onPointerMove={(e: ui.PointerEvent) => { if (panning) { setPanX(e.x - panFromX); setPanY(e.y - panFromY); } }}
        onPointerUp={(e: ui.PointerEvent) => { panning = false; }}
        onWheel={(e: ui.PointerEvent) => zoomAt(e)}
        onDoubleClick={(e: ui.PointerEvent) => { const p = toWorld(e.gx, e.gy); add(new GNode(nextId++, "New box", p[0], p[1])); }}>
        <canvas class="absolute inset-0" onDraw={drawLinks} />
        <view ref={worldRef} class="absolute left-0 top-0 w-[2000] h-[2000]" style={{ scale: zoom(), translateX: panX(), translateY: panY() }}>
          <For each={nodes()}>{(n: GNode, i: i32) => Card(n)}</For>
        </view>
        <text class="absolute right-[8] bottom-[6] text-xs text-slate-500">{`${Math.round(zoom() * 100)}%`}</text>
      </view>
    </view>
  </view>;
}

const root = ui.createNode(ui.VIEW);
ui.insert(root, App(), -1);
// ZINC_DEMO=1: a few scripted edits through the test hooks (screenshots); the real mouse and keyboard are ignored then
const demo = env('ZINC_DEMO') === '1';
let frames = 0;
ui.mount(root, 0x020617, (dt: number) => {
  frames++;
  if (!demo || frames !== 3) return;
  const c = ui.screenBox(canvasRef.node);
  const card = ui.screenBox(ui.parentOf(ui.parentOf(ui.find('Wait 2 s'))));
  ui.pointerAt(card[0] + 60, card[1] + 20, true);   // drag the second box a little
  ui.pointerAt(card[0] + 100, card[1] + 50, true);
  ui.pointerAt(card[0] + 100, card[1] + 50, false);
  ui.wheelAt(c[0] + 40, c[1] + 40, 1);              // zoom in around the top-left corner
  ui.select(scriptRef.node, 144, 177);              // a selection in the (unfocused) script editor
  ui.keyDown(nameRef.node, 'End');                  // rename the selected box: caret in the name field
  ui.typeText(-1, ' twice');
  const third = ui.screenBox(ui.parentOf(ui.parentOf(ui.find('Wave arm'))));
  ui.pointerAt(third[0] + 30, third[1] + 30, false); // hover the third box
});
