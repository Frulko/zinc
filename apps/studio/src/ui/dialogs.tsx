// Modal dialogs: Open (path, recent projects, samples), New project, and Devices (discovered apps to preview,
// ssh devices to deploy to).
import { createSignal, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as remote from 'zinc:remote';
import * as model from '../model';
import * as devices from '../devices';
import { join, nameOf } from '../project';
import { sampleDir } from '../docs';
import { zincRoot } from '../runner';
import { Button as KitButton, Field, IconButton, Icon, HSep, inputClass, C_MUTED } from './kit';
import { dialog, closeDialog, notify } from './state';

let openHook: ((dir: string) => void) | null = null;
/** app.tsx: opens a project (also refreshes assets, fits the view). */
export function setOpenHook(f: (dir: string) => void): void { openHook = f; }
function openDir(dir: string): void { const f = openHook; if (f !== null) f(dir); }

/** One child (JSX components get a single `children`): put the dialog body in one view. */
interface CardProps { title: string; children: () => i32 }
function DialogCard(props: CardProps): i32 {
  return <View className="w-[520] flex-col rounded-xl border border-zinc-200 bg-white shadow-xl">
    <View className="flex-row items-center h-[48] px-5">
      <Text className="text-[15] font-semibold text-zinc-900">{props.title}</Text>
      <View className="grow" />
      <IconButton icon="x" onClick={() => closeDialog()} />
    </View>
    <HSep />
    <View className="p-5">{props.children()}</View>
  </View>;
}
function renderSection(label: string): i32 { return <Text className="text-[11] font-semibold text-zinc-500 tracking-wider">{label.toUpperCase()}</Text>; }
function PathRow(dir: string, icon: string): i32 {
  return <Button className="flex-row items-center gap-2 h-[30] px-2 rounded-md bg-transparent hover:bg-zinc-100 cursor-pointer" onClick={() => openDir(dir)}>
    <Icon name={icon} color={C_MUTED} size={14} />
    <Text className="text-[13] font-medium text-zinc-900">{nameOf(dir)}</Text>
    <Text className="text-[12] text-zinc-400">{dir}</Text>
  </Button>;
}

// ---------------------------------------------------------------- open
const [openPath, setOpenPath] = createSignal<string>('');
const [openErr, setOpenErr] = createSignal<string>('');
function tryOpen(): void {
  const p = openPath().trim();
  if (!fs.exists(join(p, 'project.json'))) { setOpenErr('No project.json in that folder'); return; }
  setOpenErr('');
  openDir(p);
}
function samples(): string[] {
  const out: string[] = [];
  try { for (const f of fs.list(join(zincRoot(), 'apps/studio/samples'))) if (f.endsWith('.zproj')) out.push(sampleDir(f.slice(0, f.length - 6))); } catch (e) { /* none */ }
  return out;
}
function OpenDialog(): i32 {
  return <DialogCard title="Open project">
    <View className="flex-col gap-4">
    <Field label="Project folder (.zproj)" error={() => openErr()}>
      <View className="flex-row gap-2">
        <Input className={inputClass(openErr() !== '')} placeholder="/path/to/project.zproj" value={openPath()} onInput={(v: string) => setOpenPath(v)} onChange={(v: string) => tryOpen()} />
        <KitButton label="Open" variant="primary" onClick={() => tryOpen()} />
      </View>
    </Field>
    <View className="flex-col gap-1">
      {renderSection('Recent')}
      <For each={model.recentProjects()}>{(d: string, _i: i32) => PathRow(d, 'folder')}</For>
      <Show when={model.recentProjects().length === 0}><Text className="text-[12] text-zinc-400">No recent projects</Text></Show>
    </View>
    <View className="flex-col gap-1">
      {renderSection('Samples')}
      <For each={samples()}>{(d: string, _i: i32) => PathRow(d, 'box')}</For>
    </View>
    </View>
  </DialogCard>;
}

// ---------------------------------------------------------------- new
const [newPath, setNewPath] = createSignal<string>('');
const [newErr, setNewErr] = createSignal<string>('');
function create(): void {
  let p = newPath().trim();
  if (p === '') { setNewErr('Choose a folder'); return; }
  if (!p.endsWith('.zproj')) p = p + '.zproj';
  if (fs.exists(join(p, 'project.json'))) { setNewErr('A project already exists there'); return; }
  try { model.newProject(p); } catch (e) { setNewErr('Cannot create the folder (does the parent exist?)'); return; }
  setNewErr('');
  openDir(p);
  notify(`Created ${p}`);
}
function NewDialog(): i32 {
  if (newPath() === '') setNewPath(join(sys.env('HOME'), 'my-app.zproj'));
  return <DialogCard title="New project">
    <View className="flex-col gap-4">
    <Field label="Project folder" hint="Created with project.json and assets/; the parent folder must exist" error={() => newErr()}>
      <Input className={inputClass(newErr() !== '')} value={newPath()} onInput={(v: string) => setNewPath(v)} onChange={(v: string) => create()} />
    </Field>
    <View className="flex-row gap-2">
      <View className="grow" />
      <KitButton label="Cancel" onClick={() => closeDialog()} />
      <KitButton label="Create project" variant="primary" onClick={() => create()} />
    </View>
    </View>
  </DialogCard>;
}

// ---------------------------------------------------------------- devices
const [user, setUser] = createSignal<string>('pi');
const [host, setHost] = createSignal<string>('');
const [devErr, setDevErr] = createSignal<string>('');
function AppRow(a: remote.App, _i: i32): i32 {
  return <View className="flex-row items-center gap-3 px-3 py-2 rounded-lg border border-zinc-200">
    <Icon name="wifi" color={0x16a34a} size={16} />
    <View className="flex-col grow">
      <Text className="text-[13] font-medium text-zinc-900">{a.name}</Text>
      <Text className="text-[11] text-zinc-500">{`${a.target} · ${a.width}x${a.height} · ${a.key} · pid ${a.pid}`}</Text>
    </View>
    <KitButton label="View" onClick={() => { devices.connectPreview(a.host, a.port); closeDialog(); }} />
  </View>;
}
function SshRow(d: string, _i: i32): i32 {
  return <View className="flex-row items-center gap-3 px-3 py-2 rounded-lg border border-zinc-200">
    <Icon name="server" color={C_MUTED} size={16} />
    <Text className="grow text-[13] font-medium text-zinc-900">{d}</Text>
    <Show when={model.device() === d} fallback={<KitButton label="Use for deploy" onClick={() => { model.setDevice(d); model.setTarget('device'); notify(`Deploy target: ${d}`); }} />}>
      <KitButton label="Deploy target" variant="primary" onClick={() => model.setTarget('device')} />
    </Show>
    <IconButton icon="trash" onClick={() => devices.removeSsh(d)} />
  </View>;
}
function DevicesDialog(): i32 {
  return <DialogCard title="Devices">
    <View className="flex-col gap-4">
    <View className="flex-col gap-2">
      {renderSection('Running apps (display remote, LAN discovery)')}
      <For each={devices.discovered()}>{(a: remote.App, i: i32) => AppRow(a, i)}</For>
      <Show when={devices.discovered().length === 0}>
        <Text className="text-[12] text-zinc-400">None found. Apps started with --display remote announce themselves here.</Text>
      </Show>
      <View className="flex-row gap-2">
        <KitButton label="View localhost:7711 (preview)" icon="monitor" onClick={() => { devices.connectLocalPreview(); closeDialog(); }} />
      </View>
    </View>
    <View className="flex-col gap-2">
      {renderSection('SSH devices (zinc deploy)')}
      <For each={devices.sshDevices()}>{(d: string, i: i32) => SshRow(d, i)}</For>
      <View className="flex-row gap-2 items-end">
        <View className="w-[120]"><Field label="User"><Input className={inputClass(false)} value={user()} onInput={(v: string) => setUser(v)} /></Field></View>
        <View className="grow"><Field label="Host"><Input className={inputClass(devErr() !== '')} placeholder="raspberrypi.local" value={host()} onInput={(v: string) => setHost(v)} /></Field></View>
        <KitButton label="Add" icon="plus" onClick={() => { const e = devices.addSsh(user(), host()); setDevErr(e); if (e === '') setHost(''); }} />
      </View>
      <Show when={devErr() !== ''}><Text className="text-[11] text-red-600">{devErr()}</Text></Show>
    </View>
    </View>
  </DialogCard>;
}

/** The dim overlay and the open dialog (nothing when none is open). */
export function Dialogs(): i32 {
  return <Show when={dialog() !== ''}>
    <View className="absolute inset-0 items-center justify-center bg-black/30" onPointerDown={(e: ui.PointerEvent) => { /* modal: swallow clicks */ }}>
      <Show when={dialog() === 'open'}><OpenDialog /></Show>
      <Show when={dialog() === 'new'}><NewDialog /></Show>
      <Show when={dialog() === 'devices'}><DevicesDialog /></Show>
    </View>
  </Show>;
}
