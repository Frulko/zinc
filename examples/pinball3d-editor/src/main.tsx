// The table editor of the 3D pinball (ZN-649.04): a desktop tool, mouse and keyboard, with which someone who does not code makes a
// table of examples/pinball3d. It edits a table folder (table.json and the files it names, docs/pinball-table-format.md) and writes
// exactly what the game reads: the canonical text of the format.
//   zinc run examples/pinball3d-editor                        a new table (Save asks for its folder)
//   zinc run examples/pinball3d-editor -- path/to/table       that table folder (or its table.json); a new table saved there when it has none
//   --log after the folder prints every event of the game played in the editor, as the game's own --log does, and what the editor refuses
// The list at the left is outline.tsx, the top view topview.tsx (screen.tsx takes its place for the screen layouts), the properties form.tsx; every text of the interface is in
// strings.ts, in English and French.
import { render, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { args, env } from 'zinc:sys';
import { exists } from 'zinc:fs';
import { quit } from 'zinc:gfx';
import { onCloseRequested, keepOpen } from 'zinc:system/window';
import { TABLE_FILE } from '../../pinball3d/src/format/table';
import { doc, folder, status, failed, selected, select, zoomBy, fit, frameOfView, viewW, viewH, undo, redo, save, newCommand, openCommand, openFolder, newTable, waiting, answer, guard,
  advanced, setAdvanced, moveSelected, turnSelected, deleteSelected, duplicateSelected, mirrorSelected, tool, pickTool, finishPlacing, unplace, activeRow, removeActiveRow, nextLevel, exportPackage, setEcho } from './state';
import { Ico, Tool, Segmented, ACCENT, chord } from './widgets';
import { Outline, focusGoTo } from './outline';
import { Palette } from './palette';
import { TopView } from './topview';
import { ScreenView, screenShown } from './screen';
import { Properties, findField, editAsFile } from './form';
import { view3d, setView3d, playing, paused, dropping, setDropping, play, pause, stop, stepFrame, advance, setLogging } from './play';
import { toggleWindow, useView, boxX, boxY, boxW, boxH } from './view3d';
import { refreshFiles, importFrom, importFile } from './files';
import { on } from 'zinc:system';
import * as L from './strings';
import { t, f, uiLang, setUiLang } from './strings';

const never = (): boolean => false;
function Divider(): i32 { return <view class="w-px h-5 mx-1 bg-zinc-800" />; }
/** The shortcut of a command, shown beside it in the advanced mode. */
function keys(k: string, shift: boolean = false): () => string { return (): string => advanced() ? chord(k, shift) : ''; }

function TopBar(): i32 {
  const where = (): string => folder().length > 0 ? `${folder().slice(folder().lastIndexOf('/') + 1)}/${TABLE_FILE}` : t(L.NO_FOLDER_YET);
  return <view class="flex-row items-center gap-1 h-12 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
    <Ico name="circle-dot" size={18} color={ACCENT} />
    <view class="flex-col ml-2 mr-3" style={{ width: 196 }}>
      <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 196 }}>{`${doc().get('name')}`}</text>
      <view class="flex-row items-center gap-2">
        <text class="truncate text-[11px] text-zinc-500" style={{ maxWidth: 196 }}>{where()}</text>
      </view>
    </view>
    <Divider />
    <Tool icon="file-plus" label={t(L.NEW)} look="quiet" keys={keys('N')} off={never} onClick={newCommand} />
    <Tool icon="folder-open" label={t(L.OPEN)} look="quiet" keys={keys('O')} off={never} onClick={openCommand} />
    <Tool icon="save" label={t(L.SAVE)} look="plain" keys={keys('S')} off={() => !doc().dirty} onClick={() => { save(); }} />
    <Tool icon="package" label={t(L.EXPORT)} look="quiet" keys={keys('E', true)} off={never} onClick={() => { exportPackage(); }} />
    <Divider />
    <Tool icon="undo-2" label={t(L.UNDO)} look="quiet" keys={keys('Z')} off={() => !doc().canUndo} onClick={undo} />
    <Tool icon="redo-2" label={t(L.REDO)} look="quiet" keys={keys('Z', true)} off={() => !doc().canRedo} onClick={redo} />
    <Show when={doc().dirty}>
      <view class="flex-row items-center gap-[6] ml-3">
        <view class="w-[6] h-[6] rounded-full bg-amber-400" />
        <text class="text-[11px] text-amber-300">{t(L.UNSAVED)}</text>
      </view>
    </Show>
    <view class="grow" />
    <text class="text-[11px] text-zinc-500">{t(L.APP)}</text>
  </view>;
}
/** The last thing done or refused, what Undo would take back, the advanced mode and the language of the interface. */
function StatusBar(): i32 {
  return <view class="flex-row items-center gap-3 h-8 px-3 shrink-0 bg-zinc-950 border-t border-zinc-800">
    <Show when={failed()}><Ico name="circle-alert" size={13} color={0xf87171} /></Show>
    <text class={`grow basis-0 truncate text-[11px] ${failed() ? 'text-red-300' : 'text-zinc-400'}`}>{status()}</text>
    <text class="text-[11px] text-zinc-600">{doc().canUndo ? f(L.UNDO_NEXT, L.step(doc().undoLabel)) : ''}</text>
    <button class={`flex-row items-center gap-1 h-6 px-2 rounded cursor-pointer ${advanced() ? 'bg-zinc-700' : 'bg-zinc-950 border border-zinc-800 hover:bg-zinc-800'}`} onClick={() => setAdvanced(!advanced())}>
      <text class={`text-[11px] font-bold ${advanced() ? 'text-white' : 'text-zinc-400'}`}>{t(L.ADVANCED)}</text>
      <text class="text-[10px] text-zinc-400">{advanced() ? chord('E') : ''}</text>
    </button>
    <text class="text-[11px] text-zinc-500">{t(L.INTERFACE)}</text>
    <view class="w-[150]"><Segmented options={['en', 'fr']} labels={['English', 'Français']} value={uiLang} onPick={setUiLang} /></view>
  </view>;
}

/** A button of a question. `look`: 'plain' or 'primary'. */
function Choice(p: { label: string; look: string; onClick: () => void }): i32 {
  const fill = p.look === 'primary' ? 'bg-amber-400 hover:bg-amber-300' : 'bg-zinc-900 border border-zinc-700 hover:bg-zinc-800';
  return <button class={`flex-row items-center justify-center h-9 px-4 rounded-md cursor-pointer ${fill}`} onClick={p.onClick}>
    <text class={`text-sm font-bold ${p.look === 'plain' ? 'text-zinc-100' : 'text-zinc-900'}`}>{p.label}</text>
  </button>;
}
/** Unsaved work is never dropped without this question. Nothing under it answers until it is closed. */
function Unsaved(): i32 {
  return <view class="absolute inset-0 items-center justify-center bg-black/60" onPointerDown={(e: ui.PointerEvent) => {}} onWheel={(e: ui.PointerEvent) => {}}>
    <view class="w-[460] flex-col gap-2 p-6 rounded-xl bg-zinc-900 border border-zinc-700 shadow-lg">
      <text class="text-lg font-bold text-zinc-100">{t(L.ASK_SAVE)}</text>
      <text class="text-sm text-zinc-400">{t(L.ASK_SAVE_WHY)}</text>
      <view class="flex-row justify-end gap-2 mt-4">
        <Choice label={t(L.CANCEL)} look="plain" onClick={() => { answer('stay'); }} />
        <Choice label={t(L.DO_NOT_SAVE)} look="plain" onClick={() => { answer('drop'); }} />
        <Choice label={t(L.SAVE)} look="primary" onClick={() => { answer('save'); }} />
      </view>
    </view>
  </view>;
}

/** The whole window. It is built again when the interface language changes: every view reads its texts once. */
function Shell(): i32 {
  return <view class="relative flex-col w-full h-full bg-zinc-950">
    <TopBar />
    <view class="grow basis-0 min-h-0 flex-row">
      <Outline />
      <Palette />
      <Show when={!screenShown()}><TopView /></Show>
      <Show when={screenShown()}><ScreenView /></Show>
      <Properties />
    </view>
    <StatusBar />
    <Show when={waiting() !== null}><Unsaved /></Show>
  </view>;
}
function App(): i32 {
  return <view class="w-full h-full"><For each={[uiLang()]}>{(language: string, i: i32) => <Shell />}</For></view>;
}

// keys reach here when no text field used them: Cmd+Z in a field undoes its typing, elsewhere the last step of the table
ui.onKey((e: ui.KeyEvent) => {
  const k = e.key;
  if (waiting() !== null) { if (k === 'Escape') { answer('stay'); e.preventDefault(); } return; }
  if (e.primary) {
    if (k === 's') save();
    else if (k === 'z') { if (e.shift) redo(); else undo(); }
    else if (k === 'y') redo();
    else if (k === 'o') openCommand();
    else if (k === 'n') newCommand();
    else if (k === '0') fit();
    else if (k === '=') zoomBy(1.2, viewW / 2, viewH / 2);
    else if (k === '-') zoomBy(1 / 1.2, viewW / 2, viewH / 2);
    else if (k === 'e') { if (e.shift) exportPackage(); else setAdvanced(!advanced()); }
    else if (k === 'f') findField();
    else if (k === 'g') focusGoTo();
    else if (k === 'j') editAsFile();
    else if (k === 'd') duplicateSelected();
    else if (k === 'r') refreshFiles();
    else if (k === 'i') importFrom('', '');
    else return;
    e.preventDefault();
    return;
  }
  // the game: V shows the table in 3D, B drops a ball where the top view is clicked next, P plays or pauses, O steps a paused
  // game by a frame, W opens the game's own window, C keeps the view set by hand in the 3D pane, Escape ends the game; L goes from one level of the table to the next. While
  // the game runs every other key is the game's: its flippers, its plunger, its bumps
  let taken = true;
  if (k === 'v') setView3d(!view3d());
  else if (k === 'b') { setView3d(true); setDropping(!dropping()); }
  else if (k === 'p') { setView3d(true); if (playing()) pause(); else play(); }
  else if (k === 'o' && playing() && paused()) stepFrame();
  else if (k === 'w') toggleWindow();
  else if (k === 'c' && !(playing() && !paused())) useView();
  else if (k === 'l' && !(playing() && !paused())) nextLevel();
  else if (k === 'Escape' && (playing() || dropping())) { if (playing()) stop(); setDropping(false); }
  else taken = playing() && !paused();
  if (taken) { e.preventDefault(); return; }
  // while an entry of the palette is being placed: Enter ends its path, Backspace takes its last point back, Escape gives it up
  if (tool() !== null) {
    if (k === 'Enter') finishPlacing();
    else if (k === 'Backspace' || k === 'Delete') unplace();
    else if (k === 'Escape') pickTool(null);
    else return;
    e.preventDefault();
    return;
  }
  // the arrows nudge the selection by a millimetre, a centimetre with Shift; R turns it by 15 degrees, the other way with Shift;
  // M adds its mirror image; Delete takes away the point last pressed, else the selection
  const far = e.shift ? 1 : 0.1;
  if (k === 'Delete' || k === 'Backspace') { if (activeRow() !== '') removeActiveRow(); else deleteSelected(); }
  else if (k === 'm') mirrorSelected();
  else if (k === 'Escape' && selected() !== '') select('');
  else if (k === 'ArrowLeft') moveSelected(-far, 0);
  else if (k === 'ArrowRight') moveSelected(far, 0);
  else if (k === 'ArrowUp') moveSelected(0, -far);
  else if (k === 'ArrowDown') moveSelected(0, far);
  else if (k === 'r') turnSelected(e.shift ? -15 : 15);
  else return;
  e.preventDefault();
});

const a = args().filter((arg: string) => !arg.startsWith('--'));
// --log: the events of the game played in the editor are printed as the game prints its own
setLogging(args().indexOf('--log') >= 0);
setEcho(args().indexOf('--log') >= 0);
if (a.length > 0) {
  // ponytail: `zinc run <dir>` starts the program in the project's directory; the shell's PWD still says where the command was typed,
  // so a relative path means what the user meant. A launch directory in zinc:sys (ZN-687) replaces this.
  const given = a[0].startsWith('/') || env('PWD').length === 0 ? a[0] : `${env('PWD')}/${a[0]}`;
  const dir = given.endsWith(`/${TABLE_FILE}`) ? given.slice(0, given.length - TABLE_FILE.length - 1) : given;
  if (exists(`${dir}/${TABLE_FILE}`)) openFolder(dir); else newTable(dir);
}
// a file dropped on the window is copied into the table's folder, as Import does
on('drop', (dropped: string[]) => { if (dropped.length === 1) importFile(dropped[0]); });
// closing the window with unsaved work asks first
onCloseRequested(() => { if (doc().dirty) { keepOpen(); guard(() => quit()); } });
// once a frame: the whole table when the view has just been laid out, and the game played in the editor
render(App, 0x09090b, (dt: number) => { frameOfView(); advance(dt, boxX, boxY, boxW, boxH); });
