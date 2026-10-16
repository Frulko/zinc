// Inspector (right column, bottom): what is selected — a box (title, parameters with validation, ports), a link,
// several boxes, an asset (live preview) — or the project settings when nothing is.
import { createSignal, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as model from '../model';
import { Box, Link } from '../model';
import * as assets from '../assets';
import { ParamDef, PortDef, categoryColor } from '../library';
import { TARGETS, TargetInfo, boxAvailable } from '../runner';
import { Badge, Button as KitButton, Field, PanelHeader, inputClass } from './kit';
import { setCenterTab } from './state';

// ---------------------------------------------------------------- parameter editors
function Toggle(b: Box, p: ParamDef): i32 {
  return <Button className={b.param(p.name) === 'true' ? 'w-[36] h-[20] rounded-full bg-zinc-900 cursor-pointer' : 'w-[36] h-[20] rounded-full bg-zinc-200 cursor-pointer'}
    onClick={() => model.setParam(b, p.name, b.param(p.name) === 'true' ? 'false' : 'true')}>
    <View className="absolute top-[2] w-[16] h-[16] rounded-full bg-white shadow-sm" style={{ left: b.param(p.name) === 'true' ? 18 : 2 }} />
  </Button>;
}
function Choices(b: Box, p: ParamDef): i32 {
  return <View className="flex-row flex-wrap gap-1">
    <For each={p.choices}>{(c: string, _i: i32) =>
      <Button className={b.param(p.name) === c ? 'h-[26] px-2 rounded-md bg-zinc-900 cursor-pointer' : 'h-[26] px-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-100 cursor-pointer'}
        onClick={() => model.setParam(b, p.name, c)}>
        <Text className={b.param(p.name) === c ? 'text-[12] font-medium text-white' : 'text-[12] font-medium text-zinc-700'}>{c}</Text>
      </Button>}
    </For>
  </View>;
}
function AssetPicker(b: Box, p: ParamDef): i32 {
  return <View className="flex-col gap-1">
    <Input className={inputClass(model.paramError(b.def, p.name, b.param(p.name)) !== '')} value={b.param(p.name)} onInput={(v: string) => model.setParam(b, p.name, v)} />
    <View className="flex-row flex-wrap gap-1">
      <For each={assets.assetNames([])}>{(n: string, _i: i32) =>
        <Button className={b.param(p.name) === n ? 'h-[22] px-2 rounded-md bg-sky-50 border border-sky-300 cursor-pointer' : 'h-[22] px-2 rounded-md bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 cursor-pointer'}
          onClick={() => model.setParam(b, p.name, n)}>
          <Text className="text-[11] text-zinc-700">{n}</Text>
        </Button>}
      </For>
    </View>
  </View>;
}
function ParamEditor(b: Box, p: ParamDef): i32 {
  const err = (): string => model.paramError(b.def, p.name, b.param(p.name));
  const label = p.type === 'number' && (p.min > -1e11 || p.max < 1e11) ? `${p.name}  (${p.min} – ${p.max})` : p.name;
  const renderControl = (): i32 => {
    if (p.type === 'bool') return Toggle(b, p);
    if (p.type === 'choice') return Choices(b, p);
    if (p.type === 'asset') return AssetPicker(b, p);
    return <Input className={inputClass(err() !== '')} value={b.param(p.name)} onInput={(v: string) => model.setParam(b, p.name, v)} />;
  };
  return <Field label={label} hint={p.hint} error={err}>{renderControl()}</Field>;
}
function PortRow(p: PortDef, output: boolean): i32 {
  return <View className="flex-row items-center gap-2 h-[22]">
    <View className={p.isSignal ? 'w-[8] h-[8] rounded-full border-2 border-zinc-500' : p.type === 'number' ? 'w-[8] h-[8] rounded-sm border-2 border-amber-600' : 'w-[8] h-[8] rounded-sm border-2 border-emerald-600'} />
    <Text className="text-[12] text-zinc-700">{p.name}</Text>
    <View className="grow" />
    <Text className="text-[11] text-zinc-400">{`${output ? 'out' : 'in'} · ${p.isSignal ? 'signal' : p.type}`}</Text>
  </View>;
}

// ---------------------------------------------------------------- views per selection
function BoxInspector(b: Box): i32 {
  const def = b.def;
  return <View className="flex-col gap-4 p-4">
    <View className="flex-row items-center gap-2">
      <View className="w-[10] h-[10] rounded-full" style={{ bg: categoryColor(def.category) }} />
      <Text className="text-[14] font-semibold text-zinc-900">{def.title}</Text>
      <View className="grow" />
      <Badge label={def.category} />
      <Show when={!boxAvailable(def, model.target())}><Badge label="not on target" color="amber" /></Show>
    </View>
    <Text className="text-[12] text-zinc-500">{def.description}</Text>
    <Field label="Name">
      <Input className={inputClass(false)} value={b.title()} onInput={(v: string) => model.setTitle(b, v)} />
    </Field>
    <For each={def.params}>{(p: ParamDef, _i: i32) => ParamEditor(b, p)}</For>
    <Show when={def.type === 'script'}>
      <KitButton label="Edit script" icon="code" onClick={() => setCenterTab('Script')} />
    </Show>
    <View className="flex-col gap-1">
      <Text className="text-[12] font-medium text-zinc-700">Ports</Text>
      <For each={def.inputs}>{(p: PortDef, _i: i32) => PortRow(p, false)}</For>
      <For each={def.outputs}>{(p: PortDef, _i: i32) => PortRow(p, true)}</For>
    </View>
    <Show when={def.modules.length > 0}>
      <Text className="text-[11] text-zinc-400">{`Uses ${def.modules.join(', ')}`}</Text>
    </Show>
    <View className="flex-row gap-2">
      <KitButton label="Duplicate" icon="copy" onClick={() => model.duplicateSelected()} />
      <KitButton label="Delete" icon="trash" variant="ghost" onClick={() => model.removeSelected()} />
    </View>
  </View>;
}
function LinkInspector(key: string): i32 {
  const l = model.links().find((x: Link) => x.key === key);
  const name = (id: string): string => { if (id === '@start') return 'Start bar'; if (id === '@end') return 'End bar'; const b = model.findBox(id); return b === null ? id : b.title(); };
  return <View className="flex-col gap-3 p-4">
    <Text className="text-[14] font-semibold text-zinc-900">Link</Text>
    <Text className="text-[13] text-zinc-600">{l !== undefined ? `${name(l.from)}.${l.out}  →  ${name(l.to)}.${l.inp}` : ''}</Text>
    <View className="flex-row"><KitButton label="Delete link" icon="trash" onClick={() => model.removeSelected()} /></View>
  </View>;
}
function MultiInspector(): i32 {
  return <View className="flex-col gap-3 p-4">
    <Text className="text-[14] font-semibold text-zinc-900">{`${model.selection().length} boxes selected`}</Text>
    <View className="flex-row gap-2">
      <KitButton label="Duplicate" icon="copy" onClick={() => model.duplicateSelected()} />
      <KitButton label="Delete" icon="trash" variant="ghost" onClick={() => model.removeSelected()} />
    </View>
  </View>;
}
const [assetInfo, setAssetInfo] = createSignal<string>('');
function AssetInspector(name: string): i32 {
  const a = assets.assets().find((x: assets.Asset) => x.name === name);
  const users = model.boxes().filter((b: Box) => b.def.params.some((p: ParamDef) => p.type === 'asset' && b.param(p.name) === name));
  return <View className="flex-col gap-3 p-4">
    <Text className="text-[14] font-semibold text-zinc-900">{name}</Text>
    <View className="h-[180] rounded-lg border border-zinc-200 bg-zinc-100 overflow-hidden">
      <Canvas className="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        const info = assets.drawPreview(model.projectDir(), name, x + 8, y + 8, w - 16, h - 16);
        if (info !== assetInfo()) setAssetInfo(info);
      }} />
    </View>
    <View className="flex-row gap-2">
      <Badge label={a !== undefined ? a.kind : 'file'} color="blue" />
      <Show when={a !== undefined && a.size !== ''}><Badge label={a !== undefined ? a.size : ''} /></Show>
      <Show when={assetInfo() !== ''}><Text className="text-[11] text-zinc-500 ml-1">{assetInfo()}</Text></Show>
    </View>
    <Text className="text-[12] text-zinc-500">{users.length === 0 ? 'Not used by any box yet. Asset parameters take its file name.' : `Used by ${users.map((b: Box) => b.title()).join(', ')}`}</Text>
  </View>;
}
function ProjectInspector(): i32 {
  const sizeErr = (v: string): string => { const n = parseInt(v); return isNaN(n) || n < 16 || n > 4096 ? '16 – 4096' : ''; };
  const [w, setW] = createSignal<string>(`${model.screenSize()[0]}`);
  const [h, setH] = createSignal<string>(`${model.screenSize()[1]}`);
  const apply = (): void => { if (sizeErr(w()) === '' && sizeErr(h()) === '') model.setScreenSize(parseInt(w()), parseInt(h())); };
  return <View className="flex-col gap-4 p-4">
    <Text className="text-[14] font-semibold text-zinc-900">Project settings</Text>
    <Field label="Name">
      <Input className={inputClass(false)} value={model.projectName()} onInput={(v: string) => model.setProjectName(v)} />
    </Field>
    <View className="flex-row gap-2">
      <View className="grow"><Field label="Screen width" error={() => sizeErr(w())}>
        <Input className={inputClass(sizeErr(w()) !== '')} value={w()} onInput={(v: string) => { setW(v); apply(); }} />
      </Field></View>
      <View className="grow"><Field label="Screen height" error={() => sizeErr(h())}>
        <Input className={inputClass(sizeErr(h()) !== '')} value={h()} onInput={(v: string) => { setH(v); apply(); }} />
      </Field></View>
    </View>
    <Field label="Run target">
      <View className="flex-col gap-1">
        <For each={TARGETS}>{(t: TargetInfo, _i: i32) =>
          <Button className={model.target() === t.id ? 'flex-col px-3 py-2 rounded-md border border-zinc-900 bg-white cursor-pointer' : 'flex-col px-3 py-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer'}
            onClick={() => model.setTarget(t.id)}>
            <Text className="text-[13] font-medium text-zinc-900">{t.label}</Text>
            <Text className="text-[11] text-zinc-500">{t.hint}</Text>
          </Button>}
        </For>
      </View>
    </Field>
    <Field label="Device (ssh)" hint="user@host for the Device target; manage devices in the Devices dialog">
      <Input className={inputClass(false)} placeholder="pi@raspberrypi.local" value={model.device()} onInput={(v: string) => model.setDevice(v)} />
    </Field>
  </View>;
}

function selectedBoxes(): Box[] { const b = model.selectedBox(); if (b === null) return []; return [b as Box]; }
function selectedLinks(): string[] { const k = model.selectedLink(); if (k === '') return []; return [k]; }
function selectedAssets(): string[] { const a = model.selectedAsset(); if (a === '' || model.selection().length > 0) return []; return [a]; }
function nothing(): boolean { return model.selection().length === 0 && model.selectedLink() === '' && model.selectedAsset() === ''; }

export function Inspector(): i32 {
  // keyed <For> over 0 or 1 item: the view is rebuilt when the selected box changes identity
  return <View className="flex-col grow bg-white">
    <PanelHeader title="Inspector" icon="sliders" />
    <ScrollView className="grow">
      <For each={selectedBoxes()}>{(b: Box, _i: i32) => BoxInspector(b)}</For>
      <For each={selectedLinks()}>{(k: string, _i: i32) => LinkInspector(k)}</For>
      <For each={selectedAssets()}>{(a: string, _i: i32) => AssetInspector(a)}</For>
      <Show when={model.selection().length > 1}><MultiInspector /></Show>
      <Show when={nothing()}><ProjectInspector /></Show>
    </ScrollView>
  </View>;
}
