// The storyboard editor of the museum table (ZN-650.07): a desktop tool, mouse and keyboard, with which a museum makes its own installation
// without opening the project file. It edits one project file (docs/museum-table-format.md) whose directory holds the media, and writes
// exactly what the player reads (serializeProject of ../src/project.ts).
//   zinc run examples/museum-table/editor                       a new project (Save asks where)
//   zinc run examples/museum-table/editor -- path/project.json   that project, or a new one saved there when the file does not exist
import { createSignal, createMemo, render, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { args, env } from 'zinc:sys';
import { exists } from 'zinc:fs';
import { quit } from 'zinc:gfx';
import { onCloseRequested, keepOpen } from 'zinc:system/window';
import { Sequence } from '../src/project';
import { Problem } from './doc';
import { doc, project, path, status, lang, setLang, selected, select, zoom, zoomBy, fit, viewW, viewH, addSequenceInView, duplicateSelected, deleteSelection, undo, redo, save, saveAs,
  newProjectCommand, openCommand, openFile, newFile, waiting, answer, goTo, nameIt, setNameIt, deleting, setDeleting, deleteSequence, linksTo, advanced, setAdvanced, nextLanguage,
  startHere, guard } from './state';
import { Ico, Tool, Segmented, Heading, ACCENT, DANGER, WARN, MUTED } from './widgets';
import { Storyboard } from './storyboard';
import { Inspector } from './inspector';

const never = (): boolean => false;
function Divider(): i32 { return <view class="w-px h-5 mx-1 bg-zinc-800" />; }

function TopBar(): i32 {
  const file = (): string => path().length > 0 ? path().slice(path().lastIndexOf('/') + 1) : 'Not saved yet';
  return <view class="flex-row items-center gap-1 h-12 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
    <Ico name="landmark" size={18} color={ACCENT} />
    <view class="flex-col ml-2 mr-3" style={{ maxWidth: 260 }}>
      <text class="truncate text-sm font-bold text-zinc-100">{project().say(project().title, lang())}</text>
      <view class="flex-row items-center gap-2">
        <text class="truncate text-[11px] text-zinc-500">{file()}</text>
        <Show when={doc().dirty}>
          <view class="flex-row items-center gap-1">
            <view class="w-[6] h-[6] rounded-full bg-amber-400" />
            <text class="text-[11px] text-amber-300">Unsaved changes</text>
          </view>
        </Show>
      </view>
    </view>
    <Divider />
    <Tool icon="file-plus" label="New" look="quiet" off={never} onClick={newProjectCommand} />
    <Tool icon="folder-open" label="Open" look="quiet" off={never} onClick={openCommand} />
    <Tool icon="save" label="Save" look="plain" off={() => !doc().dirty} onClick={() => { save(); }} />
    <Tool icon="save-all" label="Save as" look="quiet" off={never} onClick={() => { saveAs(); }} />
    <Divider />
    <Tool icon="undo-2" label="Undo" look="quiet" off={() => !doc().canUndo} onClick={undo} />
    <Tool icon="redo-2" label="Redo" look="quiet" off={() => !doc().canRedo} onClick={redo} />
    <Divider />
    <Tool icon="plus" label="New sequence" look="primary" off={never} onClick={addSequenceInView} />
    <view class="grow" />
    <Tool icon="minus" label="" look="quiet" off={never} onClick={() => zoomBy(-1, viewW / 2, viewH / 2)} />
    <text class="w-[40] text-center text-xs text-zinc-300">{`${Math.round(zoom() * 100)}%`}</text>
    <Tool icon="plus" label="" look="quiet" off={never} onClick={() => zoomBy(1, viewW / 2, viewH / 2)} />
    <Tool icon="maximize" label="Fit" look="quiet" off={never} onClick={fit} />
    <Divider />
    <button class={`flex-row items-center h-8 px-[10] rounded-md cursor-pointer ${advanced() ? 'bg-zinc-700' : 'bg-zinc-900 hover:bg-zinc-800'}`} onClick={() => setAdvanced(!advanced())}>
      <text class={`text-xs font-bold ${advanced() ? 'text-white' : 'text-zinc-400'}`}>Advanced</text>
    </button>
    <view class="w-[92]"><Segmented options={project().languages} labels={project().languages.map((l: string) => l.toUpperCase())} value={lang} onPick={setLang} /></view>
  </view>;
}

const problems = createMemo<Problem[]>(() => doc().problems(), []);
const [problemsOpen, setProblemsOpen] = createSignal<boolean>(true);
/** What the project would do wrong on the table; a click on a line selects what it is about. */
function Problems(): i32 {
  const errors = (): i32 => problems().filter((p: Problem) => p.level === 'error').length;
  return <view class="flex-col shrink-0 bg-zinc-900 border-t border-zinc-800">
    <button class="flex-row items-center gap-2 h-8 px-3 cursor-pointer bg-zinc-900 hover:bg-zinc-800" onClick={() => setProblemsOpen(!problemsOpen())}>
      <Ico name="circle-alert" size={14} color={MUTED} />
      <text class="text-xs font-bold text-zinc-200">Problems</text>
      <text class={`text-xs ${problems().length === 0 ? 'text-zinc-500' : errors() > 0 ? 'text-red-400' : 'text-orange-300'}`}>
        {project().sequences.length === 0 ? 'Nothing to check yet' : problems().length === 0 ? 'None: the project is ready for the table' : `${problems().length}`}
      </text>
      <view class="grow" />
      <text class="text-[11px] text-zinc-500">{problemsOpen() ? 'Hide' : 'Show'}</text>
    </button>
    <Show when={problemsOpen() && problems().length > 0}>
      <scroll class="flex-col px-2 pb-2" style={{ maxHeight: 112 }}>
        <For each={problems()}>{(p: Problem, i: i32) => <button class="flex-row items-center gap-2 h-7 px-2 rounded cursor-pointer bg-zinc-900 hover:bg-zinc-800" onClick={() => goTo(p)}>
          <Ico name={p.level === 'error' ? 'circle-alert' : 'triangle-alert'} size={13} color={p.level === 'error' ? DANGER : WARN} />
          <text class="grow truncate text-xs text-zinc-300">{p.message}</text>
        </button>}</For>
      </scroll>
    </Show>
  </view>;
}
function StatusBar(): i32 {
  return <view class="flex-row items-center h-7 px-3 shrink-0 bg-zinc-950 border-t border-zinc-800">
    <text class="grow truncate text-[11px] text-zinc-400">{status()}</text>
    <text class="text-[11px] text-zinc-600">{doc().canUndo ? `Undo: ${doc().undoLabel}` : ''}</text>
  </view>;
}
/** A question over the whole window: nothing under it answers until it is closed. */
function Modal(p: { children: () => i32 }): i32 {
  return <view class="absolute inset-0 items-center justify-center bg-black/60" onPointerDown={(e: ui.PointerEvent) => {}} onWheel={(e: ui.PointerEvent) => {}} onDoubleClick={(e: ui.PointerEvent) => {}}>
    <view class="w-[460] flex-col gap-2 p-6 rounded-xl bg-zinc-900 border border-zinc-700 shadow-lg">{p.children()}</view>
  </view>;
}
/** A button of a question. `look`: 'plain', 'primary' or 'danger'. */
function Choice(p: { label: string; look: string; onClick: () => void }): i32 {
  const fill = p.look === 'primary' ? 'bg-amber-400 hover:bg-amber-300' : p.look === 'danger' ? 'bg-red-500 hover:bg-red-400' : 'bg-zinc-900 border border-zinc-700 hover:bg-zinc-800';
  return <button class={`flex-row items-center justify-center h-9 px-4 rounded-md cursor-pointer ${fill}`} onClick={p.onClick}>
    <text class={`text-sm font-bold ${p.look === 'plain' ? 'text-zinc-100' : 'text-zinc-900'}`}>{p.label}</text>
  </button>;
}
/** Unsaved work is never dropped without this question. */
function Unsaved(): i32 {
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">Save the changes to this project?</text>
    <text class="text-sm text-zinc-400">The changes made since the last save are lost if they are not saved.</text>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label="Cancel" look="plain" onClick={() => { answer('stay'); }} />
      <Choice label="Do not save" look="plain" onClick={() => { answer('drop'); }} />
      <Choice label="Save" look="primary" onClick={() => { answer('save'); }} />
    </view>
  </Modal>;
}
/** Deleting a sequence that links lead to: the author says whether they go with it or lead to another sequence. */
function Deleting(): i32 {
  const s = (): Sequence | null => deleting();
  const name = (): string => { const d = s(); return d === null ? '' : project().say(d.title, lang()); };
  const n = (): i32 => { const d = s(); return d === null ? 0 : linksTo(d); };
  const others = (): Sequence[] => project().sequences.filter((o: Sequence) => o !== s());
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{`Delete "${name()}"?`}</text>
    <text class="text-sm text-zinc-400">{`${n() === 1 ? 'One link leads' : `${n()} links lead`} to this sequence. ${n() === 1 ? 'It can' : 'They can'} be deleted with it, or lead to another sequence instead.`}</text>
    <view class="mt-3"><Heading label={n() === 1 ? 'Lead the link to' : 'Lead the links to'} /></view>
    <scroll class="flex-col gap-1" style={{ maxHeight: 190 }}>
      <For each={others()}>{(o: Sequence, i: i32) => <button class="flex-row items-center justify-start gap-2 h-8 px-3 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-amber-400"
        onClick={() => { const d = s(); if (d !== null) deleteSequence(d, o); }}>
        <Ico name="arrow-right" size={13} color={ACCENT} />
        <text class="truncate text-sm text-zinc-100" style={{ maxWidth: 360 }}>{project().say(o.title, lang())}</text>
      </button>}</For>
    </scroll>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label="Cancel" look="plain" onClick={() => setDeleting(null)} />
      <Choice label={n() === 1 ? 'Delete it with its link' : `Delete it with its ${n()} links`} look="danger" onClick={() => { const d = s(); if (d !== null) deleteSequence(d, null); }} />
    </view>
  </Modal>;
}
function App(): i32 {
  return <view class="relative flex-col w-full h-full bg-zinc-950">
    <TopBar />
    <view class="grow flex-row">
      <view class="grow flex-col">
        <Storyboard />
        <Problems />
      </view>
      <Inspector />
    </view>
    <StatusBar />
    <Show when={deleting() !== null}><Deleting /></Show>
    <Show when={waiting() !== null}><Unsaved /></Show>
  </view>;
}

// keys reach here when no text field used them: Cmd+Z in a field undoes its typing, elsewhere the last step of the document
ui.onKey((e: ui.KeyEvent) => {
  const k = e.key;
  if (waiting() !== null) { if (k === 'Escape') { answer('stay'); e.preventDefault(); } return; }
  if (deleting() !== null) { if (k === 'Escape') { setDeleting(null); e.preventDefault(); } return; }
  if (e.primary) {
    if (k === 's') { if (e.shift) saveAs(); else save(); }
    else if (k === 'z') { if (e.shift) redo(); else undo(); }
    else if (k === 'y') redo();
    else if (k === 'o') openCommand();
    else if (k === 'n') newProjectCommand();
    else if (k === 'd') duplicateSelected();
    else if (k === '0') fit();
    else if (k === '=') zoomBy(1, viewW / 2, viewH / 2);
    else if (k === '-') zoomBy(-1, viewW / 2, viewH / 2);
    else if (k === 'e') setAdvanced(!advanced());
    else return;
    e.preventDefault();
    return;
  }
  if (k === 'Delete' || k === 'Backspace') { deleteSelection(); e.preventDefault(); }
  else if (k === 'Enter' && selected() !== null) { setNameIt(nameIt() + 1); e.preventDefault(); }
  else if (k === 'Escape' && selected() !== null) { select(null, null); e.preventDefault(); }
  else if (k === 'n') { addSequenceInView(); e.preventDefault(); }
  else if (k === 's' && selected() !== null) { startHere(); e.preventDefault(); }
  else if (k === 'l') { nextLanguage(); e.preventDefault(); }
});

const a = args();
if (a.length > 0) {
  // ponytail: `zinc run <dir>` starts the program in the project's directory; the shell's PWD still says where the command was typed, so a
  // relative path means what the user meant. A launch directory in zinc:sys would replace this.
  const file = a[0].startsWith('/') || env('PWD').length === 0 ? a[0] : `${env('PWD')}/${a[0]}`;
  if (exists(file)) openFile(file); else newFile(file);
}
// closing the window with unsaved work asks first
let frames = 0;
onCloseRequested(() => { if (doc().dirty) { keepOpen(); guard(() => quit()); } });
// the view knows its size once it was drawn: the first fit waits for that
render(App, 0x09090b, (dt: number) => { if (++frames === 2) fit(); });
