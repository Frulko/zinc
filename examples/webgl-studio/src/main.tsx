// webgl-studio: real three.js (r186) on zinc's WebGL 2 with a glTF truck, shadows, a custom shader, orbit controls and a transform gizmo, inside a normal zinc:ui page:
// a control panel built from the kit (sliders, switches, tabs), UI markers that follow the objects through the camera, and picking by a click on the scene or on a marker.
import { render, createSignal, createEffect, createNodeRef, onMount, For, Show } from 'zinc:ui/solid';
import { Slider, Switch, Badge, heading, mutedText, captionText, overline, theme } from 'zinc:ui/kit';
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';
import { pixelScale } from 'zinc:gfx';

const W = 480, H = 360;
const vm = new Script({ engine: 'quickjs', memoryLimit: 768 << 20, timeLimitMs: 0, importAssets: true });
vm.expose('__log', (s: string) => { console.log(s); });
vm.eval("const f = (...a) => __log(a.join(' ')); globalThis.console = { log: f, info: f, warn: f, error: f, debug: f };");
vm.set('__scale', pixelScale());
vm.define('three', "export * from 'three.module.js';");
vm.loadAsset('scene.mjs');

const surface = ui.createSurface(W * pixelScale() * 2, H * pixelScale() * 2);   // the script renders at 2x and zincPresent averages it down
ui.setClass(surface, `w-[${W}px] h-[${H}px] rounded-lg`);

const [azimuth, setAzimuth] = createSignal<number>(40);
const [sunPower, setSunPower] = createSignal<number>(2.4);
const [exposure, setExposure] = createSignal<number>(1);
const [shadows, setShadows] = createSignal<boolean>(true);
const [wire, setWire] = createSignal<boolean>(false);
const [shader, setShader] = createSignal<boolean>(true);
const [spin, setSpin] = createSignal<boolean>(false);
const [paused, setPaused] = createSignal<boolean>(false);
const [mode, setMode] = createSignal<string>('translate');
const [chosen, setChosen] = createSignal<string>('');
const [status, setStatus] = createSignal<string>('');
const IDX: i32[] = [0, 1, 2, 3];
const NAMES = ['Truck', 'Cube', 'Ring', 'Sphere'];
const [mx, setMx] = createSignal<number[]>([0, 0, 0, 0]);   // marker x per name
const [my, setMy] = createSignal<number[]>([0, 0, 0, 0]);
const [mv, setMv] = createSignal<boolean[]>([false, false, false, false]);

function choose(name: string): void { setChosen(vm.call('select', [name === chosen() ? '' : name]) as string); }
function setGizmo(m: string): void { setMode(m); vm.call('setMode', [m]); }

// pointer on the scene: a press and release without moving picks (the gizmo and the orbit take the drags)
let buttons = 0, downX = 0, downY = 0;
ui.onPointer(surface, ui.PDOWN, (e: ui.PointerEvent) => { buttons = 1 << e.button; downX = e.x; downY = e.y; vm.call('pointer', ['pointerdown', e.x, e.y, e.button, buttons]); });
ui.onPointer(surface, ui.PMOVE, (e: ui.PointerEvent) => { vm.call('pointer', ['pointermove', e.x, e.y, e.button, buttons]); });
ui.onPointer(surface, ui.PUP, (e: ui.PointerEvent) => {
  const dragged = vm.call('isDragging', []) as boolean;
  vm.call('pointer', ['pointerup', e.x, e.y, e.button, 0]); buttons = 0;
  if (!dragged && Math.abs(e.x - downX) < 4 && Math.abs(e.y - downY) < 4) setChosen(vm.call('select', [vm.call('pick', [e.x, e.y]) as string]) as string);
});
ui.onPointer(surface, ui.PWHEEL, (e: ui.PointerEvent) => { vm.call('wheel', [-e.wheel * 100]); });

function Marker(props: { i: i32 }): i32 {
  const name = NAMES[props.i];
  return <Show when={mv()[props.i]}>
    <View class="absolute left-0 top-0" style={{ translateX: mx()[props.i], translateY: my()[props.i] }}>
      <View class={`-translate-x-1/2 flex-col items-center`}>
        <View class={`flex-row items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer ${chosen() === name ? 'bg-amber-400' : 'bg-slate-900/80 hover:bg-slate-700'}`} onClick={() => choose(name)}>
          <View class={`w-1.5 h-1.5 rounded-full ${chosen() === name ? 'bg-slate-900' : 'bg-sky-400'}`} />
          <Text class={`text-xs font-medium ${chosen() === name ? 'text-slate-900' : 'text-white'}`}>{name}</Text>
        </View>
        <View class="w-px h-2 bg-white/60" />
      </View>
    </View>
  </Show>;
}

function Row(props: { label: string; value: string; children: () => i32 }): i32 {
  return <View class="flex-col gap-1">
    <View class="flex-row justify-between"><Text class={`text-sm font-medium text-${theme().foreground}`}>{props.label}</Text><Text class={mutedText()}>{props.value}</Text></View>
    {props.children()}
  </View>;
}

function Segment(props: { label: string; id: string }): i32 {
  return <View class={`px-3 py-1 rounded-md cursor-pointer ${mode() === props.id ? `bg-${theme().primary}` : `bg-${theme().muted} hover:bg-${theme().accent}`}`} onClick={() => setGizmo(props.id)}>
    <Text class={`text-sm ${mode() === props.id ? `text-${theme().primaryForeground}` : `text-${theme().foreground}`}`}>{props.label}</Text>
  </View>;
}

function Panel(): i32 {
  const box = createNodeRef();
  return <View class={`flex-col gap-4 p-4 w-[280px] rounded-lg bg-${theme().card}`}>
    <Text class={heading(3)}>Studio</Text>
    <View class="flex-row items-center gap-2">
      <Text class={overline()}>SELECTED</Text>
      <Badge label={chosen() === '' ? 'nothing' : chosen()} />
    </View>
    <View class="flex-row gap-1"><Segment label="Move" id="translate" /><Segment label="Rotate" id="rotate" /><Segment label="Scale" id="scale" /></View>
    <Row label="Sun direction" value={`${Math.round(azimuth())}°`}><Slider value={azimuth} onChange={setAzimuth} min={0} max={360} step={5} /></Row>
    <Row label="Sun power" value={sunPower().toFixed(1)}><Slider value={sunPower} onChange={setSunPower} min={0} max={5} step={0.1} /></Row>
    <Row label="Exposure" value={exposure().toFixed(2)}><Slider value={exposure} onChange={setExposure} min={0.3} max={2.5} step={0.05} /></Row>
    <View class="flex-col gap-2">
      <Switch checked={shadows} onChange={setShadows} label="Shadows" />
      <Switch checked={shader} onChange={setShader} label="Custom shader on the sphere" />
      <Switch checked={wire} onChange={setWire} label="Wireframe" />
      <Switch checked={spin} onChange={setSpin} label="Auto-rotate camera" />
      <Switch checked={paused} onChange={setPaused} label="Pause animation" />
    </View>
    <View class="flex-row gap-2">
      <View class={`px-3 py-1 rounded-md cursor-pointer bg-${theme().secondary} hover:bg-${theme().accent}`} onClick={() => { vm.call('resetCamera', []); }}><Text class={`text-sm text-${theme().foreground}`}>Reset camera</Text></View>
      <View class={`px-3 py-1 rounded-md cursor-pointer bg-${theme().secondary} hover:bg-${theme().accent}`} onClick={() => { setChosen(vm.call('select', ['']) as string); }}><Text class={`text-sm text-${theme().foreground}`}>Deselect</Text></View>
    </View>
  </View>;
}

function App(): i32 {
  const slot = createNodeRef();
  onMount(() => { ui.insert(slot.node, surface, -1); });
  return <View class="flex-row gap-4 p-4 w-full h-full bg-slate-950 items-start">
    <View class="flex-col gap-2">
      <View class={`relative w-[${W}px] h-[${H}px] rounded-lg overflow-hidden`}>
        <View ref={slot} class="absolute left-0 top-0" />
        <For each={IDX}>{(i: i32) => <Marker i={i} />}</For>
      </View>
      <Text class={captionText()}>{status()}</Text>
      <Text class="text-xs text-slate-500">drag: orbit  wheel: zoom  click an object or its label: select and move it with the gizmo</Text>
    </View>
    <Panel />
  </View>;
}

let t = 0, n = 0;
render(App, 0x020617, (dt: number) => {
  if (!paused()) t += dt;
  vm.call('look', [azimuth(), sunPower(), exposure(), shadows(), wire(), shader(), spin()]);
  vm.call('frame', [ui.surfaceImage(surface), t]);
  const m = JSON.parse(vm.call('markers', []) as string) as [string, number, number, number][];
  const xs: number[] = [0, 0, 0, 0], ys: number[] = [0, 0, 0, 0], vs: boolean[] = [false, false, false, false];
  for (const e of m) { const k = NAMES.indexOf(e[0]); if (k >= 0) { xs[k] = e[1]; ys[k] = e[2]; vs[k] = e[3] === 1; } }
  setMx(xs); setMy(ys); setMv(vs);
  ui.repaint();
  if (++n % 15 === 0) setStatus(`${vm.call('info', [])}  ${Math.round(1 / Math.max(dt, 0.001))} fps`);
});
