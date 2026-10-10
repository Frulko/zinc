// What the editor shows and does: the open document, the selection, the view of the storyboard and the commands behind the buttons and keys.
// The views (storyboard.tsx, inspector.tsx, main.tsx) read these signals and call these commands; the document itself is doc.ts.
import { createSignal, batch } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as dialog from 'zinc:system/dialog';
import { Project, Sequence, Link, parseProject } from '../src/project';
import { Doc, Problem, newProject } from './doc';

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

/** The file being edited ('' until the project is saved once). Its directory holds the media. */
export const [path, setPath] = createSignal<string>('');
/** What the last command did, in the status bar. */
export const [status, setStatus] = createSignal<string>('');
/** The language the storyboard shows titles and labels in. */
export const [lang, setLang] = createSignal<string>('fr');
export function nextLanguage(): void {
  const all = current.project.languages;
  setLang(all[(all.indexOf(lang()) + 1) % all.length]);
}
/** The advanced mode: the same commands with exact numbers, and the text of the selection as the file has it. */
export const [advanced, setAdvanced] = createSignal<boolean>(false);

// ---------------------------------------------------------------- the selection

/** The selected sequence and, when one of its links is selected, that link. */
export const [selected, setSelected] = createSignal<Sequence | null>(null);
export const [selectedLink, setSelectedLink] = createSignal<Link | null>(null);
/** The link under the pointer on the storyboard: its label shows. */
export const [hovered, setHovered] = createSignal<Link | null>(null);
/** Bumped to ask the inspector to put the caret in its first field (a new sequence is named at once). */
export const [nameIt, setNameIt] = createSignal<i32>(0);

/** The selected sequence, or the selected link, as written in the file. */
export function selectionJson(): string {
  rev();
  const s = selected(), l = selectedLink();
  return s === null ? '' : current.jsonOf(s.id, l !== null ? s.links.indexOf(l) : -1);
}
export function select(s: Sequence | null, l: Link | null): void {
  current.seal();
  batch(() => { setSelected(s); setSelectedLink(l); });
}
/** The sequence a link starts from. ponytail: a scan of every sequence, fine for the hundreds a storyboard holds. */
export function sourceOf(l: Link): Sequence | null {
  for (const s of current.project.sequences) if (s.links.indexOf(l) >= 0) return s;
  return null;
}
/** Runs a step that replaces the project's objects (undo, redo) and selects again what was selected, by id and place. */
function keepingSelection(step: () => string): string {
  const s = selected(), l = selectedLink();
  const id = s !== null ? s.id : '', at: i32 = s !== null && l !== null ? s.links.indexOf(l) : -1;
  let label = '';
  batch(() => {
    label = step();
    const again = current.project.sequence(id);
    setSelected(again);
    setSelectedLink(again !== null && at >= 0 && at < again.links.length ? again.links[at] : null);
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
/** The size of the storyboard on screen, set by the view when it is laid out. */
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

function named(s: Sequence): string { return `"${current.project.say(s.title, lang())}"`; }

/** A new sequence centred on (x, y) of the storyboard, selected, its title ready to be typed over. */
export function addSequence(x: number, y: number): void {
  batch(() => {
    const id = current.addSequence(Math.round(x / 10) * 10, Math.round(y / 10) * 10);
    setSelected(current.project.sequence(id));
    setSelectedLink(null);
    setNameIt(nameIt() + 1);
    setStatus(current.project.sequences.length === 1 ? 'Created the first sequence: the visit starts here. Type its title.' : 'Created a sequence. Type its title.');
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
  if (one === null) return;
  const s: Sequence = one;
  batch(() => {
    const id = current.duplicateSequence(s.id);
    setSelected(current.project.sequence(id));
    setSelectedLink(null);
    setStatus(`Duplicated ${named(s)}.`);
  });
}
/** The sequence whose deletion waits for an answer (main.tsx shows the question): links lead to it, and the author says what becomes of them. */
export const [deleting, setDeleting] = createSignal<Sequence | null>(null);
/** How many links and points of interest lead to a sequence. */
export function linksTo(s: Sequence): i32 { rev(); return current.linksTo(s.id); }
function links(n: i32): string { return n === 1 ? 'the link' : `the ${n} links`; }

/** Deletes the selected link, else the selected sequence. A sequence that links lead to is deleted once the author has said what becomes of them. */
export function deleteSelection(): void {
  const one = selected(), l = selectedLink();
  if (one === null) return;
  const s: Sequence = one;
  if (l !== null) {
    const at = s.links.indexOf(l);
    batch(() => {
      current.deleteLink(s.id, at);
      setSelectedLink(null);
      setStatus('Deleted the link.');
    });
  } else if (current.linksTo(s.id) > 0) setDeleting(s);
  else deleteSequence(s, null);
}
/** Deletes a sequence; the links that led to it lead to `instead`, or are deleted with it when `instead` is null. One step for Undo. */
export function deleteSequence(s: Sequence, instead: Sequence | null): void {
  const name = named(s), n = current.linksTo(s.id);
  batch(() => {
    setDeleting(null);
    current.deleteSequence(s.id, instead !== null ? instead.id : '');
    setSelected(instead);
    setSelectedLink(null);
    setStatus(n === 0 ? `Deleted ${name}.` : instead !== null ? `Deleted ${name}; ${links(n)} that led to it now lead to ${named(instead)}.` : `Deleted ${name} and ${links(n)} that led to it. Undo brings them back.`);
  });
}
export function startHere(): void {
  const s = selected();
  if (s === null) return;
  current.setStart(s.id);
  setStatus(`The visit now starts with ${named(s)}.`);
}
/** Draws a link between two sequences and selects it. */
export function link(from: Sequence, to: Sequence): void {
  batch(() => {
    const at = current.addLink(from.id, to.id);
    if (at < 0) return;
    setSelected(from);
    setSelectedLink(from.links[at]);
    setStatus(`Linked ${named(from)} to ${named(to)}: a button was added to the sequence.`);
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
  setStatus(label.length > 0 ? `Undone: ${label}.` : 'Nothing to undo.');
}
export function redo(): void {
  const label = keepingSelection(() => current.redo());
  setStatus(label.length > 0 ? `Redone: ${label}.` : 'Nothing to redo.');
}
/** Selects what a problem is about and brings it into view. */
export function goTo(p: Problem): void {
  const s = current.project.sequence(p.sequence);
  if (s === null) return;
  select(s, p.link >= 0 && p.link < s.links.length ? s.links[p.link] : null);
  reveal(s);
}

// ---------------------------------------------------------------- files

/** What to do once unsaved work is saved or given up (see `guard`); null when nothing waits. */
export const [waiting, setWaiting] = createSignal<(() => void) | null>(null);

function fileName(p: string): string { return p.slice(p.lastIndexOf('/') + 1); }
function show(d: Doc, file: string, message: string): void {
  current = d;
  watch(d);
  batch(() => {
    setSelected(null); setSelectedLink(null); setHovered(null); setDeleting(null);
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
    show(d, file, `Opened ${fileName(file)}.`);
    return true;
  } catch (e) {
    setStatus(`Cannot open ${fileName(file)}: ${e.message}`);
    return false;
  }
}
/** An empty project that Save will write to `file` ('' to ask where). */
export function newFile(file: string): void { show(new Doc(newProject(), ''), file, 'New project.'); }

function write(file: string): boolean {
  if (current.project.sequences.length === 0) { setStatus('Nothing to save yet: create a sequence first.'); return false; }
  try {
    fs.writeText(file, current.text());
  } catch (e) {
    setStatus(`Could not save ${fileName(file)}: ${e.message}`);
    return false;
  }
  current.markSaved();
  batch(() => { setPath(file); setStatus(`Saved ${fileName(file)}.`); refresh(); });
  return true;
}
const JSON_FILES = [new dialog.Filter('Museum table project', ['json'])];
export async function saveAs(): Promise<boolean> {
  const o = new dialog.SaveOptions();
  o.title = 'Save the project';
  o.defaultPath = path().length > 0 ? path() : 'project.json';
  o.filters = JSON_FILES;
  const file = await dialog.save(o);
  if (file === null) { setStatus('Not saved.'); return false; }
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
    o.title = 'Open a project';
    o.filters = JSON_FILES;
    dialog.open(o).then((files: string[] | null) => { if (files !== null && files.length > 0) openFile(files[0]); else setStatus('Nothing opened.'); });
  });
}
