// The storyboard editor of the museum table (ZN-650.07): a desktop tool, mouse and keyboard, with which a museum makes its own installation
// without opening the project file. It edits one project file (docs/museum-table-format.md) whose directory holds the media, and writes
// exactly what the player reads (serializeProject of ../src/project.ts).
//   zinc run examples/museum-table/editor                       a new project (Save asks where)
//   zinc run examples/museum-table/editor -- path/project.json   that project, or a new one saved there when the file does not exist
//   zinc run examples/museum-table/editor -- path/project.json --story   the previews print what happens to the story, as the table's app does
//   zinc run examples/museum-table/editor -- path/project.json --log     prints where each point of interest is put and where it is drawn
// Two views: the storyboard (storyboard.tsx) and the table of one sequence (sequence.tsx); the panel at the right is inspector.tsx; the
// preview (preview.tsx) plays the project in their place, or in a window beside them. Every text of the interface is in strings.ts, in
// English and French.
import { createSignal, createMemo, createEffect, render, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { args, launchDir } from 'zinc:sys';
import { exists } from 'zinc:fs';
import { quit } from 'zinc:gfx';
import { onCloseRequested, keepOpen } from 'zinc:system/window';
import { on } from 'zinc:system';
import { Sequence, Media } from '../src/project';
import { Problem } from './doc';
import { doc, project, path, status, lang, setLang, selected, select, zoomBy, fit, viewW, viewH, addSequenceInView, duplicateSelected, deleteSelection, undo, redo, save, saveAs,
  newProjectCommand, openCommand, openFile, newFile, waiting, answer, goTo, problemText, nameIt, setNameIt, deleting, setDeleting, deleteSequence, linksTo, advanced, setAdvanced, nextLanguage,
  startHere, guard, opened, openSequence, closeSequence, selectedItem, selectedLink, shownMedia, pick, picking, answerPick, adding, setAdding, addFile, addWrittenText, newFiles, kindOfFile, perLanguage, measureTick,
  folder, removing, setRemoving, removeMedia, usesOf, pointing, selectedPoint, pickPoint, closePoints, setLogging, pickFrom, pickAsks, settings, openSettings, closeSettings, forgetting, setForgetting,
  removeLanguage, textsIn, dropped, dropFiles, cancelAdding, recovering, setRecovering, restoreBackup, discardBackup, offerBackup, backupTick } from './state';
import { perform, nudge, deleteChosen, chosenItems, chosenSequences, setMenus, toolsTick } from './tools';
import { recents } from './files';
import { Ico, Tool, Segmented, Heading, ACCENT, DANGER, WARN, MUTED, decodePictures } from './widgets';
import { Storyboard } from './storyboard';
import { SequenceEditor } from './sequence';
import { Inspector } from './inspector';
import { PointsEditor, pointsTick } from './points';
import { Settings } from './settings';
import { previewing, previewAt, playFromHere, stopPreview, PreviewPane, togglePreviewWindow, closePreviewWindow, previewTick, setTelling } from './preview';
import * as L from './strings';
import { t, f, uiLang, setUiLang } from './strings';

const never = (): boolean => false;
function Divider(): i32 { return <view class="w-px h-5 mx-1 bg-zinc-800" />; }
function say(s: Sequence | null): string { return s === null ? '' : project().say(s.title, lang()); }

function TopBar(): i32 {
  const file = (): string => path().length > 0 ? path().slice(path().lastIndexOf('/') + 1) : t(L.NOT_SAVED_YET);
  return <view class="flex-row items-center gap-1 h-12 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
    <Ico name="landmark" size={18} color={ACCENT} />
    <view class="flex-col ml-2 mr-3 cursor-pointer" style={{ maxWidth: 230 }} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) openSettings('project'); }}>
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
    <Show when={opened() === null && settings().length === 0}><Tool icon="plus" label={t(L.NEW_SEQUENCE)} look="primary" off={never} onClick={addSequenceInView} /></Show>
    <Show when={opened() !== null}>
      <view class="flex-row items-center gap-2">
        <Tool icon="chevron-left" label={t(L.STORYBOARD)} look="plain" off={never} onClick={closeSequence} />
        <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 220 }}>{say(opened())}</text>
      </view>
    </Show>
    <view class="grow" />
    <text class="text-[11px] text-zinc-500 mr-1">{t(L.CONTENT)}</text>
    <For each={[project().languages.join(' ')]}>{(codes: string, i: i32) =>
      <view style={{ width: 46 * codes.split(' ').length }}><Segmented options={codes.split(' ')} labels={codes.split(' ').map((code: string) => code.toUpperCase())} value={lang} onPick={setLang} /></view>}</For>
  </view>;
}

/** The bar of the preview: the way back, and where the visit is. */
function PreviewBar(): i32 {
  return <view class="flex-row items-center gap-2 h-12 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
    <Tool icon="chevron-left" label={t(L.BACK_TO_EDITING)} look="primary" off={never} onClick={stopPreview} />
    <Divider />
    <Ico name="play" size={15} color={ACCENT} />
    <text class="text-sm font-bold text-zinc-100">{t(L.PREVIEW)}</text>
    <text class="truncate text-sm text-zinc-400" style={{ maxWidth: 360 }}>{previewAt()}</text>
    <view class="grow" />
    <text class="truncate text-[11px] text-zinc-500" style={{ maxWidth: 640 }}>{t(L.PREVIEW_HINT)}</text>
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
/** The last thing done, what Undo would take back, the advanced mode and the language of the interface. */
function StatusBar(): i32 {
  return <view class="flex-row items-center gap-3 h-8 px-3 shrink-0 bg-zinc-950 border-t border-zinc-800">
    <text class="grow truncate text-[11px] text-zinc-400">{status()}</text>
    <text class="text-[11px] text-zinc-600">{doc().canUndo ? f(L.UNDO_NEXT, L.step(doc().undoLabel)) : ''}</text>
    <button class={`flex-row items-center h-6 px-2 rounded cursor-pointer ${advanced() ? 'bg-zinc-700' : 'bg-zinc-950 border border-zinc-800 hover:bg-zinc-800'}`} onClick={() => setAdvanced(!advanced())}>
      <text class={`text-[11px] font-bold ${advanced() ? 'text-white' : 'text-zinc-400'}`}>{t(L.ADVANCED)}</text>
    </button>
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
/** A backup of unsaved work was found at the start: the author takes it back, deletes it, or decides later (it is offered again). */
function Recovering(): i32 {
  const file = (): string => path().length > 0 ? path().slice(path().lastIndexOf('/') + 1) : t(L.NOT_SAVED_YET);
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{t(L.ASK_RESTORE)}</text>
    <text class="text-sm text-zinc-400">{f(L.ASK_RESTORE_WHY, file())}</text>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label={t(L.DECIDE_LATER)} look="plain" onClick={() => setRecovering('')} />
      <Choice label={t(L.DISCARD_BACKUP)} look="plain" onClick={discardBackup} />
      <Choice label={t(L.RESTORE)} look="primary" onClick={restoreBackup} />
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
/** Removing a language in which texts are written. */
function Forgetting(): i32 {
  const n = (): i32 => textsIn(forgetting());
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{f(L.ASK_REMOVE_LANGUAGE, L.languageName(forgetting()))}</text>
    <text class="text-sm text-zinc-400">{n() === 1 ? t(L.ONE_TEXT_LOST) : f(L.N_TEXTS_LOST, `${n()}`)}</text>
    <view class="flex-row justify-end gap-2 mt-4">
      <Choice label={t(L.CANCEL)} look="plain" onClick={() => setForgetting('')} />
      <Choice label={t(L.REMOVE)} look="danger" onClick={() => removeLanguage(forgetting())} />
    </view>
  </Modal>;
}
/** "Where does it lead?": a sequence chosen in a list, or pointed at on a small map of the storyboard. */
function Picking(): i32 {
  const MAP_W = 412, MAP_H = 150, NODE_W = 64, NODE_H = 30;
  const others = (): Sequence[] => project().sequences.filter((o: Sequence) => o !== pickFrom());
  const box = (): number[] => {
    const all = project().sequences;
    let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
    if (all.length > 0) { x0 = all[0].storyX; x1 = x0; y0 = all[0].storyY; y1 = y0; }
    for (const s of all) { x0 = Math.min(x0, s.storyX); x1 = Math.max(x1, s.storyX); y0 = Math.min(y0, s.storyY); y1 = Math.max(y1, s.storyY); }
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
  };
  return <Modal>
    <text class="text-lg font-bold text-zinc-100">{t(pickAsks())}</text>
    <text class="text-sm text-zinc-400">{t(L.WHERE_TO_HOW)}</text>
    <view class="relative mt-2 rounded-md bg-zinc-950 border border-zinc-800" style={{ width: MAP_W, height: MAP_H }}>
      <For each={project().sequences}>{(s: Sequence, i: i32) => {
        const here = s === pickFrom();
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
function titleFromFile(path: string): string {
  const file = perLanguage(path).replaceAll('.{lang}', '');   // "welcome.fr.mp3" is the welcome in every language
  const name = file.slice(file.lastIndexOf('/') + 1), words = name.slice(0, name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length).replaceAll('-', ' ').replaceAll('_', ' ');
  return words.slice(0, 1).toUpperCase() + words.slice(1);
}
/** Adding a file of the project folder to the library: which file, then its title, where it comes from and its licence. */
function AddingFile(): i32 {
  const files = newFiles();
  // a file dropped on the window is already chosen
  const [file, setFile] = createSignal<string>(dropped().length > 0 ? dropped()[0] : '');
  const [title, setTitle] = createSignal<string>(dropped().length > 0 ? titleFromFile(dropped()[0]) : '');
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
        <view class="flex-row justify-end gap-2 mt-4"><Choice label={t(L.CANCEL)} look="plain" onClick={cancelAdding} /></view>
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
          <Choice label={t(L.CANCEL)} look="plain" onClick={cancelAdding} />
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
  createEffect(() => { recents(); setMenus(); });   // the menu bar, in the interface language, with the recent projects of now
  return <view class="relative flex-col w-full h-full bg-zinc-950">
    <Show when={!previewing()}><TopBar /></Show>
    <Show when={previewing()}><PreviewBar /></Show>
    <view class="grow basis-0 min-h-0 flex-row">
      <Show when={!previewing()}>
        <view class="grow basis-0 min-w-0 flex-row">
          <view class="grow basis-0 min-w-0 flex-col">
            <Show when={settings().length > 0}><Settings /></Show>
            <Show when={settings().length === 0 && opened() === null}><Storyboard /></Show>
            <Show when={settings().length === 0 && opened() !== null && pointing() === null}><SequenceEditor /></Show>
            <Show when={settings().length === 0 && pointing() !== null}><PointsEditor /></Show>
            <Problems />
          </view>
          <Show when={settings().length === 0}><Inspector /></Show>
        </view>
      </Show>
      <Show when={previewing()}><PreviewPane /></Show>
    </view>
    <StatusBar />
    <Show when={picking() !== null}><Picking /></Show>
    <Show when={adding() === 'file'}><AddingFile /></Show>
    <Show when={adding() === 'text'}><AddingText /></Show>
    <Show when={removing() !== null}><Removing /></Show>
    <Show when={forgetting().length > 0}><Forgetting /></Show>
    <Show when={deleting() !== null}><Deleting /></Show>
    <Show when={waiting() !== null}><Unsaved /></Show>
    <Show when={recovering().length > 0}><Recovering /></Show>
  </view>;
}
function App(): i32 {
  return <view class="w-full h-full"><For each={[uiLang()]}>{(language: string, i: i32) => <Shell />}</For></view>;
}

/** Closes the question that is open; false when there was none. */
function dismiss(): boolean {
  if (recovering().length > 0) setRecovering('');
  else if (waiting() !== null) answer('stay');
  else if (deleting() !== null) setDeleting(null);
  else if (removing() !== null) setRemoving(null);
  else if (forgetting().length > 0) setForgetting('');
  else if (picking() !== null) answerPick(null);
  else if (adding().length > 0) cancelAdding();
  else return false;
  return true;
}
// keys reach here when no text field used them: Cmd+Z in a field undoes its typing, elsewhere the last step of the document
ui.onKey((e: ui.KeyEvent) => {
  const k = e.key;
  if (previewing()) { if (k === 'Escape') stopPreview(); e.preventDefault(); return; }   // the keys are the visitor's, who has none
  if (recovering().length > 0 || waiting() !== null || deleting() !== null || removing() !== null || forgetting().length > 0 || picking() !== null || adding().length > 0) { if (k === 'Escape') { dismiss(); e.preventDefault(); } return; }
  if (e.primary) {
    // the same commands as the menu bar and the context menus (tools.ts)
    const id = k === 's' ? (e.shift ? 'saveAs' : 'save') : k === 'z' ? (e.shift ? 'redo' : 'undo') : k === 'y' ? 'redo' : k === 'o' ? 'open' : k === 'n' ? 'new' : k === 'd' ? 'duplicate'
      : k === '0' ? 'fit' : k === '=' ? 'zoomIn' : k === '-' ? 'zoomOut' : k === 'e' ? 'advanced' : k === ',' ? 'settings' : k === 'c' ? 'copy' : k === 'x' ? 'cut' : k === 'v' ? 'paste'
      : k === 'a' ? 'selectAll' : '';
    if (!perform(id)) return;
    e.preventDefault();
    return;
  }
  if (settings().length > 0) { if (k === 'Escape') { closeSettings(); e.preventDefault(); } return; }   // the keys of the storyboard are not the settings'
  const board = opened() === null;
  if (k === 'Delete' || k === 'Backspace') deleteChosen();
  else if (k.startsWith('Arrow') && chosenItems().length + chosenSequences().length > 0) {
    // one unit of the table, a step of the storyboard's grid; ten times that with Shift
    const by = (board ? 10 : 1) * (e.shift ? (board ? 5 : 10) : 1);
    nudge(k === 'ArrowLeft' ? -by : k === 'ArrowRight' ? by : 0, k === 'ArrowUp' ? -by : k === 'ArrowDown' ? by : 0);
  }
  else if (k === 'Escape' && pointing() !== null) { if (selectedPoint() !== null) pickPoint(null); else closePoints(); }
  else if (k === 'Escape' && !board) { if (selectedItem() !== null || selectedLink() !== null || shownMedia() !== null) pick(null, null, null); else closeSequence(); }
  else if (k === 'Escape' && selected() !== null) select(null, null);
  else if (k === 'l') nextLanguage();
  else if (k === 'p') playFromHere();
  else if (k === 'w') togglePreviewWindow();
  else if (board && k === 'Enter' && selected() !== null) setNameIt(nameIt() + 1);
  else if (board && k === 'n') addSequenceInView();
  else if (board && k === 's' && selected() !== null) startHere();
  else if (board && k === 'o' && selected() !== null) { const s = selected(); if (s !== null) openSequence(s); }
  else return;
  e.preventDefault();
});

const a = args().filter((arg: string) => arg !== '--story' && arg !== '--log');
setTelling(args().indexOf('--story') >= 0);
setLogging(args().indexOf('--log') >= 0);
if (a.length > 0) {
  // `zinc run <dir>` starts the program in the project's directory: a relative path is taken from where the command was typed
  const file = a[0].startsWith('/') ? a[0] : `${launchDir()}/${a[0]}`;
  if (exists(file)) openFile(file); else { newFile(file); offerBackup(); }
} else offerBackup();   // the unsaved work of a project that never had a file
// closing the window with unsaved work asks first
// files dropped on the window enter the library; a project dropped there is opened
on('drop', (files: string[]) => dropFiles(files));
onCloseRequested(() => { if (doc().dirty) { keepOpen(); guard(() => quit()); } else closePreviewWindow(); });
let frames = 0;
// the view knows its size once it was drawn: the first fit waits for that
render(App, 0x09090b, (dt: number) => { if (++frames === 2) fit(); toolsTick(); backupTick(dt); decodePictures(); previewTick(dt); pointsTick(dt); measureTick(); });
