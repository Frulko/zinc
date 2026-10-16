// The preview: the project as visitors will see it, played by the table's own player (../src/player.ts) on the document as it is now, saved
// or not. "Play from here" puts the player in the editor's window in place of the views, from the sequence being edited, until Escape or
// "Back to editing". "In a window" opens a second window beside the editor that follows the work: it shows the sequence being edited (the
// open table, else the selected sequence) and starts it again a moment after each change of the document.
// Beside the settings of the project a third player is the live sample: a sequence (the selected one, else where the visit starts) with
// the settings as they are.
// The player reads the files of a project through ../src/files.ts: here they are the files of the project's folder.
import { createSignal, batch, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { clip, unclip, rect, clear, width, height, openWindow, closeWindow, windowOpen, imageFromBytes } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { copyProject } from '../src/project';
import { Player } from '../src/player';
import { files } from '../src/files';
import { doc, project, lang, opened, selected, folder, setStatus, settings } from './state';
import { Tool } from './widgets';
import * as L from './strings';
import { t, f } from './strings';

// ---------------------------------------------------------------- the files of the project folder

// ponytail: a picture decoded for the preview is kept until the editor closes, and a file replaced on disk shows after a restart; look at
// the file's date and free what a closed project used when a museum's folder outgrows the memory.
// A font file of the folder is read by zinc:gfx loadFont itself, from its path (`files.path`), as zinc:fs would read it: the editor's "fs"
// permission. ponytail: a project opened by a relative path shows the families only (loadFont takes a name without a leading / for an asset).
const pictures = new Map<string, i32>();
function inFolder(file: string): string { return `${folder()}/${file}`; }
files.path = inFolder;
files.onDisk = inFolder;
files.exists = (file: string): boolean => folder().length > 0 && fs.exists(inFolder(file));
files.text = (file: string): string => fs.readText(inFolder(file));
files.bytes = (file: string): u8[] => fs.readBytes(inFolder(file));
files.picture = (file: string): i32 => {
  const path = inFolder(file);
  let made: i32 = pictures.get(path) ?? -1;
  if (made >= 0) return made;
  try { made = imageFromBytes(fs.readBytes(path)); } catch (e) { made = -1; }   // a file that is not there yet is asked for again next time
  if (made >= 0) pictures.set(path, made);
  return made;
};

// ---------------------------------------------------------------- the players

/** With --story on the command line: the players print what happens to the story, as the table's app does (the tests read it). */
let telling = false;
export function setTelling(on: boolean): void { telling = on; }

/** A player on the document as it is now, opening with the sequence `first` ('': where the visit starts). */
function playerAt(first: string): Player {
  const p = new Player(copyProject(project()), first, lang());
  p.telling = telling;
  return p;
}
/** The sequence being edited: the one whose table is open, else the selected one ('' for none). */
function edited(): string {
  const s = opened() ?? selected();
  return s !== null ? s.id : '';
}
function titleOf(id: string): string {
  const s = project().sequence(id);
  return s === null ? '' : project().say(s.title, lang());
}

// ---- in the editor's window

/** Whether the player has the editor's window, and the title of the sequence on its table. */
export const [previewing, setPreviewing] = createSignal<boolean>(false);
export const [previewAt, setPreviewAt] = createSignal<string>('');
let player: Player | null = null, shown = '', fault = '';
// where the pane is on the window, known once it was drawn
let boxX: number = 0, boxY: number = 0, boxW: number = 0, boxH: number = 0;

/** Plays the project from the sequence being edited, as it is now. */
export function playFromHere(): void {
  if (project().sequences.length === 0) { setStatus(t(L.NOTHING_TO_PLAY)); return; }
  doc().seal();
  const from = edited();
  player = playerAt(from);
  shown = ''; fault = ''; boxW = 0;
  batch(() => { setPreviewAt(''); setPreviewing(true); setStatus(f(L.PLAYING_FROM, titleOf(from.length > 0 ? from : project().start))); });
}
export function stopPreview(): void {
  const p = player;
  if (p === null) return;
  p.close();
  player = null;
  batch(() => { setPreviewing(false); setStatus(t(L.BACK_IN_EDITOR)); });
}
/** The pane the player draws in: the table as large as fits. */
export function PreviewPane(): i32 {
  return <View className="grow basis-0 min-w-0 relative bg-zinc-950">
    <Canvas className="absolute inset-0" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      boxX = x; boxY = y; boxW = w; boxH = h;
      const p = player;
      if (p === null) return;
      clip(x, y, w, h);   // a card pushed over the edge of the table stays in the pane
      rect(x, y, w, h, p.project.theme.background);
      p.draw(x, y, w, h);
      unclip();
    }} />
  </View>;
}

// ---- in a window of its own

/** Whether the preview window is open. */
export const [windowShown, setWindowShown] = createSignal<boolean>(false);
/** Seconds between a change and the preview that shows it: typing a title is one new preview, not one per letter. */
const FOLLOW = 0.25;
let side: Player | null = null, sideId: i32 = -1, sideText = '', sideTarget = '', sideLang = '', sideWait: number = 0;

function closeSide(): void {
  if (sideId >= 0 && windowOpen(sideId)) closeWindow(sideId);
  const p = side;
  if (p !== null) p.close();
  side = null; sideId = -1;
  setWindowShown(false);
}
/** Opens the preview window, or closes it. */
export function togglePreviewWindow(): void {
  if (sideId >= 0) { closeSide(); setStatus(t(L.WINDOW_CLOSED)); return; }
  sideId = openWindow(t(L.PREVIEW_TITLE), 960, 540, (dt: number) => {
    const p = side;
    clear(p !== null ? p.project.theme.background : 0x14151a);
    if (p !== null) p.frame(dt, 0, 0, width(), height());
  });
  if (sideId < 0) { setStatus(t(L.NO_WINDOW)); return; }
  sideText = ''; sideWait = 0;
  enterSide();
  batch(() => { setWindowShown(true); setStatus(t(L.WINDOW_OPENED)); });
}
/** The editor closes: its preview window goes with it. */
export function closePreviewWindow(): void { if (sideId >= 0) closeSide(); }

/** Makes the window's player again on the document as it is now, at the sequence being edited, else where the preview was. */
function enterSide(): void {
  const was = side, target = edited();
  let at = target;
  if (at.length === 0 && was !== null && project().sequence(was.sequence) !== null) at = was.sequence;
  if (was !== null) was.close();
  side = project().sequences.length > 0 ? playerAt(at) : null;
  sideText = doc().text(); sideTarget = target; sideLang = lang();
}

// ---- beside the settings of the project: a live sample

let sample: Player | null = null, sampleText = '', sampleKey = '', sampleWait: number = 0;
let sampleX: number = 0, sampleY: number = 0, sampleW: number = 0, sampleH: number = 0;
const [sampleHigh, setSampleHigh] = createSignal<number>(360);

/** The pane of the sample: as wide as its column, with the shape of the table. */
export function SamplePane(): i32 {
  return <View className="relative rounded-md overflow-hidden border border-zinc-800" style={{ height: sampleHigh() }}>
    <Canvas className="absolute inset-0" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      sampleX = x; sampleY = y; sampleW = w; sampleH = h;
      const table = project().table, high = Math.round(w * table.height / table.width), p = sample;
      if (high !== sampleHigh()) setSampleHigh(high);
      clip(x, y, w, h);
      rect(x, y, w, h, p !== null ? p.project.theme.background : 0x14151a);
      if (p !== null) p.draw(x, y, w, h);
      unclip();
    }} />
  </View>;
}
/** Makes the sample again on the document as it is now; beside the accessibility settings it wears the high-contrast colours. */
function makeSample(key: string): void {
  const was = sample;
  if (was !== null) was.close();
  sample = null;
  if (project().sequences.length > 0) {
    const copy = copyProject(project()), th = copy.theme, c = copy.accessibility.highContrast;
    if (settings() === 'access') { th.background = c.background; th.paper = c.paper; th.ink = c.ink; th.text = c.text; th.muted = c.muted; th.accent = c.accent; }
    sample = new Player(copy, edited(), lang());
  }
  sampleText = doc().text(); sampleKey = key; sampleWait = 0;
}
function sampleTick(dt: number): void {
  const section = settings();
  if (section.length === 0) {   // the settings are closed: no sample
    const was = sample;
    if (was !== null) was.close();
    sample = null; sampleText = '';
    return;
  }
  const key = `${section === 'access'} ${lang()} ${edited()}`;
  if (sampleText.length === 0) makeSample(key);
  else if (doc().text() !== sampleText || key !== sampleKey) { sampleText = doc().text(); sampleKey = key; sampleWait = FOLLOW; }
  else if (sampleWait > 0) { sampleWait -= dt; if (sampleWait <= 0) makeSample(key); }
  const p = sample;
  if (p !== null && sampleW > 0) p.update(dt, sampleX, sampleY, sampleW, sampleH);
  ui.repaint();
}

/** The two ways to see the project as visitors will, at the corner of the view being edited: in this window from the sequence at hand, or
 *  in a window beside it. */
export function PreviewTools(): i32 {
  return <View className="absolute left-[10] top-[10] flex-row items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800"
    onPointerDown={(e: ui.PointerEvent) => {}} onDoubleClick={(e: ui.PointerEvent) => {}}>
    <Tool icon="play" label={t(L.PLAY_FROM_HERE)} look="plain" off={() => project().sequences.length === 0} onClick={playFromHere} />
    <Show when={!windowShown()}><Tool icon="app-window" label={t(L.IN_WINDOW)} look="quiet" off={() => false} onClick={togglePreviewWindow} /></Show>
    <Show when={windowShown()}><Tool icon="app-window" label={t(L.IN_WINDOW)} look="on" off={() => false} onClick={togglePreviewWindow} /></Show>
  </View>;
}

/** Once per frame, before the window is drawn (main.tsx): the time of the player in the pane, and whether the preview window is behind
 *  the work. */
export function previewTick(dt: number): void {
  sampleTick(dt);
  const p = player;
  if (p !== null) {
    if (boxW > 0) p.update(dt, boxX, boxY, boxW, boxH);
    ui.repaint();
    if (p.sequence !== shown) { shown = p.sequence; setPreviewAt(titleOf(shown)); }
    if (p.fault !== fault) { fault = p.fault; setStatus(f(L.PREVIEW_FAULT, fault)); }
  }
  if (sideId < 0) return;
  if (!windowOpen(sideId)) { closeSide(); return; }   // the author closed it
  if (doc().text() !== sideText || edited() !== sideTarget) { sideText = doc().text(); sideTarget = edited(); sideWait = FOLLOW; }
  else if (sideWait > 0) { sideWait -= dt; if (sideWait <= 0) enterSide(); }
  const q = side;
  if (q !== null && lang() !== sideLang) { sideLang = lang(); q.setLanguage(sideLang); }
}
