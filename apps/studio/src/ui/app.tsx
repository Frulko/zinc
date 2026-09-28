// Main window: toolbar, left column (project, library), centre (tabs over the diagram / script / code / docs, log
// below), right column (robot view, inspector), status bar; keyboard shortcuts and the scripted demo session.
import { createEffect, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { join } from '../project';
import * as model from '../model';
import * as assets from '../assets';
import * as runner from '../runner';
import * as devices from '../devices';
import * as docs from '../docs';
import { TARGETS, TargetInfo } from '../runner';
import * as graph from './graph';
import { FlowEditor } from './graph';
import { ProjectPanel, LibraryPanel, ghostTitle, ghostAt } from './panels';
import { Inspector } from './inspector';
import { LogPanel, tickLogs } from './logs';
import { RobotView, setRunHook } from './robot';
import { ScriptTab, CodeTab, DocsTab } from './editors';
import { Dialogs, setOpenHook } from './dialogs';
import { Button, IconButton, Tabs, VSep, HSep, VLine } from './kit';
import { centerTab, setCenterTab, dialog, openDialog, closeDialog, toast, notify } from './state';

let fitPending = 0;   // frames before fitting the view (the viewport size is known after a layout)

/** Opens a project folder: diagram, assets, view. */
export function openProjectDir(dir: string): void {
  try { model.openProject(dir); } catch (e) { notify(`Cannot open ${dir}`); console.error('studio: cannot open', dir, e); return; }
  assets.closePreview();
  assets.refresh(dir);
  closeDialog();
  setCenterTab('Flow');
  fitPending = 2;
  runner.log('studio', `opened ${dir}`);
}
function save(): void {
  if (model.projectDir() === '') { openDialog('new'); return; }
  model.saveProject();
  notify('Saved');
}
/** Saves, generates build/, builds and runs for the project's target. */
export function run(): void {
  if (model.projectDir() === '') { notify('Create or open a project first'); openDialog('new'); return; }
  model.saveProject();
  runner.play(model.projectDir(), model.toFile());
}

function targetLabel(): string { for (const t of TARGETS) if (t.id === model.target()) return t.label; return ''; }
function Toolbar(): i32 {
  return <view class="flex-row items-center gap-1 h-[48] px-3 bg-white">
    <view class="w-[26] h-[26] rounded-md bg-zinc-900 items-center justify-center"><text class="text-[14] font-bold text-white">Z</text></view>
    <text class="text-[14] font-semibold text-zinc-900 ml-1 mr-2">ZincStudio</text>
    <VSep />
    <IconButton icon="new" onClick={() => openDialog('new')} />
    <IconButton icon="open" onClick={() => openDialog('open')} />
    <IconButton icon="save" onClick={() => save()} />
    <VSep />
    <IconButton icon="undo" onClick={() => model.undo()} disabled={() => !model.canUndo()} />
    <IconButton icon="redo" onClick={() => model.redo()} disabled={() => !model.canRedo()} />
    <VSep />
    <text class="text-[13] font-medium text-zinc-800 ml-1">{model.projectName()}</text>
    <Show when={model.dirty()}><view class="w-[6] h-[6] rounded-full bg-amber-500 ml-1" /></Show>
    <view class="grow" />
    <Tabs tabs={TARGETS.map((t: TargetInfo) => t.label)} current={targetLabel} onSelect={(l: string) => { for (const t of TARGETS) if (t.label === l) model.setTarget(t.id); }} />
    <view class="w-[8]" />
    <Show when={!runner.busy()} fallback={<Button label="Stop" icon="stop" variant="danger" onClick={() => runner.stop()} />}>
      <Button label="Run" icon="play" variant="primary" onClick={() => run()} />
    </Show>
    <VSep />
    <IconButton icon="devices" onClick={() => openDialog('devices')} />
    <IconButton icon="book" onClick={() => setCenterTab(centerTab() === 'Docs' ? 'Flow' : 'Docs')} active={() => centerTab() === 'Docs'} />
  </view>;
}

function ZoomControls(): i32 {
  return <view class="flex-row items-center gap-1">
    <IconButton icon="minus" onClick={() => graph.zoomBy(1 / 1.2)} />
    <button class="h-[28] w-[52] items-center justify-center rounded-md bg-transparent hover:bg-zinc-100 cursor-pointer" onClick={() => graph.resetView()}>
      <text class="text-[12] font-medium text-zinc-600">{`${Math.round(graph.zoomLevel() * 100)}%`}</text>
    </button>
    <IconButton icon="plus" onClick={() => graph.zoomBy(1.2)} />
    <IconButton icon="fit" onClick={() => graph.fitView()} />
  </view>;
}

function Center(): i32 {
  // w-[1] + grow: the column takes the remaining width whatever its content (long log lines)
  return <view class="flex-col grow w-[1] overflow-hidden">
    <view class="flex-row items-center gap-2 h-[44] px-3 bg-white">
      <Tabs tabs={['Flow', 'Script', 'Generated code', 'Docs']} current={centerTab} onSelect={(t: string) => setCenterTab(t)} />
      <view class="grow" />
      <Show when={centerTab() === 'Flow'}><ZoomControls /></Show>
    </view>
    <HSep />
    <view class={centerTab() === 'Flow' ? 'grow flex-col' : 'hidden'}><FlowEditor /></view>
    <Show when={centerTab() === 'Script'}><ScriptTab /></Show>
    <Show when={centerTab() === 'Generated code'}><CodeTab /></Show>
    <Show when={centerTab() === 'Docs'}><DocsTab /></Show>
    <LogPanel />
  </view>;
}

function StatusBar(): i32 {
  return <view class="flex-row items-center gap-3 h-[26] px-3 bg-zinc-50">
    <view class={runner.phase() === 'idle' ? 'w-[7] h-[7] rounded-full bg-zinc-300' : runner.phase() === 'running' ? 'w-[7] h-[7] rounded-full bg-emerald-500' : 'w-[7] h-[7] rounded-full bg-amber-500'} />
    <text class="text-[12] text-zinc-600">{runner.status()}</text>
    <text class="text-[12] font-medium text-sky-700">{toast()}</text>
    <view class="grow" />
    <text class="text-[12] text-zinc-500">{`${model.boxes().length} boxes · ${model.links().length} links · ${targetLabel()}`}</text>
    <text class="text-[12] text-zinc-400">{model.projectDir() === '' ? 'unsaved' : model.projectDir()}</text>
  </view>;
}

function Ghost(): i32 {
  return <Show when={ghostTitle() !== ''}>
    <view class="absolute flex-row items-center gap-2 h-[30] px-3 rounded-lg border border-sky-400 bg-white shadow-lg" style={{ left: ghostAt()[0] + 8, top: ghostAt()[1] + 8 }}>
      <text class="text-[13] font-medium text-zinc-900">{`+ ${ghostTitle()}`}</text>
    </view>
  </Show>;
}

export function App(): i32 {
  return <view class="flex-col h-full w-full bg-zinc-50">
    <Toolbar />
    <HSep />
    <view class="flex-row grow">
      <view class="w-[264] flex-col"><ProjectPanel /><LibraryPanel /></view>
      <VLine />
      <Center />
      <VLine />
      <view class="w-[340] flex-col"><RobotView /><Inspector /></view>
    </view>
    <HSep />
    <StatusBar />
    <Ghost />
    <Dialogs />
  </view>;
}

// ---------------------------------------------------------------- start
function shortcuts(e: ui.KeyEvent): void {
  if (dialog() !== '') { if (e.key === 'Escape') { closeDialog(); e.preventDefault(); } return; }
  if (e.primary) {
    if (e.key === 's') save();
    else if (e.key === 'z' && e.shift) model.redo();
    else if (e.key === 'z') model.undo();
    else if (e.key === 'y') model.redo();
    else if (e.key === 'd') model.duplicateSelected();
    else if (e.key === 'r') run();
    else if (e.key === 'o') openDialog('open');
    else if (e.key === 'n') openDialog('new');
    else if (e.key === '.') runner.stop();
    else return;
    e.preventDefault();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { model.removeSelected(); e.preventDefault(); }
  else if (e.key === 'Escape') { model.select([]); e.preventDefault(); }
}

/** Starts the UI: opens `dir` (or the last project, or the hello-flow sample). */
export function startApp(dir: string): void {
  setOpenHook((d: string) => openProjectDir(d));
  setRunHook(() => run());
  docs.onOpenExample((d: string) => openProjectDir(d));
  runner.onAppStarted((t: string) => { if (t === 'preview') devices.connectLocalPreview(); });
  runner.onAppStopped(() => { if (devices.previewTarget() === `127.0.0.1:${runner.PREVIEW_PORT}`) devices.disconnectPreview(); });
  runner.loadPlugins();
  devices.startDiscovery();
  ui.onKey((e: ui.KeyEvent) => shortcuts(e));
  const recent = model.recentProjects();
  const first = dir !== '' ? dir : recent.length > 0 ? recent[0] : docs.sampleDir('hello-flow');
  const demo = sys.env('STUDIO_DEMO') === '1';
  if (demo || sys.env('STUDIO_SHOW').startsWith('run:')) openDemoCopy(first); else openProjectDir(first);
  // the web view is a native layer above the UI: shown only on the Docs tab with no dialog open
  createEffect(() => { if (centerTab() === 'Docs' && dialog() === '') docs.show(); else docs.hide(); });
  const root = ui.createNode(ui.VIEW);
  ui.insert(root, App(), -1);
  const show = sys.env('STUDIO_SHOW');
  let frames = 0, acc = 0;
  ui.mount(root, 0xfafafa, (dt: number) => {
    frames++;
    if (fitPending > 0) { fitPending--; if (fitPending === 0) graph.fitView(); }
    tickLogs();
    acc += dt;
    if (acc >= 1) { acc = 0; devices.updateStats(); }
    if (demo) demoStep(frames);
    if (frames === 30 && show !== '') showState(show);
  });
}

// ---------------------------------------------------------------- STUDIO_DEMO=1: a scripted session (screenshots)
// Uses the zinc:ui test hooks (the real mouse and keyboard are ignored from the first call): drags a Random box
// from the library onto the diagram, links Delay.onDone -> Random.onStart and Random.value -> Log.message,
// then runs the project with the Preview target.
/** The demo edits and saves: it works on a copy in $TMPDIR, never on the sample itself. */
async function openDemoCopy(src: string): Promise<void> {
  // the real path: macOS TMPDIR is under the /var -> /private/var symlink, which breaks relative imports of sim builds
  const r = await proc.run('realpath', [sys.env('TMPDIR') !== '' ? sys.env('TMPDIR') : '/tmp'], {});
  const dst = join(r.stdout.trim(), 'zincstudio-demo.zproj');
  await proc.run('rm', ['-rf', dst], {});
  await proc.run('cp', ['-R', src, dst], {});
  openProjectDir(dst);
}
/** STUDIO_SHOW=code | script | docs | docs-bridge | devices | open | new | asset:<name> | box:<id> | invalid | run:<target>:
 *  a state for screenshots and scripted checks (run:* works on a copy of the project, like STUDIO_DEMO). */
function showState(s: string): void {
  if (s === 'code') setCenterTab('Generated code');
  else if (s === 'docs' || s === 'docs-bridge') setCenterTab('Docs');
  else if (s === 'script') { model.addBox('script', 420, 260); setCenterTab('Script'); }
  else if (s === 'devices' || s === 'open' || s === 'new') openDialog(s);
  else if (s.startsWith('asset:')) model.selectAsset(s.slice(6));
  else if (s.startsWith('box:')) model.select([s.slice(4)]);
  else if (s === 'invalid') { const b = model.findBox('b2'); if (b !== null) { model.select([b.id]); model.setParam(b, 'seconds', '-3'); } }
  else if (s.startsWith('run:')) { model.setTarget(s.slice(4)); run(); }
}
function center(h: i32): number[] { const b = ui.screenBox(h); return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
function drag(x0: number, y0: number, x1: number, y1: number): void {
  ui.pointerAt(x0, y0, true);
  for (let k = 1; k <= 4; k++) ui.pointerAt(x0 + (x1 - x0) * k / 4, y0 + (y1 - y0) * k / 4, true);
  ui.pointerAt(x1, y1, false);
}
function demoStep(frame: i32): void {
  if (frame === 20) {
    const item = center(ui.find('Random'));
    const p = graph.portScreen('b2', 'onDone', true);
    drag(item[0], item[1], p[0] + 140, p[1] + 150);
    runner.log('studio', 'demo: dropped a Random box');
  } else if (frame === 30) {
    const b = model.boxes()[model.boxes().length - 1];
    let a = graph.portScreen('b2', 'onDone', true), c = graph.portScreen(b.id, 'onStart', false);
    drag(a[0], a[1], c[0], c[1]);
    a = graph.portScreen(b.id, 'value', true); c = graph.portScreen('b3', 'message', false);
    drag(a[0], a[1], c[0], c[1]);
    const n = model.links().length;
    model.undo();
    const undone = model.links().length;
    model.redo();
    runner.log('studio', `demo: linked, ${n} links (undo: ${undone}, redo: ${model.links().length})`);
  } else if (frame === 35) {
    // shift+drag on the background: rectangle selection around the first two boxes, duplicate, undo
    const a = graph.portScreen('b1', 'onStart', false), c = graph.portScreen('b2', 'onDone', true);
    ui.pointerAt(a[0] - 30, a[1] - 60, true, 0, ui.SHIFT);
    ui.pointerAt(c[0] + 20, c[1] + 60, true, 0, ui.SHIFT);
    ui.pointerAt(c[0] + 20, c[1] + 60, false, 0, ui.SHIFT);
    const sel = model.selection().join(',');
    model.duplicateSelected();
    const dup = model.boxes().length;
    model.undo();
    runner.log('studio', `demo: rectangle selected ${sel}; duplicate -> ${dup} boxes, undo -> ${model.boxes().length}`);
    model.select([model.boxes()[model.boxes().length - 1].id]);
  } else if (frame === 40) {
    model.setTarget('preview');
    run();
  }
}
