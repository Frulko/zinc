// What the editor shows and does: the open document, the selection, the two views (the storyboard, the table of one sequence) and the commands
// behind the buttons and keys. The views (storyboard.tsx, sequence.tsx, inspector.tsx, main.tsx) read these signals and call these commands;
// the document itself is doc.ts. The advanced mode is a view over the same commands: nothing here knows about it.
import { createSignal, batch } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as dialog from 'zinc:system/dialog';
import { Project, Sequence, Media, Item, Link, Point, Presentation, parseProject } from '../src/project';
import { Doc, Problem, newProject } from './doc';
import { decode, Sound } from 'zinc:audio';
import { Player as Decoder } from 'zinc:video';
import { cuesOf } from '../src/narration';
import { clock } from 'zinc:sys';
import * as L from './strings';
import { t, f } from './strings';

// ---------------------------------------------------------------- the document

const [rev, setRev] = createSignal<i32>(0);
let current = new Doc(newProject(), '');
function watch(d: Doc): void { d.onChange = () => { setRev(rev() + 1); }; }
watch(current);

/** The open document. Reading it inside a view subscribes the view to every edit, undo and load. */
export function doc(): Doc { rev(); return current; }
export function project(): Project { rev(); return current.project; }
/** Redraws what reads the document although it did not change (a field shows the document's value again). */
export function refresh(): void { setRev(rev() + 1); }
/** A field was left: its typing is one undo step, and it shows the document's value again (an emptied required text comes back). */
export function done(): void { current.seal(); refresh(); }

/** The file being edited ('' until the project is saved once). Its directory holds the media. */
export const [path, setPath] = createSignal<string>('');
/** What the last command did, in the status bar. */
export const [status, setStatus] = createSignal<string>('');
/** The language the content is shown in (titles, labels, captions): one of the project's. */
export const [lang, setLang] = createSignal<string>('fr');
export function nextLanguage(): void {
  const all = current.project.languages;
  setLang(all[(all.indexOf(lang()) + 1) % all.length]);
}
/** The advanced mode: the same commands with exact numbers, and the text of the selection as the file has it. */
export const [advanced, setAdvanced] = createSignal<boolean>(false);

// ---------------------------------------------------------------- the selection

/** The sequence whose table is being edited; null while the storyboard is shown. */
export const [opened, setOpened] = createSignal<Sequence | null>(null);
/** The selected sequence (the opened one in the sequence editor) and, when one is selected, a link of it, an item of its table, or a
 *  medium of the library. */
export const [selected, setSelected] = createSignal<Sequence | null>(null);
export const [selectedLink, setSelectedLink] = createSignal<Link | null>(null);
export const [selectedItem, setSelectedItem] = createSignal<Item | null>(null);
export const [selectedMedia, setSelectedMedia] = createSignal<Media | null>(null);
/** The model or the panorama whose points of interest are being placed (points.tsx has the window then); null otherwise. And the point
 *  selected there. */
export const [pointing, setPointing] = createSignal<Media | null>(null);
export const [selectedPoint, setSelectedPoint] = createSignal<Point | null>(null);
/** The link under the pointer on the storyboard: its label shows. */
export const [hovered, setHovered] = createSignal<Link | null>(null);
/** Bumped to ask the inspector to put the caret in its first field (a new sequence is named at once). */
export const [nameIt, setNameIt] = createSignal<i32>(0);
/** The same for a new point of interest. */
export const [namePoint, setNamePoint] = createSignal<i32>(0);

/** Selects a sequence and at most one thing of it. */
export function select(s: Sequence | null, l: Link | null): void {
  current.seal();
  batch(() => { setSelected(s); setSelectedLink(l); setSelectedItem(null); setSelectedMedia(null); });
}
/** In the sequence editor: an item of the table, a link, a medium of the library, or nothing (the sequence itself). */
export function pick(it: Item | null, l: Link | null, m: Media | null): void {
  current.seal();
  batch(() => { setSelectedItem(it); setSelectedLink(l); setSelectedMedia(m); });
}
/** The medium the panel shows: the selected item's, else the one selected in the library. */
export function shownMedia(): Media | null {
  const it = selectedItem();
  rev();
  return it !== null ? current.project.medium(it.media) : selectedMedia();
}
/** The sequence a link starts from. ponytail: a scan of every sequence, fine for the hundreds a storyboard holds. */
export function sourceOf(l: Link): Sequence | null {
  for (const s of current.project.sequences) if (s.links.indexOf(l) >= 0) return s;
  return null;
}
/** The selected sequence, or the selected link, as written in the file. */
export function selectionJson(): string {
  rev();
  const s = selected(), l = selectedLink();
  return s === null ? '' : current.jsonOf(s.id, l !== null ? s.links.indexOf(l) : -1);
}
/** Runs a step that replaces the project's objects (undo, redo) and selects again what was selected, by id and place. */
function keepingSelection(step: () => string): string {
  const s = selected(), l = selectedLink(), it = selectedItem(), m = selectedMedia(), o = opened();
  const id = s !== null ? s.id : '', li: i32 = s !== null && l !== null ? s.links.indexOf(l) : -1, ii: i32 = s !== null && it !== null ? s.items.indexOf(it) : -1;
  const mid = m !== null ? m.id : '', wasOpen = o !== null;
  const pm = pointing(), pq = selectedPoint(), pid = pm !== null ? pm.id : '', pi: i32 = pm !== null && pq !== null ? pm.points.indexOf(pq) : -1;
  const tr = tour(), ti: i32 = tr !== null ? current.project.presentations.indexOf(tr) : -1;
  let label = '';
  batch(() => {
    label = step();
    setTour(ti >= 0 && ti < current.project.presentations.length ? current.project.presentations[ti] : null);
    if (current.project.languages.indexOf(lang()) < 0) setLang(current.project.languages[0]);
    const pointed = current.project.medium(pid);
    setPointing(pointed);
    setSelectedPoint(pointed !== null && pi >= 0 && pi < pointed.points.length ? pointed.points[pi] : null);
    const again = current.project.sequence(id);
    setSelected(again);
    setSelectedLink(again !== null && li >= 0 && li < again.links.length ? again.links[li] : null);
    setSelectedItem(again !== null && ii >= 0 && ii < again.items.length ? again.items[ii] : null);
    setSelectedMedia(current.project.medium(mid));
    setOpened(wasOpen ? again : null);
  });
  return label;
}

// ---------------------------------------------------------------- the view of the storyboard

/** A node of the storyboard, in storyboard units; a sequence's position is the centre of its node. */
export const CARD_W = 240, CARD_H = 150;
export const ZOOMS: number[] = [0.5, 0.75, 1, 1.5];
export const [zoomStep, setZoomStep] = createSignal<i32>(2);
export const [panX, setPanX] = createSignal<number>(0);
export const [panY, setPanY] = createSignal<number>(0);
export function zoom(): number { return ZOOMS[zoomStep()]; }
/** The size of the storyboard on screen, set by the view when it is drawn. */
export let viewW: number = 1000, viewH: number = 600;
export function setViewSize(w: number, h: number): void { viewW = w; viewH = h; }

/** Zooms one step in (+1) or out (-1), keeping the storyboard point under (x, y) of the view where it is. */
export function zoomBy(steps: i32, x: number, y: number): void {
  const next: i32 = Math.max(0, Math.min(ZOOMS.length - 1, zoomStep() + steps));
  if (next === zoomStep()) return;
  const z = zoom(), wx = (x - panX()) / z, wy = (y - panY()) / z, z2 = ZOOMS[next];
  batch(() => { setZoomStep(next); setPanX(Math.round(x - wx * z2)); setPanY(Math.round(y - wy * z2)); });
}
/** Shows every sequence, at the largest zoom that holds them all. */
export function fit(): void {
  const seqs = current.project.sequences;
  if (seqs.length === 0) { batch(() => { setZoomStep(2); setPanX(0); setPanY(0); }); return; }
  let x0 = seqs[0].storyX, x1 = x0, y0 = seqs[0].storyY, y1 = y0;
  for (const s of seqs) { x0 = Math.min(x0, s.storyX); x1 = Math.max(x1, s.storyX); y0 = Math.min(y0, s.storyY); y1 = Math.max(y1, s.storyY); }
  const w = x1 - x0 + CARD_W + 120, h = y1 - y0 + CARD_H + 120;
  let step: i32 = 0;
  for (let i = 0; i < ZOOMS.length; i++) if (w * ZOOMS[i] <= viewW && h * ZOOMS[i] <= viewH) step = i;
  const z = ZOOMS[Math.min(step, 2)];   // never larger than life: a lone sequence is not blown up
  batch(() => { setZoomStep(Math.min(step, 2)); setPanX(Math.round(viewW / 2 - (x0 + x1) / 2 * z)); setPanY(Math.round(viewH / 2 - (y0 + y1) / 2 * z)); });
}
/** Brings a sequence to the middle of the view. */
export function reveal(s: Sequence): void {
  batch(() => { setPanX(Math.round(viewW / 2 - s.storyX * zoom())); setPanY(Math.round(viewH / 2 - s.storyY * zoom())); });
}

// ---------------------------------------------------------------- commands on the storyboard

export function nameOf(s: Sequence): string { return current.project.say(s.title, lang()); }

/** A new sequence centred on (x, y) of the storyboard, selected, its title ready to be typed over. */
export function addSequence(x: number, y: number): void {
  batch(() => {
    const id = current.addSequence(Math.round(x / 10) * 10, Math.round(y / 10) * 10);
    select(current.project.sequence(id), null);
    setNameIt(nameIt() + 1);
    setStatus(t(current.project.sequences.length === 1 ? L.DONE_FIRST : L.DONE_CREATED));
  });
}
/** A new sequence in the middle of the view, beside the ones already there. */
export function addSequenceInView(): void {
  let x = Math.round((viewW / 2 - panX()) / zoom() / 10) * 10, y = Math.round((viewH / 2 - panY()) / zoom() / 10) * 10;
  const taken = (): boolean => current.project.sequences.filter((s: Sequence) => Math.abs(s.storyX - x) < 40 && Math.abs(s.storyY - y) < 40).length > 0;
  while (taken()) { x += 40; y += 40; }
  addSequence(x, y);
}
export function renameSelected(language: string, title: string): void {
  const s = selected();
  if (s !== null) current.renameSequence(s.id, language, title);
}
export function moveSequence(s: Sequence, x: number, y: number): void {
  current.moveSequence(s.id, Math.round(x / 10) * 10, Math.round(y / 10) * 10);
}
/** The selected sequence at an exact place (the advanced mode's numbers; a drag snaps to tens). */
export function placeSelected(x: number, y: number): void {
  const s = selected();
  if (s !== null) current.moveSequence(s.id, x, y);
}
export function duplicateSelected(): void {
  const one = selected();
  if (one === null || opened() !== null) return;
  const s: Sequence = one;
  batch(() => {
    const id = current.duplicateSequence(s.id);
    select(current.project.sequence(id), null);
    setStatus(f(L.DONE_DUPLICATED, nameOf(s)));
  });
}
/** The sequence whose deletion waits for an answer (main.tsx shows the question): links lead to it, and the author says what becomes of them. */
export const [deleting, setDeleting] = createSignal<Sequence | null>(null);
/** How many links and points of interest lead to a sequence. */
export function linksTo(s: Sequence): i32 { rev(); return current.linksTo(s.id); }

/** Deletes what is selected: a link, an item of the table, else (on the storyboard) the sequence. A sequence that links lead to is deleted
 *  once the author has said what becomes of them. */
export function deleteSelection(): void {
  const one = selected(), l = selectedLink(), it = selectedItem();
  if (pointing() !== null) { deletePoint(); return; }
  if (one === null) return;
  const s: Sequence = one;
  if (l !== null) {
    const at = s.links.indexOf(l);
    batch(() => { current.deleteLink(s.id, at); setSelectedLink(null); setStatus(t(L.DONE_LINK_DELETED)); });
  } else if (it !== null) {
    const at = s.items.indexOf(it);
    batch(() => { current.removeItem(s.id, at); setSelectedItem(null); setStatus(t(L.DONE_OFF_TABLE)); });
  } else if (opened() !== null) return;
  else if (current.linksTo(s.id) > 0) setDeleting(s);
  else deleteSequence(s, null);
}
/** Deletes a sequence; the links that led to it lead to `instead`, or are deleted with it when `instead` is null. One step for Undo. */
export function deleteSequence(s: Sequence, instead: Sequence | null): void {
  const name = nameOf(s), n = current.linksTo(s.id);
  batch(() => {
    setDeleting(null);
    current.deleteSequence(s.id, instead !== null ? instead.id : '');
    select(instead, null);
    setStatus(n === 0 ? f(L.DONE_DELETED, name) : instead !== null ? f(L.DONE_RETARGETED, name, nameOf(instead)) : n === 1 ? f(L.DONE_DELETED_ONE, name) : f(L.DONE_DELETED_N, name, `${n}`));
  });
}
export function startHere(): void {
  const s = selected();
  if (s === null) return;
  current.setStart(s.id);
  setStatus(f(L.DONE_START, nameOf(s)));
}
/** Draws a link between two sequences and selects it. */
export function link(from: Sequence, to: Sequence): void {
  batch(() => {
    const at = current.addLink(from.id, to.id);
    if (at < 0) return;
    select(from, from.links[at]);
    setStatus(f(L.DONE_LINKED, nameOf(from), nameOf(to)));
  });
}
export function setLinkLabel(language: string, label: string): void {
  const s = selected(), l = selectedLink();
  if (s !== null && l !== null) current.setLinkLabel(s.id, s.links.indexOf(l), language, label);
}
export function setLinkTransition(transition: string): void {
  const s = selected(), l = selectedLink();
  if (s !== null && l !== null) current.setLinkTransition(s.id, s.links.indexOf(l), transition);
}
export function setLinkOverlay(overlay: boolean): void {
  const s = selected(), l = selectedLink();
  if (s !== null && l !== null) current.setLinkOverlay(s.id, s.links.indexOf(l), overlay);
}
export function undo(): void {
  const label = keepingSelection(() => current.undo());
  setStatus(label.length > 0 ? f(L.DONE_UNDONE, L.step(label)) : t(L.NOTHING_TO_UNDO));
}
export function redo(): void {
  const label = keepingSelection(() => current.redo());
  setStatus(label.length > 0 ? f(L.DONE_REDONE, L.step(label)) : t(L.NOTHING_TO_REDO));
}
/** What a problem says, in the interface language. */
export function problemText(p: Problem): string {
  return p.kind === 'refused' ? f(L.P_REFUSED, p.detail) : p.kind === 'unreachable' ? f(L.P_UNREACHABLE, p.subject)
    : f(p.kind === 'no-title' ? L.P_NO_TITLE : L.P_NO_LABEL, p.subject, L.languageName(p.detail));
}
/** Selects what a problem is about and brings it into view. */
export function goTo(p: Problem): void {
  const s = current.project.sequence(p.sequence);
  if (s === null) return;
  setOpened(null);
  select(s, p.link >= 0 && p.link < s.links.length ? s.links[p.link] : null);
  reveal(s);
}

// ---------------------------------------------------------------- the table of a sequence

/** Opens the table of a sequence: its media are laid out there. */
export function openSequence(s: Sequence): void {
  batch(() => { select(s, null); setOpened(s); });
}
export function closeSequence(): void {
  const s = opened();
  batch(() => { setPointing(null); setSelectedPoint(null); setOpened(null); select(s, null); });
}
function titleOf(m: Media): string { return current.project.say(m.title, lang()); }

/** Puts a medium of the library on the open table, centred on (x, y) in table units, and selects the new item. */
export function placeMedia(m: Media, x: number, y: number): void {
  const one = opened();
  if (one === null) return;
  const s: Sequence = one;
  batch(() => {
    const at = current.addItem(s.id, m.id, x, y);
    if (at < 0) return;
    pick(s.items[at], null, null);
    setStatus(f(L.DONE_PLACED, titleOf(m)));
  });
}
function indexOfItem(it: Item): i32 { const s = opened(); return s === null ? -1 : s.items.indexOf(it); }
function openId(): string { const s = opened(); return s === null ? '' : s.id; }
export function moveItem(it: Item, x: number, y: number): void { current.moveItem(openId(), indexOfItem(it), x, y); }
export function resizeItem(it: Item, width: number, height: number): void { current.resizeItem(openId(), indexOfItem(it), width, height); }
export function rotateItem(it: Item, degrees: number): void { current.rotateItem(openId(), indexOfItem(it), degrees); }
export function timeItem(it: Item, at: number, until: number): void { current.setItemTimes(openId(), indexOfItem(it), at, until); }
/** One step toward the front (1) or the back (-1) of the table. */
export function raiseItem(it: Item, by: i32): void { current.raiseItem(openId(), indexOfItem(it), by); }
function indexOfLink(l: Link): i32 { const s = opened(); return s === null ? -1 : s.links.indexOf(l); }
/** Moves a button (table units) or a hotspot (fractions of its item); a button put out of reach comes back within reach, and the status says why. */
export function moveLink(l: Link, x: number, y: number): void {
  current.moveLink(openId(), indexOfLink(l), x, y);
  if (l.on.length === 0 && (l.x !== Math.round(x) || l.y !== Math.round(y))) setStatus(t(L.BUTTON_KEPT_IN_REACH));
}
export function timeLink(l: Link, at: number, until: number): void { current.setLinkTimes(openId(), indexOfLink(l), at, until); }

/** The question "where does it lead?": the answer, a sequence, goes to this function (main.tsx shows the list and the map while it is set). */
export const [picking, setPicking] = createSignal<((target: Sequence) => void) | null>(null);
/** The sequence the question is asked for, which is not an answer (a link does not lead to its own sequence); null when any will do. */
export const [pickFrom, setPickFrom] = createSignal<Sequence | null>(null);
/** The question itself, as a text of strings.ts: where a link leads, or which sequence a guided visit shows next. */
export const [pickAsks, setPickAsks] = createSignal<i32>(L.WHERE_TO);
export function answerPick(target: Sequence | null): void {
  const then = picking();
  batch(() => { setPicking(null); setPickAsks(L.WHERE_TO); });
  if (then !== null && target !== null) then(target);
}
/** A button on the open table, or with `on` a hotspot on that item, leading to a sequence the author then chooses. */
export function addLinkFrom(on: Item | null): void {
  const one = opened();
  if (one === null) return;
  const s: Sequence = one;
  setPickFrom(s);
  setPicking((target: Sequence) => {
    batch(() => {
      const at = on !== null ? current.addHotspot(s.id, on.media, target.id) : current.addLink(s.id, target.id);
      if (at < 0) return;
      pick(null, s.links[at], null);
      setStatus(f(on !== null ? L.DONE_HOTSPOT : L.DONE_BUTTON, nameOf(target)));
    });
  });
}
/** Leads the selected link somewhere else. */
export function retargetSelected(): void {
  const s = selected(), l = selectedLink();
  if (s === null || l === null) return;
  const id = s.id, at = s.links.indexOf(l);
  setPickFrom(s);
  setPicking((target: Sequence) => { current.setLinkTarget(id, at, target.id); });
}

// ---------------------------------------------------------------- the media library

/** The directory of the project file: its media are files in it. '' until the project is saved. */
export function folder(): string { const p = path(); return p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/')) : ''; }
const EXTENSIONS: string[] = ['jpg', 'photo', 'jpeg', 'photo', 'png', 'photo', 'webp', 'photo', 'obj', 'model', 'glb', 'model', 'gltf', 'model', 'mp3', 'audio', 'wav', 'audio', 'm4a', 'audio',
  'ogg', 'audio', 'aiff', 'audio', 'mp4', 'video', 'mov', 'video', 'webm', 'video', 'm4v', 'video'];
/** The kind of medium a file is, by its extension ('' when it is none). */
export function kindOfFile(file: string): string {
  const at = EXTENSIONS.indexOf(file.slice(file.lastIndexOf('.') + 1).toLowerCase());
  return at >= 0 && at % 2 === 0 ? EXTENSIONS[at + 1] : '';
}
/** The files of the project folder that `take` accepts, as paths inside the folder.
 *  ponytail: three directory levels, and names the format accepts. A recording per language is one medium (addFile, perLanguage). */
function folderFiles(take: (rel: string) => boolean): string[] {
  const out: string[] = [], root = folder();
  if (root.length === 0) return out;
  const scan = (dir: string, depth: i32): void => {
    let entries: fs.DirEntry[] = [];
    try { entries = fs.readDir(dir.length > 0 ? `${root}/${dir}` : root); } catch (e) { return; }
    for (const e of entries) {
      const rel = dir.length > 0 ? `${dir}/${e.name}` : e.name;
      if (e.name.startsWith('.') || e.name.indexOf(':') >= 0 || e.name.indexOf('\\') >= 0) continue;
      if (e.isDirectory) { if (depth < 3) scan(rel, depth + 1); }
      else if (take(rel)) out.push(rel);
    }
  };
  scan('', 1);
  return out;
}
/** The media files of the project folder that are not in the library yet. */
export function newFiles(): string[] {
  const known = new Set<string>();
  for (const m of current.project.media) {
    known.add(m.texture); known.add(m.poster);
    for (const l of current.project.languages) { known.add(m.file.replaceAll('{lang}', l)); known.add(m.subtitles.replaceAll('{lang}', l)); }
  }
  return folderFiles((rel: string): boolean => kindOfFile(rel).length > 0 && !known.has(rel));
}
/** The files of the project folder that end in one of `extensions` (lower case, without the dot): the fonts and the pictures a theme can name. */
export function filesEnding(extensions: string[]): string[] {
  return folderFiles((rel: string): boolean => extensions.indexOf(rel.slice(rel.lastIndexOf('.') + 1).toLowerCase()) >= 0);
}
/** The question open over the editor: '' none, 'file' (add a file of the folder), 'text' (write a text). */
export const [adding, setAdding] = createSignal<string>('');
export function addFileCommand(): void {
  if (folder().length === 0) setStatus(t(L.SAVE_FIRST)); else setAdding('file');
}
/** The picture of the folder that has the name of a model file ('' when there is none): what is wrapped on an OBJ model.
 *  What is named otherwise is typed in the medium's panel (its files). */
function textureOf(file: string): string {
  const stem = file.slice(0, file.lastIndexOf('.'));
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) if (fs.exists(`${folder()}/${stem}.${ext}`)) return `${stem}.${ext}`;
  return '';
}
/** A file name with `{lang}` where it names a language of the project ("voice.fr.mp3" gives "voice.{lang}.mp3"): one file per language. */
export function perLanguage(file: string): string {
  for (const l of current.project.languages) {
    const at = file.lastIndexOf(`.${l}.`);
    if (at > file.lastIndexOf('/')) return `${file.slice(0, at)}.{lang}.${file.slice(at + l.length + 2)}`;
  }
  return file;
}
/** Adds a file to the library and selects it; false when something required is missing. A sound or a film named with a language of the
 *  project is one medium for every language, and takes with it what lies beside it under its name: its subtitles (.vtt), and for a film
 *  the picture of its card. */
export function addFile(kind: string, picked: string, title: string, source: string, licence: string): boolean {
  const timed = kind === 'audio' || kind === 'video', file = timed ? perLanguage(picked) : picked;
  // the subtitles: "voice.fr.vtt" beside "voice.fr.mp3", "film.vtt" or "film.fr.vtt" beside "film.mp4"
  const stem = picked.slice(0, picked.lastIndexOf('.'));
  let subtitles = '';
  if (timed) for (const vtt of [`${stem}.vtt`, `${stem}.${current.project.languages[0]}.vtt`]) if (subtitles.length === 0 && fs.exists(`${folder()}/${vtt}`)) subtitles = perLanguage(vtt);
  const beside = (kind === 'model' && file.toLowerCase().endsWith('.obj')) || kind === 'video' ? textureOf(file.replaceAll('.{lang}', '')) : '';
  const id = current.addMedia(kind, file, title, source, licence, beside, subtitles, beside);
  if (id.length === 0) return false;
  batch(() => { setAdding(''); pick(null, null, current.project.medium(id)); setStatus(f(L.DONE_MEDIA_ADDED, title)); });
  return true;
}
export function addWrittenText(title: string, body: string): boolean {
  const id = current.addText(title, body);
  if (id.length === 0) return false;
  batch(() => { setAdding(''); pick(null, null, current.project.medium(id)); setStatus(f(L.DONE_MEDIA_ADDED, title)); });
  return true;
}
/** A text of the shown medium in one language (see Doc.setMediaText for the fields). */
export function setMediaText(field: string, language: string, value: string): void {
  const m = shownMedia();
  if (m !== null) current.setMediaText(m.id, field, language, value);
}
export function setMediaCredit(field: string, value: string): void {
  const m = shownMedia();
  if (m !== null) current.setMediaCredit(m.id, field, value);
}
/** How many tables show a medium. */
export function usesOf(m: Media): i32 { rev(); return current.mediaUses(m.id); }
/** The medium whose removal waits for an answer: it is on tables. */
export const [removing, setRemoving] = createSignal<Media | null>(null);
export function removeMediaCommand(m: Media): void {
  if (current.mediaUses(m.id) > 0) setRemoving(m); else removeMedia(m);
}
export function removeMedia(m: Media): void {
  const name = titleOf(m);
  batch(() => { setRemoving(null); current.removeMedia(m.id); pick(null, null, null); setStatus(f(L.DONE_MEDIA_REMOVED, name)); });
}
export function setSequenceText(language: string, text: string): void {
  const s = selected();
  if (s !== null) current.setSequenceText(s.id, language, text);
}
export function setSequenceDuration(seconds: number): void {
  const s = selected();
  if (s !== null) current.setSequenceDuration(s.id, seconds);
}

// ---------------------------------------------------------------- narration, sound and film

function refused(why: string): void { if (why.length > 0) setStatus(f(L.REFUSED, why)); }
/** The narration of the open sequence: a sound of the library, or the same one again to take it away. */
export function narrate(m: Media): void {
  const s = selected();
  if (s !== null) current.setNarration(s.id, s.narration === m.id ? '' : m.id);
}
/** Asks which sequence follows the open one by itself; `clearNext` says none. */
export function chooseNext(): void {
  const s = selected();
  if (s === null) return;
  const id = s.id;
  batch(() => { setPickFrom(s); setPickAsks(L.WHICH_NEXT); });
  setPicking((target: Sequence) => { refused(current.setNext(id, target.id)); });
}
export function clearNext(): void {
  const s = selected();
  if (s !== null) current.setNext(s.id, '');
}
/** A file of the shown medium (see Doc.setMediaFile); what the player would refuse is said and not taken. */
export function setMediaFile(field: string, value: string): void {
  const m = shownMedia();
  if (m !== null) refused(current.setMediaFile(m.id, field, value));
}
export function setMediaLoop(loop: boolean): void {
  const m = shownMedia();
  if (m !== null) current.setMediaLoop(m.id, loop);
}

// what the files say of their own length, by path: a file is opened once
// ponytail: a file replaced on disk keeps its first length until the editor is started again, like the pictures of the preview
const measured = new Map<string, number>();
/** The films being opened: zinc:video knows how long a film lasts once its first picture is decoded, some frames later. */
class Probe {
  film: Decoder; path: string; since: number; done = false;
  constructor(film: Decoder, path: string) { this.film = film; this.path = path; this.since = clock(); }
}
let probes: Probe[] = [];
const [measures, setMeasures] = createSignal<i32>(0);
/** Every frame (main.tsx): the films that have just opened say their length, and the bars follow.
 *  ponytail: a film nothing has decoded after ten seconds keeps the length of its subtitles until the editor is started again. */
export function measureTick(): void {
  if (probes.length === 0) return;
  let done = false;
  for (const q of probes) {
    const d = q.film.frames > 0 ? q.film.duration : 0;
    if (!(d > 0) && clock() - q.since < 10000) continue;
    q.film.close();
    q.done = true;
    done = true;
    if (!(d > 0)) continue;
    measured.set(q.path, Math.round(d * 10) / 10);
    if (logging) console.log(`length ${q.path.slice(folder().length + 1)} ${Math.round(d * 10) / 10} s (file)`);
  }
  if (!done) return;
  probes = probes.filter((q: Probe) => !q.done);
  setMeasures(measures() + 1);
}
/** Seconds a sound or a film lasts in the language shown, as the table will count them: what the file says when something decodes it,
 *  else the end of its subtitles, else for a film the ten seconds its poster is shown (../src/film.ts); 0 for a sound that says nothing. */
export function lengthOf(m: Media): number {
  rev(); measures();
  const file = m.file.replaceAll('{lang}', lang()), path = `${folder()}/${file}`;
  let d = measured.get(path) ?? -1;
  if (d < 0) {
    // asked once per file: 0 until the file says its length, and for good when it never does
    d = 0;
    if (folder().length > 0 && fs.exists(path)) {
      if (m.kind === 'video') {
        const v = new Decoder(16, 9);
        v.add(path);
        if (v.decoder === 'sim') v.close();   // a deterministic run decodes nothing
        else { v.play(); probes.push(new Probe(v, path)); }
      } else {
        try { d = decode(fs.readBytes(path), file).duration; } catch (e) { d = 0; }
        if (logging && d > 0) console.log(`length ${file} ${Math.round(d * 10) / 10} s (file)`);
      }
    }
    d = Math.round(d * 10) / 10;
    measured.set(path, d);
  }
  if (d > 0) return d;
  const cues = cuesOf(current.project, m, lang());
  return cues.length > 0 ? Math.round(cues[cues.length - 1].to * 10) / 10 : m.kind === 'video' ? 10 : 0;
}
/** The clip being listened to, and its medium (null: silence). */
let heard: Sound | null = null;
export const [listening, setListening] = createSignal<Media | null>(null);
/** Plays the clip of a sound in the language shown, from its beginning; again on the same one, or on nothing, stops it. */
export function listen(m: Media | null): void {
  const was = listening();
  heard?.stop();
  heard = null;
  setListening(null);
  if (m === null || was === m) return;
  const file = m.file.replaceAll('{lang}', lang()), path = `${folder()}/${file}`;
  if (folder().length === 0 || !fs.exists(path)) { setStatus(f(L.NO_CLIP, file)); return; }
  const s = decode(fs.readBytes(path), file);
  s.play();
  heard = s;
  setListening(m);
  setStatus(f(L.LISTENING, file, `${lengthOf(m)}`));
  if (logging) console.log(`listen ${m.id} ${file} ${lengthOf(m)} s${s.playing ? ', playing' : ', silent'}`);
}

// ---------------------------------------------------------------- points of interest

/** With --log on the command line: where each point is put, and where it is drawn (the tests read it). */
export let logging = false;
export function setLogging(on: boolean): void { logging = on; }

/** Opens a model or a panorama to place its points of interest. */
export function openPoints(m: Media): void {
  if (m.kind !== 'model' && m.kind !== 'panorama') return;
  current.seal();
  batch(() => { setSelectedPoint(null); setPointing(m); setStatus(t(m.kind === 'model' ? L.POINTS_HOW_MODEL : L.POINTS_HOW_PANORAMA)); });
}
export function closePoints(): void {
  current.seal();
  batch(() => { setPointing(null); setSelectedPoint(null); });
}
export function pickPoint(q: Point | null): void {
  current.seal();
  setSelectedPoint(q);
}
function pointId(): string { const q = selectedPoint(); return q === null ? '' : q.id; }
function pointedId(): string { const m = pointing(); return m === null ? '' : m.id; }
/** A new point where the author clicked (see Doc.addPoint), selected, its title ready to be typed over. */
export function addPoint(at: number[], yaw: number, pitch: number, reach: number): Point | null {
  const m = pointing();
  if (m === null) return null;
  const id = current.addPoint(m.id, at, yaw, pitch, reach), q = current.point(m.id, id);
  batch(() => { setSelectedPoint(q); setNamePoint(namePoint() + 1); setStatus(t(L.DONE_POINT)); });
  return q;
}
export function movePoint(q: Point, at: number[]): void { current.movePoint(pointedId(), q.id, at); }
export function setPointText(field: string, language: string, value: string): void { current.setPointText(pointedId(), pointId(), field, language, value); }
/** The view the selected point opens with, or without a selected point the view the medium opens with: what the author sees now. */
export function useView(yaw: number, pitch: number, reach: number): void {
  if (selectedPoint() !== null) { current.setPointView(pointedId(), pointId(), yaw, pitch, reach); setStatus(t(L.DONE_POINT_VIEW)); }
  else { current.setMediaView(pointedId(), yaw, pitch, reach); setStatus(t(L.DONE_OPENING_VIEW)); }
}
export function setLight(light: string): void { current.setMediaLight(pointedId(), light); }
/** Leads the selected point to a sequence the author then chooses; `clearPointTarget` leads it nowhere. */
export function retargetPoint(): void {
  const media = pointedId(), id = pointId();
  if (id.length === 0) return;
  setPickFrom(null);
  setPicking((target: Sequence) => { current.setPointTarget(media, id, target.id); });
}
export function clearPointTarget(): void { current.setPointTarget(pointedId(), pointId(), ''); }
export function deletePoint(): void {
  const id = pointId();
  if (id.length === 0) return;
  batch(() => { current.deletePoint(pointedId(), id); setSelectedPoint(null); setStatus(t(L.DONE_POINT_DELETED)); });
}
/** The medium being pointed as the file has it. */
export function pointedJson(): string { rev(); return current.mediaJsonOf(pointedId()); }

// ---------------------------------------------------------------- the settings of the project

/** The settings are open on this section ('' when they are not): project, theme, table, access, tours. */
export const [settings, setSettings] = createSignal<string>('');
export function openSettings(section: string): void { current.seal(); setSettings(section); }
export function closeSettings(): void { current.seal(); setSettings(''); }
/** The presentation being edited in the settings. */
export const [tour, setTour] = createSignal<Presentation | null>(null);

export function setProjectTitle(language: string, title: string): void { current.setProjectTitle(language, title); }
/** Adds a language by its code; false when the code is not one or is there already. */
export function addLanguage(code: string): boolean {
  const ok = current.addLanguage(code.trim());
  setStatus(ok ? f(L.DONE_LANGUAGE, L.languageName(code.trim())) : f(L.NOT_A_LANGUAGE, code));
  return ok;
}
/** Makes a language the default one; the status says what is missing in it when it cannot be. */
export function makeDefaultLanguage(code: string): void {
  const missing = current.setDefaultLanguage(code);
  setStatus(missing.length === 0 ? f(L.DONE_DEFAULT, L.languageName(code)) : f(L.NOT_DEFAULT, L.languageName(code), missing));
}
/** The language whose removal waits for an answer ('' for none): texts are written in it. */
export const [forgetting, setForgetting] = createSignal<string>('');
export function textsIn(code: string): i32 { rev(); return current.textsIn(code); }
export function removeLanguageCommand(code: string): void {
  if (current.textsIn(code) > 0) setForgetting(code); else removeLanguage(code);
}
export function removeLanguage(code: string): void {
  batch(() => {
    setForgetting('');
    current.removeLanguage(code);
    if (current.project.languages.indexOf(lang()) < 0) setLang(current.project.languages[0]);
    setStatus(f(L.DONE_LANGUAGE_REMOVED, L.languageName(code)));
  });
}
export function setColour(contrast: boolean, name: string, colour: i32): void { current.setColour(contrast, name, colour); }
export function setThemeFile(field: string, value: string): void { current.setThemeFile(field, value); }
export function setNumber(field: string, value: number): void { current.setNumber(field, value); }
export function setFlag(field: string, on: boolean): void { current.setFlag(field, on); }
export function setUpdateUrl(url: string): void { current.setUpdateUrl(url); }
export function setTextSizes(sizes: number[]): void { current.setTextSizes(sizes); }

export function addPresentation(): void {
  const id = current.addPresentation();
  if (id.length === 0) { setStatus(t(L.NOTHING_TO_PLAY)); return; }
  batch(() => { setTour(current.presentation(id)); setNameTour(nameTour() + 1); setStatus(t(L.DONE_PRESENTATION)); });
}
/** Bumped to ask the settings to put the caret in the title of the presentation just made. */
export const [nameTour, setNameTour] = createSignal<i32>(0);
function tourId(): string { const r = tour(); return r === null ? '' : r.id; }
export function renamePresentation(language: string, title: string): void { current.renamePresentation(tourId(), language, title); }
export function deletePresentation(): void {
  const id = tourId();
  if (id.length > 0) batch(() => { current.deletePresentation(id); setTour(null); setStatus(t(L.DONE_PRESENTATION_DELETED)); });
}
/** A step more for the presentation being edited: a sequence the author then chooses. */
export function addStepCommand(): void {
  const id = tourId();
  if (id.length === 0) return;
  batch(() => { setPickFrom(null); setPickAsks(L.WHICH_STEP); });
  setPicking((target: Sequence) => { current.addStep(id, target.id); });
}
export function removeStep(index: i32): void { current.removeStep(tourId(), index); }
export function moveStep(from: i32, to: i32): void { current.moveStep(tourId(), from, to); }
/** The presentation being edited plays when nobody is at the table, or no longer does. */
export function setAttract(on: boolean): void { current.setAttract(on ? tourId() : ''); }

// ---------------------------------------------------------------- files

/** What to do once unsaved work is saved or given up (see `guard`); null when nothing waits. */
export const [waiting, setWaiting] = createSignal<(() => void) | null>(null);

function fileName(p: string): string { return p.slice(p.lastIndexOf('/') + 1); }
function show(d: Doc, file: string, message: string): void {
  current = d;
  watch(d);
  batch(() => {
    setPointing(null); setSelectedPoint(null); setSettings(''); setTour(null); setForgetting('');
    setOpened(null); select(null, null); setHovered(null); setDeleting(null); setRemoving(null); setPicking(null); setAdding('');
    setPath(file);
    setLang(d.project.languages[0]);
    setStatus(message);
    refresh();
  });
  fit();
}
/** Opens a project file; a file the loader refuses is reported with the field at fault and the open project stays. */
export function openFile(file: string): boolean {
  try {
    const d = new Doc(parseProject(fs.readText(file)), '');
    d.markSaved();
    show(d, file, f(L.DONE_OPENED, fileName(file)));
    return true;
  } catch (e) {
    setStatus(f(L.CANNOT_OPEN, fileName(file), e.message));
    return false;
  }
}
/** An empty project that Save will write to `file` ('' to ask where). */
export function newFile(file: string): void { show(new Doc(newProject(), ''), file, t(L.DONE_NEW)); }

function write(file: string): boolean {
  if (current.project.sequences.length === 0) { setStatus(t(L.NOTHING_TO_SAVE)); return false; }
  try {
    fs.writeText(file, current.text());
  } catch (e) {
    setStatus(f(L.CANNOT_SAVE, fileName(file), e.message));
    return false;
  }
  current.markSaved();
  batch(() => { setPath(file); setStatus(f(L.DONE_SAVED, fileName(file))); refresh(); });
  return true;
}
export async function saveAs(): Promise<boolean> {
  const o = new dialog.SaveOptions();
  o.title = t(L.SAVE_TITLE);
  o.defaultPath = path().length > 0 ? path() : 'project.json';
  o.filters = [new dialog.Filter(t(L.FILE_KIND), ['json'])];
  const file = await dialog.save(o);
  if (file === null) { setStatus(t(L.NOT_SAVED)); return false; }
  return write(file);
}
export async function save(): Promise<boolean> {
  current.seal();
  if (path().length === 0) return await saveAs();
  return write(path());
}
/** Runs `then` now when nothing is unsaved; otherwise asks first (main.tsx shows the question while `waiting` is set). */
export function guard(then: () => void): void {
  if (current.dirty) setWaiting(then); else then();
}
/** The answers to that question: save and go on, go on without saving, or stay. */
export async function answer(choice: string): Promise<void> {
  const then = waiting();
  setWaiting(null);
  if (then === null || choice === 'stay') return;
  const go: () => void = then;
  if (choice === 'save' && !(await save())) return;
  go();
}
export function newProjectCommand(): void { guard(() => newFile('')); }
export function openCommand(): void {
  guard(() => {
    const o = new dialog.OpenOptions();
    o.title = t(L.OPEN_TITLE);
    o.filters = [new dialog.Filter(t(L.FILE_KIND), ['json'])];
    dialog.open(o).then((files: string[] | null) => { if (files !== null && files.length > 0) openFile(files[0]); else setStatus(t(L.NOTHING_OPENED)); });
  });
}
