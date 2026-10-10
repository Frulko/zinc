// The storyboard editor of the museum table (ZN-650.07): a desktop tool, mouse and keyboard, with which a museum makes its own installation
// without opening the project file. It edits one project file (docs/museum-table-format.md) whose directory holds the media, and writes
// exactly what the player reads (serializeProject of ../src/project.ts).
//   zinc run examples/museum-table/editor                       a new project (Save asks where)
//   zinc run examples/museum-table/editor -- path/project.json   that project, or a new one saved there when the file does not exist
// Two views: the storyboard (storyboard.tsx) and the table of one sequence (sequence.tsx); the panel at the right is inspector.tsx. Every text
// of the interface is in strings.ts, in English and French.
import { createSignal, createMemo, render, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { args, env } from 'zinc:sys';
import { exists } from 'zinc:fs';
import { quit } from 'zinc:gfx';
import { onCloseRequested, keepOpen } from 'zinc:system/window';
import { Sequence, Media } from '../src/project';
import { Problem } from './doc';
import { doc, project, path, status, lang, setLang, selected, select, zoomBy, fit, viewW, viewH, addSequenceInView, duplicateSelected, deleteSelection, undo, redo, save, saveAs,
  newProjectCommand, openCommand, openFile, newFile, waiting, answer, goTo, problemText, nameIt, setNameIt, deleting, setDeleting, deleteSequence, linksTo, advanced, setAdvanced, nextLanguage,
  startHere, guard, opened, openSequence, closeSequence, selectedItem, selectedLink, shownMedia, pick, picking, answerPick, adding, setAdding, addFile, addWrittenText, newFiles, kindOfFile,
  folder, removing, setRemoving, removeMedia, usesOf } from './state';
import { Ico, Tool, Segmented, Heading, ACCENT, DANGER, WARN, MUTED } from './widgets';
import { Storyboard } from './storyboard';
import { SequenceEditor } from './sequence';
import { Inspector } from './inspector';
import * as L from './strings';
import { t, f, uiLang, setUiLang } from './strings';

const never = (): boolean => false;
function Divider(): i32 { return <view class="w-px h-5 mx-1 bg-zinc-800" />; }
function say(s: Sequence | null): string { return s === null ? '' : project().say(s.title, lang()); }

function TopBar(): i32 {
  const file = (): string => path().length > 0 ? path().slice(path().lastIndexOf('/') + 1) : t(L.NOT_SAVED_YET);
  return <view class="flex-row items-center gap-1 h-12 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
    <Ico name="landmark" size={18} color={ACCENT} />
    <view class="flex-col ml-2 mr-3" style={{ maxWidth: 230 }}>
      <text class="truncate text-sm font-bold text-zinc-100">{project().say(project().title, lang())}</text>
      <view class="flex-row items-center gap-2">
        <text class="truncate text-[11px] text-zinc-500">{file()}</text>
        <Show when={doc().dirty}>
          <view class="flex-row items-center gap-1">
            <view class="w-[6] h-[6] rounded-full bg-amber-400" />
            <text class="text-[11px] text-amber-300">{t(L.UNSAVED)}</text>
          </view>
        </Show>
      </view>
    </view>
    <Divider />
    <Tool icon="file-plus" label={t(L.NEW)} look="quiet" off={never} onClick={newProjectCommand} />
    <Tool icon="folder-open" label={t(L.OPEN)} look="quiet" off={never} onClick={openCommand} />
    <Tool icon="save" label={t(L.SAVE)} look="plain" off={() => !doc().dirty} onClick={() => { save(); }} />
    <Tool icon="save-all" label={t(L.SAVE_AS)} look="quiet" off={never} onClick={() => { saveAs(); }} />
    <Divider />
    <Tool icon="undo-2" label={t(L.UNDO)} look="quiet" off={() => !doc().canUndo} onClick={undo} />
    <Tool icon="redo-2" label={t(L.REDO)} look="quiet" off={() => !doc().canRedo} onClick={redo} />
    <Divider />
    <Show when={opened() === null}><Tool icon="plus" label={t(L.NEW_SEQUENCE)} look="primary" off={never} onClick={addSequenceInView} /></Show>
    <Show when={opened() !== null}>
      <view class="flex-row items-center gap-2">
        <Tool icon="chevron-left" label={t(L.STORYBOARD)} look="plain" off={never} onClick={closeSequence} />
        <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 220 }}>{say(opened())}</text>
      </view>
    </Show>
    <view class="grow" />
    <button class={`flex-row items-center h-8 px-[10] rounded-md cursor-pointer ${advanced() ? 'bg-zinc-700' : 'bg-zinc-900 hover:bg-zinc-800'}`} onClick={() => setAdvanced(!advanced())}>
      <text class={`text-xs font-bold ${advanced() ? 'text-white' : 'text-zinc-400'}`}>{t(L.ADVANCED)}</text>
    </button>
    <Divider />
    <text class="text-[11px] text-zinc-500 mr-1">{t(L.CONTENT)}</text>
    <For each={[project().languages.join(' ')]}>{(codes: string, i: i32) =>
      <view class="w-[92]"><Segmented options={codes.split(' ')} labels={codes.split(' ').map((code: string) => code.toUpperCase())} value={lang} onPick={setLang} /></view>}</For>
  </view>;
}

const problems = createMemo<Problem[]>(() => doc().problems(), []);
const [problemsOpen, setProblemsOpen] = createSignal<boolean>(true);
/** What the project would do wrong on the table; a click on a line selects what it is about. */
function Problems(): i32 {
  const errors = (): i32 => problems().filter((p: Problem) => p.level === 'error').length;
  return <view class="flex-col shrink-0 bg-zinc-900 border-t border-zinc-800">
    <button class="flex-row items-center justify-start gap-2 h-8 px-3 cursor-pointer bg-zinc-900 hover:bg-zinc-800" onClick={() => setProblemsOpen(!problemsOpen())}>
      <Ico name="circle-alert" size={14} color={MUTED} />
      <text class="text-xs font-bold text-zinc-200">{t(L.PROBLEMS)}</text>
      <text class={`text-xs ${problems().length === 0 ? 'text-zinc-500' : errors() > 0 ? 'text-red-400' : 'text-orange-300'}`}>
        {project().sequences.length === 0 ? t(L.NOTHING_TO_CHECK) : problems().length === 0 ? t(L.NO_PROBLEM) : `${problems().length}`}
      </text>
      <view class="grow" />
      <text class="text-[11px] text-zinc-500">{t(problemsOpen() ? L.HIDE : L.SHOW)}</text>
    </button>
    <Show when={problemsOpen() && problems().length > 0}>
      <scroll class="flex-col px-2 pb-2" style={{ maxHeight: 112 }}>
        <For each={problems()}>{(p: Problem, i: i32) => <button class="flex-row items-center justify-start gap-2 h-7 px-2 rounded cursor-pointer bg-zinc-900 hover:bg-zinc-800" onClick={() => goTo(p)}>
          <Ico name={p.level === 'error' ? 'circle-alert' : 'triangle-alert'} size={13} color={p.level === 'error' ? DANGER : WARN} />
          <text class="truncate text-xs text-zinc-300" style={{ maxWidth: 900 }}>{problemText(p)}</text>
        </button>}</For>
      </scroll>
    </Show>
  </view>;
}
/** The last thing done, what Undo would take back, and the language of the interface. */
function StatusBar(): i32 {
  return <view class="flex-row items-center gap-3 h-8 px-3 shrink-0 bg-zinc-950 border-t border-zinc-800">
    <text class="grow truncate text-[11px] text-zinc-400">{status()}</text>
    <text class="text-[11px] text-zinc-600">{doc().canUndo ? f(L.UNDO_NEXT, L.step(doc().undoLabel)) : ''}</text>
    <text class="text-[11px] text-zinc-500">{t(L.INTERFACE)}</text>
    <view class="w-[150]"><Segmented options={['en', 'fr']} labels={['English', 'Français']} value={uiLang} onPick={setUiLang} /></view>
  </view>;
}

// ---------------------------------------------------------------- questions over the window

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
/** A sequence to choose in a list. */
function SequenceRow(p: { of: Sequence; onPick: () => void }): i32 {
  return <button class="flex-row items-center justify-start gap-2 h-8 px-3 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-amber-400" onClick={p.onPick}>
    <Ico name="arrow-right" size={13} color={ACCENT} />
    <text class="truncate text-sm text-zinc-100" style={{ maxWidth: 330 }}>{say(p.of)}</text>
  </button>;
}
/** Unsaved work is never dropped without this question. */
function Unsaved(): i32 {
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{t(L.ASK_SAVE)}</text>
    <text class="text-sm text-zinc-400">{t(L.ASK_SAVE_WHY)}</text>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label={t(L.CANCEL)} look="plain" onClick={() => { answer('stay'); }} />
      <Choice label={t(L.DO_NOT_SAVE)} look="plain" onClick={() => { answer('drop'); }} />
      <Choice label={t(L.SAVE)} look="primary" onClick={() => { answer('save'); }} />
    </view>
  </Modal>;
}
/** Deleting a sequence that links lead to: the author says whether they go with it or lead to another sequence. */
function Deleting(): i32 {
  const s = (): Sequence | null => deleting();
  const n = (): i32 => { const d = s(); return d === null ? 0 : linksTo(d); };
  const others = (): Sequence[] => project().sequences.filter((o: Sequence) => o !== s());
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{f(L.ASK_DELETE, say(s()))}</text>
    <text class="text-sm text-zinc-400">{n() === 1 ? t(L.ONE_LEADS) : f(L.N_LEAD, `${n()}`)}</text>
    <view class="mt-3"><Heading label={t(n() === 1 ? L.LEAD_ONE_TO : L.LEAD_N_TO)} /></view>
    <scroll class="flex-col gap-1" style={{ maxHeight: 190 }}>
      <For each={others()}>{(o: Sequence, i: i32) => <SequenceRow of={o} onPick={() => { const d = s(); if (d !== null) deleteSequence(d, o); }} />}</For>
    </scroll>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label={t(L.CANCEL)} look="plain" onClick={() => setDeleting(null)} />
      <Choice label={n() === 1 ? t(L.DELETE_WITH_ONE) : f(L.DELETE_WITH_N, `${n()}`)} look="danger" onClick={() => { const d = s(); if (d !== null) deleteSequence(d, null); }} />
    </view>
  </Modal>;
}
/** Removing a medium that lies on tables. */
function Removing(): i32 {
  const m = (): Media | null => removing();
  const n = (): i32 => { const x = m(); return x === null ? 0 : usesOf(x); };
  const name = (): string => { const x = m(); return x === null ? '' : project().say(x.title, lang()); };
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{f(L.ASK_REMOVE_MEDIA, name())}</text>
    <text class="text-sm text-zinc-400">{n() === 1 ? t(L.ONE_USE) : f(L.N_USES, `${n()}`)}</text>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label={t(L.CANCEL)} look="plain" onClick={() => setRemoving(null)} />
      <Choice label={t(L.REMOVE)} look="danger" onClick={() => { const x = m(); if (x !== null) removeMedia(x); }} />
    </view>
  </Modal>;
}
/** "Where does it lead?": a sequence chosen in a list, or pointed at on a small map of the storyboard. */
function Picking(): i32 {
  const MAP_W = 412, MAP_H = 150, NODE_W = 64, NODE_H = 30;
  const others = (): Sequence[] => project().sequences.filter((o: Sequence) => o !== selected());
  const box = (): number[] => {
    const all = project().sequences;
    let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
    if (all.length > 0) { x0 = all[0].storyX; x1 = x0; y0 = all[0].storyY; y1 = y0; }
    for (const s of all) { x0 = Math.min(x0, s.storyX); x1 = Math.max(x1, s.storyX); y0 = Math.min(y0, s.storyY); y1 = Math.max(y1, s.storyY); }
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
  };
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{t(L.WHERE_TO)}</text>
    <text class="text-sm text-zinc-400">{t(L.WHERE_TO_HOW)}</text>
    <view class="relative mt-2 rounded-md bg-zinc-950 border border-zinc-800" style={{ width: MAP_W, height: MAP_H }}>
      <For each={project().sequences}>{(s: Sequence, i: i32) => {
        const here = s === selected();
        return <button class={`absolute flex-row items-center justify-center px-1 rounded border ${here ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-700 border-zinc-500 hover:border-amber-400 hover:bg-zinc-600 cursor-pointer'}`}
          style={{ left: 8 + (s.storyX - box()[0]) / box()[2] * (MAP_W - 16 - NODE_W), top: 8 + (s.storyY - box()[1]) / box()[3] * (MAP_H - 16 - NODE_H), width: NODE_W, height: NODE_H }}
          onClick={() => { if (!here) answerPick(s); }}>
          <text class={`truncate text-[9px] ${here ? 'text-zinc-500' : 'text-zinc-100'}`} style={{ maxWidth: NODE_W - 8 }}>{say(s)}</text>
        </button>;
      }}</For>
    </view>
    <scroll class="flex-col gap-1 mt-2" style={{ maxHeight: 150 }}>
      <For each={others()}>{(o: Sequence, i: i32) => <SequenceRow of={o} onPick={() => answerPick(o)} />}</For>
    </scroll>
    <view class="flex-row justify-end gap-2 mt-4"><Choice label={t(L.CANCEL)} look="plain" onClick={() => answerPick(null)} /></view>
  </Modal>;
}
const FIELD = 'h-8 px-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 focus:border-amber-400';
function Asked(p: { label: string; value: () => string; onInput: (v: string) => void }): i32 {
  return <view class="flex-col gap-1">
    <text class="text-[11px] text-zinc-400">{p.label}</text>
    <input class={`w-full ${FIELD}`} placeholder={t(L.REQUIRED)} value={p.value()} onInput={p.onInput} />
  </view>;
}
/** "photos/great-wave.jpg" gives "Great wave": the title a file is offered with. */
function titleFromFile(file: string): string {
  const name = file.slice(file.lastIndexOf('/') + 1), words = name.slice(0, name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length).replaceAll('-', ' ').replaceAll('_', ' ');
  return words.slice(0, 1).toUpperCase() + words.slice(1);
}
/** Adding a file of the project folder to the library: which file, then its title, where it comes from and its licence. */
function AddingFile(): i32 {
  const files = newFiles();
  const [file, setFile] = createSignal<string>('');
  const [title, setTitle] = createSignal<string>('');
  const [source, setSource] = createSignal<string>('');
  const [licence, setLicence] = createSignal<string>('');
  const [panorama, setPanorama] = createSignal<string>('photo');
  const [missing, setMissing] = createSignal<boolean>(false);
  const add = (): void => {
    const kind = kindOfFile(file()) === 'photo' ? panorama() : kindOfFile(file());
    if (!addFile(kind, file(), title(), source(), licence())) setMissing(true);
  };
  return <Modal>
    <Show when={file().length === 0}>
      <view class="flex-col gap-2">
        <text class="text-lg font-bold text-zinc-100">{t(L.CHOOSE_FILE)}</text>
        <Show when={files.length === 0}><text class="text-sm text-zinc-400">{f(L.NO_NEW_FILE, folder())}</text></Show>
        <scroll class="flex-col gap-1" style={{ maxHeight: 300 }}>
          {files.map((name: string, i: i32) => <button class="flex-row items-center justify-start gap-2 h-8 px-3 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-amber-400"
            onClick={() => { setTitle(titleFromFile(name)); setFile(name); }}>
            <text class="truncate text-sm text-zinc-100" style={{ maxWidth: 280 }}>{name}</text>
            <view class="grow" />
            <text class="text-[11px] text-zinc-500">{t(L.KIND_NAMES[['photo', 'model', 'panorama', 'text', 'audio', 'video'].indexOf(kindOfFile(name))])}</text>
          </button>)}
        </scroll>
        <view class="flex-row justify-end gap-2 mt-4"><Choice label={t(L.CANCEL)} look="plain" onClick={() => setAdding('')} /></view>
      </view>
    </Show>
    <Show when={file().length > 0}>
      <view class="flex-col gap-3">
        <text class="text-lg font-bold text-zinc-100 truncate">{f(L.NEW_MEDIA, file())}</text>
        <text class="text-sm text-zinc-400">{t(L.NEW_MEDIA_WHY)}</text>
        <Show when={kindOfFile(file()) === 'photo'}>
          <Segmented options={['photo', 'panorama']} labels={[t(L.AS_PHOTO), t(L.AS_PANORAMA)]} value={panorama} onPick={setPanorama} />
        </Show>
        <Asked label={`${t(L.CAPTION)} (${project().languages[0].toUpperCase()})`} value={title} onInput={setTitle} />
        <Asked label={t(L.SOURCE)} value={source} onInput={setSource} />
        <Asked label={t(L.LICENCE)} value={licence} onInput={setLicence} />
        <Show when={missing()}><text class="text-xs text-orange-300">{t(L.MISSING)}</text></Show>
        <view class="flex-row justify-end gap-2 mt-2">
          <Choice label={t(L.CANCEL)} look="plain" onClick={() => setAdding('')} />
          <Choice label={t(L.ADD)} look="primary" onClick={add} />
        </view>
      </view>
    </Show>
  </Modal>;
}
/** Writing a text medium: its title and its words, in the first language (the others are written in the panel). */
function AddingText(): i32 {
  const [title, setTitle] = createSignal<string>('');
  const [body, setBody] = createSignal<string>('');
  const [missing, setMissing] = createSignal<boolean>(false);
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{t(L.NEW_TEXT)}</text>
    <text class="text-sm text-zinc-400">{t(L.NEW_TEXT_WHY)}</text>
    <Asked label={`${t(L.TITLE)} (${project().languages[0].toUpperCase()})`} value={title} onInput={setTitle} />
    <text class="text-[11px] text-zinc-400">{`${t(L.BODY)} (${project().languages[0].toUpperCase()})`}</text>
    <textarea class="w-full p-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 focus:border-amber-400" rows={4} placeholder={t(L.REQUIRED)} value={body()} onInput={setBody} />
    <Show when={missing()}><text class="text-xs text-orange-300">{t(L.MISSING)}</text></Show>
    <view class="flex-row justify-end gap-2 mt-2">
      <Choice label={t(L.CANCEL)} look="plain" onClick={() => setAdding('')} />
      <Choice label={t(L.ADD)} look="primary" onClick={() => { if (!addWrittenText(title(), body())) setMissing(true); }} />
    </view>
  </Modal>;
}

/** The whole window. It is built again when the interface language changes: every view reads its texts once. */
function Shell(): i32 {
  return <view class="relative flex-col w-full h-full bg-zinc-950">
    <TopBar />
    <view class="grow basis-0 min-h-0 flex-row">
      <view class="grow basis-0 min-w-0 flex-col">
        <Show when={opened() === null}><Storyboard /></Show>
        <Show when={opened() !== null}><SequenceEditor /></Show>
        <Problems />
      </view>
      <Inspector />
    </view>
    <StatusBar />
    <Show when={picking() !== null}><Picking /></Show>
    <Show when={adding() === 'file'}><AddingFile /></Show>
    <Show when={adding() === 'text'}><AddingText /></Show>
    <Show when={removing() !== null}><Removing /></Show>
    <Show when={deleting() !== null}><Deleting /></Show>
    <Show when={waiting() !== null}><Unsaved /></Show>
  </view>;
}
function App(): i32 {
  return <view class="w-full h-full"><For each={[uiLang()]}>{(language: string, i: i32) => <Shell />}</For></view>;
}

/** Closes the question that is open; false when there was none. */
function dismiss(): boolean {
  if (waiting() !== null) answer('stay');
  else if (deleting() !== null) setDeleting(null);
  else if (removing() !== null) setRemoving(null);
  else if (picking() !== null) answerPick(null);
  else if (adding().length > 0) setAdding('');
  else return false;
  return true;
}
// keys reach here when no text field used them: Cmd+Z in a field undoes its typing, elsewhere the last step of the document
ui.onKey((e: ui.KeyEvent) => {
  const k = e.key;
  if (waiting() !== null || deleting() !== null || removing() !== null || picking() !== null || adding().length > 0) { if (k === 'Escape') { dismiss(); e.preventDefault(); } return; }
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
  const board = opened() === null;
  if (k === 'Delete' || k === 'Backspace') deleteSelection();
  else if (k === 'Escape' && !board) { if (selectedItem() !== null || selectedLink() !== null || shownMedia() !== null) pick(null, null, null); else closeSequence(); }
  else if (k === 'Escape' && selected() !== null) select(null, null);
  else if (k === 'l') nextLanguage();
  else if (board && k === 'Enter' && selected() !== null) setNameIt(nameIt() + 1);
  else if (board && k === 'n') addSequenceInView();
  else if (board && k === 's' && selected() !== null) startHere();
  else if (board && k === 'o' && selected() !== null) { const s = selected(); if (s !== null) openSequence(s); }
  else return;
  e.preventDefault();
});

const a = args();
if (a.length > 0) {
  // ponytail: `zinc run <dir>` starts the program in the project's directory; the shell's PWD still says where the command was typed, so a
  // relative path means what the user meant. A launch directory in zinc:sys would replace this.
  const file = a[0].startsWith('/') || env('PWD').length === 0 ? a[0] : `${env('PWD')}/${a[0]}`;
  if (exists(file)) openFile(file); else newFile(file);
}
// closing the window with unsaved work asks first
onCloseRequested(() => { if (doc().dirty) { keepOpen(); guard(() => quit()); } });
let frames = 0;
// the view knows its size once it was drawn: the first fit waits for that
render(App, 0x09090b, (dt: number) => { if (++frames === 2) fit(); });
