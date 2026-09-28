// Left column: the project panel (files and assets, with import) and the box library (search + category tree,
// drag a box onto the diagram or double-click it).
import { createSignal, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as model from '../model';
import * as assets from '../assets';
import { Asset } from '../assets';
import { BOXES, BoxDef, CATEGORIES, categoryColor } from '../library';
import { basename } from '../project';
import { boxAvailable } from '../runner';
import * as graph from './graph';
import { Icon, IconButton, PanelHeader, HSep, inputClass, C_MUTED, C_SOFT } from './kit';
import { setCenterTab, notify } from './state';

// ---------------------------------------------------------------- project panel
function kindIcon(kind: string): string {
  return kind === 'image' || kind === 'svg' ? 'image' : kind === 'video' ? 'video' : kind === 'font' ? 'font' : kind === 'lottie' ? 'lottie' : 'file';
}
/** label / detail are getters: component props are evaluated once, getters keep them live. */
interface RowProps { icon: string; label: () => string; detail?: () => string; indent?: i32; active?: () => boolean; onClick: () => void }
function TreeRow(props: RowProps): i32 {
  const act = props.active;
  const pad = props.indent ?? 0;
  const detail = props.detail;
  return <button class={act !== undefined && act() ? 'flex-row items-center gap-2 h-[26] pr-2 rounded-md bg-zinc-100 cursor-pointer' : 'flex-row items-center gap-2 h-[26] pr-2 rounded-md bg-transparent hover:bg-zinc-50 cursor-pointer'}
    onClick={props.onClick}>
    <view style={{ width: 8 + pad * 14 }} />
    <Icon name={props.icon} color={C_MUTED} size={14} />
    <text class="text-[13] text-zinc-800">{props.label()}</text>
    <view class="grow" />
    <text class="text-[11] text-zinc-400">{detail !== undefined ? detail() : ''}</text>
  </button>;
}

const [importPath, setImportPath] = createSignal<string>('');
async function doImport(): Promise<void> {
  const dir = model.projectDir();
  if (dir === '') { notify('Save the project first'); return; }
  const err = await assets.importFile(dir, importPath());
  if (err !== '') { notify(err); return; }
  notify(`Imported ${basename(importPath())}`);
  model.selectAsset(basename(importPath()));
  setImportPath('');
}

export function ProjectPanel(): i32 {
  return <view class="flex-col h-[300] bg-white">
    <PanelHeader title="Project" icon="folder">
      <IconButton icon="import" onClick={() => { doImport(); }} disabled={() => importPath() === ''} />
    </PanelHeader>
    <scroll class="grow px-2 py-2">
      <TreeRow icon="folder" label={() => model.projectDir() === '' ? 'unsaved project' : basename(model.projectDir())} onClick={() => { model.select([]); setCenterTab('Flow'); }} />
      <TreeRow icon="file" label={() => 'project.json'} indent={1} onClick={() => { model.select([]); setCenterTab('Flow'); }} />
      <TreeRow icon="code" label={() => 'build/src/main.ts'} indent={1} onClick={() => setCenterTab('Generated code')} />
      <TreeRow icon="folder" label={() => 'assets'} detail={() => `${assets.assets().length}`} indent={1} onClick={() => { const dir = model.projectDir(); if (dir !== '') assets.refresh(dir); }} />
      <For each={assets.assets()}>{(a: Asset, _i: i32) =>
        <TreeRow icon={kindIcon(a.kind)} label={() => a.name} detail={() => a.size} indent={2} active={() => model.selectedAsset() === a.name}
          onClick={() => model.selectAsset(a.name)} />}
      </For>
    </scroll>
    <HSep />
    <view class="flex-row items-center gap-2 px-2 py-2">
      <input class={inputClass(false)} placeholder="/path/to/file.png to import" value={importPath()}
        onInput={(v: string) => setImportPath(v)} onChange={(v: string) => { if (v !== '') doImport(); }} />
    </view>
    <HSep />
  </view>;
}

// ---------------------------------------------------------------- box library
const [query, setQuery] = createSignal<string>('');
const [collapsed, setCollapsed] = createSignal<string[]>([]);
function matches(d: BoxDef, q: string): boolean {
  if (q === '') return true;
  const s = q.toLowerCase();
  return d.title.toLowerCase().includes(s) || d.category.toLowerCase().includes(s) || d.description.toLowerCase().includes(s) || d.type.includes(s);
}
function toggle(cat: string): void {
  const c = collapsed().slice(), i = c.indexOf(cat);
  if (i >= 0) c.splice(i, 1); else c.push(cat);
  setCollapsed(c);
}

// drag and drop onto the diagram: the ghost follows the pointer (drawn by app.tsx)
const [ghost, setGhost] = createSignal<string>('');
const [ghostPos, setGhostPos] = createSignal<number[]>([0, 0]);
export function ghostTitle(): string { return ghost(); }
export function ghostAt(): number[] { return ghostPos(); }
let dragType = '';
function itemDown(d: BoxDef, e: ui.PointerEvent): void { dragType = d.type; setGhostPos([e.gx, e.gy]); }
function itemMove(d: BoxDef, e: ui.PointerEvent): void {
  if (dragType === '') return;
  setGhostPos([e.gx, e.gy]);
  if (ghost() === '') setGhost(d.title);
}
function itemUp(e: ui.PointerEvent): void {
  const t = dragType;
  dragType = '';
  if (ghost() !== '' && t !== '') { if (!graph.dropAt(t, e.gx, e.gy)) notify('Drop the box on the diagram'); }
  setGhost('');
}

function LibraryItem(d: BoxDef): i32 {
  return <view class="flex-row items-center gap-2 h-[28] pl-6 pr-2 rounded-md hover:bg-zinc-100 cursor-grab" grab="keep"
    onPointerDown={(e: ui.PointerEvent) => itemDown(d, e)} onPointerMove={(e: ui.PointerEvent) => itemMove(d, e)}
    onPointerUp={(e: ui.PointerEvent) => itemUp(e)} onDoubleClick={(e: ui.PointerEvent) => { graph.addAtCenter(d.type); setCenterTab('Flow'); }}>
    <view class="w-[8] h-[8] rounded-sm" style={{ bg: categoryColor(d.category) }} />
    <text class={boxAvailable(d, model.target()) ? 'text-[13] text-zinc-800' : 'text-[13] text-zinc-400'}>{d.title}</text>
    <view class="grow" />
    <Show when={!boxAvailable(d, model.target())}><text class="text-[10] text-zinc-400">n/a</text></Show>
  </view>;
}
function Category(cat: string): i32 {
  return <view class="flex-col">
    <button class="flex-row items-center gap-1 h-[26] px-1 rounded-md bg-transparent hover:bg-zinc-50 cursor-pointer" onClick={() => toggle(cat)}>
      <Icon name="right" color={C_SOFT} size={14} />
      <text class="text-[12] font-semibold text-zinc-700">{cat}</text>
      <view class="grow" />
      <text class="text-[11] text-zinc-400">{`${BOXES.filter((d: BoxDef) => d.category === cat && matches(d, query())).length}`}</text>
    </button>
    <Show when={collapsed().indexOf(cat) < 0}>
      <view class="flex-col">
        <For each={BOXES.filter((d: BoxDef) => d.category === cat && matches(d, query()))}>{(d: BoxDef, _i: i32) => LibraryItem(d)}</For>
      </view>
    </Show>
  </view>;
}

export function LibraryPanel(): i32 {
  return <view class="flex-col grow bg-white">
    <PanelHeader title="Box library" icon="box" />
    <view class="flex-row items-center gap-2 mx-2 mt-2 px-2 h-[30] rounded-md border border-zinc-200 bg-white">
      <Icon name="search" color={C_SOFT} size={14} />
      <input class="grow h-[28] text-[13] text-zinc-900 bg-white border-0" placeholder="Search boxes" value={query()} onInput={(v: string) => setQuery(v)} />
    </view>
    <scroll class="grow px-2 py-2">
      <For each={CATEGORIES.filter((c: string) => BOXES.some((d: BoxDef) => d.category === c && matches(d, query())))}>{(c: string, _i: i32) => Category(c)}</For>
    </scroll>
    <HSep />
    <view class="px-3 py-2">
      <text class="text-[11] text-zinc-400">{`${BOXES.filter((d: BoxDef) => boxAvailable(d, model.target())).length} of ${BOXES.length} boxes run on this target`}</text>
    </view>
  </view>;
}
