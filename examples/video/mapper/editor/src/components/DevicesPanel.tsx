// Several machines, one picture: where each one sits in the canvas, how well it follows, and the ones to add.
import { Button } from 'zinc:ui/kit';
import { For, createSignal, onCleanup, onMount } from 'zinc:ui/solid';
import { tr } from '../i18n';
import { getJson, send } from '../services/link';
import { Heading, IconButton, NumberField, Row, ValueSlider } from './Field';

interface Place { id: string; name: string; viewport: number[]; trimMs: number }
interface Device extends Place { host: string; online: boolean; fps: number; offsetMs: number; rttMs: number; synced: boolean; late: number; system: string; output: number[] }
interface Found { id: string; name: string; host: string; pairing: boolean }
interface Fleet {
  self: { id: string; name: string; linkPort: i32; trimMs: number; masterName: string; viewport: number[] };
  lookaheadMs: number; devices: Device[]; found: Found[]; problem: string;
}

const REFRESH_MS = 1000;
const CANVAS_W = 420, CANVAS_H = 150;
const COLOURS: string[] = ['bg-sky-700', 'bg-emerald-700', 'bg-amber-700', 'bg-fuchsia-700', 'bg-rose-700', 'bg-indigo-700'];
const AXES: string[] = ['x', 'y', 'w', 'h'];

const [fleet, setFleet] = createSignal<Fleet | null>(null);

async function refresh(): Promise<void> {
  try { setFleet(await getJson('/fleet') as Fleet); } catch (e) { setFleet(null); }
}

/** The list changes shape only when these do: the sliders are not built again under the finger each second. */
function shapeOf(known: Fleet | null): string {
  if (known === null) return '';
  const f = known as Fleet;
  return [f.self.id].concat(f.devices.map((d: Device): string => d.id)).concat(f.found.map((d: Found): string => `${d.id}${d.pairing}`)).join(' ');
}

function deviceNow(id: string): Device | null {
  const known = fleet();
  if (known === null) return null;
  const device = (known as Fleet).devices.find((d: Device): boolean => d.id === id);
  return device === undefined ? null : device as Device;
}

function placed(viewport: number[], colour: string, name: string): i32 {
  const left = viewport[0] * CANVAS_W, top = viewport[1] * CANVAS_H;
  return <View className={`absolute ${colour} overflow-hidden p-1 border border-zinc-300`} style={{ left, top, width: viewport[2] * CANVAS_W, height: viewport[3] * CANVAS_H }}>
    <Text className="text-xs text-white">{name}</Text>
  </View>;
}

function Canvas(): i32 {
  const known = fleet();
  if (known === null) return <View />;
  const f = known as Fleet;
  return <View className="relative bg-zinc-900 border border-zinc-700" style={{ width: CANVAS_W, height: CANVAS_H }}>
    {placed(f.self.viewport, COLOURS[0], f.self.name)}
    {f.devices.map((d: Device, at: i32) => placed(d.viewport, COLOURS[(at + 1) % COLOURS.length], d.name))}
  </View>;
}

function statusOf(device: Device | null): string {
  if (device === null) return '';
  const d = device as Device;
  if (!d.online) return tr('mapper.devices.offline', ['host', d.host]);
  return tr('mapper.devices.online', ['host', d.host, 'system', d.system, 'fps', `${d.fps}`, 'rtt', d.rttMs.toFixed(2), 'late', `${d.late}`]);
}

function Placement(props: { id: string; viewport: number[]; trimMs: number }): i32 {
  const v = props.viewport.slice();
  const sendPlace = (): void => { send('/fleet/viewport', v, [props.id]); };
  return <View className="gap-1">
    {AXES.map((axis: string, at: i32) => <Row label={tr(`mapper.devices.${axis}`)}><ValueSlider min={0} max={1} read={() => v[at]} write={(value: number) => {
      v[at] = value;
      sendPlace();
    }} /></Row>)}
    <Row label={tr('mapper.devices.trim')}><NumberField label={tr('mapper.devices.trim')} value={() => props.trimMs} onChange={(value: number) => { send('/fleet/trim', [value], [props.id]); }} /></Row>
  </View>;
}

function DeviceCard(props: { device: Device }): i32 {
  const id = props.device.id;
  return <View className="p-2 gap-1 rounded bg-zinc-900">
    <View className="flex-row gap-1 items-center">
      <Text className="text-sm text-zinc-100">{props.device.name}</Text>
      <View className="grow" />
      <IconButton icon="scan-eye" label={tr('mapper.devices.identify')} onClick={() => { send('/fleet/identify', [], [id]); }} />
      <IconButton icon="trash" label={tr('mapper.devices.remove')} onClick={() => { send('/fleet/remove', [], [id]); refresh(); }} />
    </View>
    <Text className="text-xs text-zinc-400">{statusOf(deviceNow(id))}</Text>
    <Placement id={id} viewport={props.device.viewport} trimMs={props.device.trimMs} />
  </View>;
}

function FoundRow(props: { found: Found }): i32 {
  const [code, setCode] = createSignal('');
  const id = props.found.id;
  return <View className="flex-row gap-2 items-center">
    <Text className="text-sm text-zinc-100">{`${props.found.name} (${props.found.host})`}</Text>
    <View className="grow" />
    <Button size="sm" variant="secondary" label={tr('mapper.devices.showCode')} onClick={() => { send('/fleet/ask', [], [id]); }} />
    <Input className="w-[84] h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label={tr('mapper.devices.code')} placeholder={tr('mapper.devices.code')} value={code()} onChange={setCode} />
    <Button size="sm" label={tr('mapper.devices.add')} onClick={() => { send('/fleet/add', [], [id, code()]); }} />
  </View>;
}

function ByAddress(): i32 {
  const [address, setAddress] = createSignal('');
  const [code, setCode] = createSignal('');
  return <View className="flex-row gap-2 items-center">
    <Input className="w-[180] h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label={tr('mapper.devices.address')} placeholder={tr('mapper.devices.address')} value={address()} onChange={setAddress} />
    <Input className="w-[84] h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label={tr('mapper.devices.code')} placeholder={tr('mapper.devices.code')} value={code()} onChange={setCode} />
    <Button size="sm" variant="secondary" label={tr('mapper.devices.add')} onClick={() => { send('/fleet/add', [], [address(), code()]); }} />
  </View>;
}

function Content(): i32 {
  const known = fleet();
  if (known === null) return <Text className="text-xs text-zinc-400">{tr('mapper.devices.unknown')}</Text>;
  const f = known as Fleet;
  return <View className="gap-2">
    {f.self.masterName !== '' && <Text className="text-xs text-amber-400">{tr('mapper.devices.following', ['name', f.self.masterName])}</Text>}
    <View className="p-2 gap-1 rounded bg-zinc-900">
      <Text className="text-sm text-zinc-100">{tr('mapper.devices.thisOne', ['name', f.self.name])}</Text>
      <Placement id="" viewport={f.self.viewport} trimMs={f.self.trimMs} />
    </View>
    {f.devices.map((device: Device) => <DeviceCard device={device} />)}
    <Heading text={tr('mapper.devices.onNetwork')} />
    {f.found.length === 0 && <Text className="text-xs text-zinc-400">{tr('mapper.devices.noneFound')}</Text>}
    {f.found.map((found: Found) => <FoundRow found={found} />)}
    <ByAddress />
    <Heading text={tr('mapper.devices.timing')} />
    <Row label={tr('mapper.devices.lookahead')}><NumberField label={tr('mapper.devices.lookahead')} value={() => f.lookaheadMs} onChange={(value: number) => { if (value >= 0) send('/fleet/lookahead', [value]); }} /></Row>
  </View>;
}

export function DevicesPanel(): i32 {
  let timer: i32 = -1;
  onMount(() => {
    refresh();
    timer = setInterval(() => { refresh(); }, REFRESH_MS);
  });
  onCleanup(() => { clearInterval(timer); });
  return <View className="p-3 gap-2">
    <Heading text={tr('mapper.devices.heading')} />
    <View className="flex-row gap-3 items-start">
      <For each={[`${JSON.stringify(fleet()?.self.viewport)}${(fleet()?.devices ?? []).map((d: Device): string => `${d.name}${d.viewport}`).join()}`]}>{(key: string) => <Canvas />}</For>
      <Button size="sm" variant="secondary" label={tr('mapper.devices.sideBySide')} onClick={() => { send('/fleet/sidebyside', []); }} />
    </View>
    <For each={[shapeOf(fleet())]}>{(shape: string) => <Content />}</For>
    <Text className="text-xs text-red-400">{fleet()?.problem ?? ''}</Text>
  </View>;
}
