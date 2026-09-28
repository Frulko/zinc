// Editor model: the open project as reactive state (Solid signals), graph edits, selection and undo / redo.
// Undo keeps whole-diagram snapshots (project.json text): simple and always consistent.
// ponytail: snapshots cost O(diagram) per edit; fine for hundreds of boxes, diff-based history if it ever is not.
import { createSignal } from 'zinc:ui/solid';
import * as storage from 'zinc:storage';
import * as fs from 'zinc:fs';
import { BoxDef, boxDef, PortDef, DEFAULT_SCRIPT } from './library';
import * as project from './project';
import { ProjectFile, BoxFile, LinkFile, ParamFile } from './project';

/** A box on the diagram. Position, title and parameters are reactive (cards, inspector). */
export class Box {
  id: string; type: string; def: BoxDef;
  title: () => string; private setTitleSig: (v: string) => void;
  x: () => number; setX: (v: number) => void;
  y: () => number; setY: (v: number) => void;
  /** Bumped on every parameter / script change so views re-read them. */
  rev: () => i32; private setRev: (v: i32) => void;
  params: Map<string, string> = new Map<string, string>();
  script: string = '';
  constructor(id: string, def: BoxDef, title: string, x: number, y: number) {
    this.id = id; this.type = def.type; this.def = def;
    const [t, st] = createSignal<string>(title); this.title = t; this.setTitleSig = st;
    const [gx, sx] = createSignal<number>(x); this.x = gx; this.setX = sx;
    const [gy, sy] = createSignal<number>(y); this.y = gy; this.setY = sy;
    const [r, sr] = createSignal<i32>(0); this.rev = r; this.setRev = sr;
    for (const p of def.params) this.params.set(p.name, p.def);
  }
  param(name: string): string { this.rev(); return this.params.get(name) ?? ''; }
  setParamRaw(name: string, v: string): void { this.params.set(name, v); this.setRev(this.rev() + 1); }
  setScriptRaw(s: string): void { this.script = s; this.setRev(this.rev() + 1); }
  setTitleRaw(s: string): void { this.setTitleSig(s); }
}

/** An output -> input link. '@start' / '@end' are the diagram bars. */
export class Link {
  from: string; out: string; to: string; inp: string;
  constructor(from: string, out: string, to: string, inp: string) { this.from = from; this.out = out; this.to = to; this.inp = inp; }
  get key(): string { return `${this.from}.${this.out}>${this.to}.${this.inp}`; }
}

// ---------------------------------------------------------------- state
const [boxesSig, setBoxes] = createSignal<Box[]>([]);
const [linksSig, setLinks] = createSignal<Link[]>([]);
const [selectionSig, setSelectionSig] = createSignal<string[]>([]);
const [linkSelSig, setLinkSel] = createSignal<string>('');
const [assetSelSig, setAssetSel] = createSignal<string>('');
const [dirSig, setDir] = createSignal<string>('');
const [nameSig, setName] = createSignal<string>('Untitled');
const [targetSig, setTargetSig] = createSignal<string>('preview');
const [deviceSig, setDeviceSig] = createSignal<string>('');
const [sizeSig, setSizeSig] = createSignal<number[]>([480, 320]);
const [dirtySig, setDirty] = createSignal<boolean>(false);
const [historySig, setHistorySig] = createSignal<i32>(0);   // bumped when the undo / redo stacks change
/** Bumped on every diagram change (generated code view). */
const [revSig, setRev] = createSignal<i32>(0);

export function boxes(): Box[] { return boxesSig(); }
export function links(): Link[] { return linksSig(); }
export function selection(): string[] { return selectionSig(); }
export function selectedLink(): string { return linkSelSig(); }
export function selectedAsset(): string { return assetSelSig(); }
export function projectDir(): string { return dirSig(); }
export function projectName(): string { return nameSig(); }
export function target(): string { return targetSig(); }
export function device(): string { return deviceSig(); }
export function screenSize(): number[] { return sizeSig(); }
export function dirty(): boolean { return dirtySig(); }
export function revision(): i32 { return revSig(); }

export function findBox(id: string): Box | null { for (const b of boxesSig()) if (b.id === id) return b; return null; }
export function isSelected(id: string): boolean { return selectionSig().indexOf(id) >= 0; }
/** The single selected box, or null (none or several). */
export function selectedBox(): Box | null { const s = selectionSig(); return s.length === 1 ? findBox(s[0]) : null; }
export function select(ids: string[]): void { setSelectionSig(ids); setLinkSel(''); if (ids.length > 0) setAssetSel(''); }
export function toggleSelect(id: string): void {
  const s = selectionSig().slice(), i = s.indexOf(id);
  if (i >= 0) s.splice(i, 1); else s.push(id);
  select(s);
}
export function selectLink(key: string): void { setSelectionSig([]); setLinkSel(key); }
export function selectAsset(name: string): void { setSelectionSig([]); setLinkSel(''); setAssetSel(name); }

// ---------------------------------------------------------------- undo / redo
const undoStack: string[] = [];
const redoStack: string[] = [];
let lastEditKey = '';
export function canUndo(): boolean { historySig(); return undoStack.length > 0; }
export function canRedo(): boolean { historySig(); return redoStack.length > 0; }
/** Call before a change: records the current diagram for undo. Edits with the same `key` (typing in one field)
 *  share one undo step. */
export function checkpoint(key: string): void {
  if (key !== '' && key === lastEditKey) { touched(); return; }
  lastEditKey = key;
  undoStack.push(snapshot());
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  setHistorySig(historySig() + 1);
  touched();
}
function touched(): void { setDirty(true); setRev(revSig() + 1); }
export function undo(): void {
  if (undoStack.length === 0) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  lastEditKey = '';
  setHistorySig(historySig() + 1);
  touched();
}
export function redo(): void {
  if (redoStack.length === 0) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  lastEditKey = '';
  setHistorySig(historySig() + 1);
  touched();
}
function snapshot(): string { return project.serialize(toFile()); }
function restore(text: string): void {
  const keep = selectionSig();
  fromFile(project.parse(text));
  select(keep.filter((id: string) => findBox(id) !== null));
}

// ---------------------------------------------------------------- conversion
export function toFile(): ProjectFile {
  const p = project.emptyProject(nameSig());
  p.target = targetSig(); p.device = deviceSig();
  p.width = sizeSig()[0]; p.height = sizeSig()[1];
  for (const b of boxesSig()) {
    const params: ParamFile[] = [];
    for (const d of b.def.params) params.push({ name: d.name, value: b.params.get(d.name) ?? d.def });
    p.boxes.push({ id: b.id, type: b.type, title: b.title(), x: Math.round(b.x()), y: Math.round(b.y()), params: params, script: b.script });
  }
  for (const l of linksSig()) p.links.push({ from: l.from, out: l.out, to: l.to, inp: l.inp });
  return p;
}
function fromFile(p: ProjectFile): void {
  setName(p.name); setTargetSig(p.target !== '' ? p.target : 'preview'); setDeviceSig(p.device);
  setSizeSig([p.width > 0 ? p.width : 480, p.height > 0 ? p.height : 320]);
  const list: Box[] = [];
  for (const f of p.boxes) {
    const d = boxDef(f.type);
    if (d === null) { console.warn(`studio: unknown box type ${f.type} (${f.id}) dropped`); continue; }
    const b = new Box(f.id, d, f.title, f.x, f.y);
    for (const q of f.params) b.params.set(q.name, q.value);
    b.script = f.script;
    list.push(b);
  }
  setBoxes(list);
  setLinks(p.links.map((l: LinkFile) => new Link(l.from, l.out, l.to, l.inp)));
}

// ---------------------------------------------------------------- graph edits
function nextId(): string {
  let n = 0;
  for (const b of boxesSig()) if (b.id.startsWith('b')) { const k = parseInt(b.id.slice(1)); if (!isNaN(k) && k > n) n = k; }
  return `b${n + 1}`;
}
export function addBox(type: string, x: number, y: number): Box | null {
  const d = boxDef(type);
  if (d === null) return null;
  checkpoint('');
  const b = new Box(nextId(), d, d.title, Math.round(x), Math.round(y));
  if (type === 'script') b.script = DEFAULT_SCRIPT;
  const list = boxesSig().slice();
  list.push(b);
  setBoxes(list);
  select([b.id]);
  return b;
}
export function removeSelected(): void {
  const sel = selectionSig(), lk = linkSelSig();
  if (sel.length === 0 && lk === '') return;
  checkpoint('');
  if (lk !== '') { setLinks(linksSig().filter((l: Link) => l.key !== lk)); setLinkSel(''); return; }
  setBoxes(boxesSig().filter((b: Box) => sel.indexOf(b.id) < 0));
  setLinks(linksSig().filter((l: Link) => sel.indexOf(l.from) < 0 && sel.indexOf(l.to) < 0));
  select([]);
}
/** Copies the selected boxes (and the links between them) 32 px down-right. */
export function duplicateSelected(): void {
  const sel = selectionSig();
  if (sel.length === 0) return;
  checkpoint('');
  const list = boxesSig().slice(), ids = new Map<string, string>(), fresh: string[] = [];
  for (const id of sel) {
    const src = findBox(id);
    if (src === null) continue;
    const b = new Box(nextIdIn(list), src.def, src.title(), src.x() + 32, src.y() + 32);
    src.params.forEach((v: string, k: string) => { b.params.set(k, v); });
    b.script = src.script;
    list.push(b);
    ids.set(id, b.id);
    fresh.push(b.id);
  }
  const ls = linksSig().slice();
  for (const l of linksSig()) {
    const a = ids.get(l.from), c = ids.get(l.to);
    if (a !== undefined && c !== undefined) ls.push(new Link(a, l.out, c, l.inp));
  }
  setBoxes(list); setLinks(ls);
  select(fresh);
}
function nextIdIn(list: Box[]): string {
  let n = 0;
  for (const b of list) if (b.id.startsWith('b')) { const k = parseInt(b.id.slice(1)); if (!isNaN(k) && k > n) n = k; }
  return `b${n + 1}`;
}
/** Port of a box or bar: '@start' has the output onStart, '@end' the input onStopped. */
export function portOf(id: string, name: string, output: boolean): PortDef | null {
  if (id === '@start') return output && name === 'onStart' ? new PortDef('onStart', 'signal', '') : null;
  if (id === '@end') return !output && name === 'onStopped' ? new PortDef('onStopped', 'signal', '') : null;
  const b = findBox(id);
  if (b === null) return null;
  return output ? b.def.output(name) : b.def.input(name);
}
/** Why a link cannot be made ('' when it can): a value output may trigger a signal input, not the reverse. */
export function linkError(from: string, out: string, to: string, inp: string): string {
  const a = portOf(from, out, true), b = portOf(to, inp, false);
  if (a === null || b === null) return 'unknown port';
  if (from === to) return 'a box cannot feed itself';
  if (a.isSignal && !b.isSignal) return 'a signal cannot feed a value input';
  for (const l of linksSig()) if (l.from === from && l.out === out && l.to === to && l.inp === inp) return 'already linked';
  return '';
}
export function connect(from: string, out: string, to: string, inp: string): string {
  const err = linkError(from, out, to, inp);
  if (err !== '') return err;
  checkpoint('');
  const ls = linksSig().slice();
  ls.push(new Link(from, out, to, inp));
  setLinks(ls);
  return '';
}
export function removeLink(key: string): void {
  checkpoint('');
  setLinks(linksSig().filter((l: Link) => l.key !== key));
}
/** Moves boxes by (dx, dy) world units from their positions at the start of the drag. */
export function moveTo(b: Box, x: number, y: number): void { b.setX(Math.round(x)); b.setY(Math.round(y)); setRev(revSig() + 1); }
export function setParam(b: Box, name: string, v: string): void { checkpoint(`param:${b.id}:${name}`); b.setParamRaw(name, v); }
export function setTitle(b: Box, v: string): void { checkpoint(`title:${b.id}`); b.setTitleRaw(v); }
export function setScript(b: Box, v: string): void { checkpoint(`script:${b.id}`); b.setScriptRaw(v); }
export function setTarget(t: string): void { if (t !== targetSig()) { checkpoint(''); setTargetSig(t); } }
export function setDevice(d: string): void { checkpoint('device'); setDeviceSig(d); }
export function setProjectName(n: string): void { checkpoint('name'); setName(n); }
export function setScreenSize(w: number, h: number): void { checkpoint('size'); setSizeSig([w, h]); }

/** Why a parameter value is invalid ('' when valid). */
export function paramError(d: BoxDef, name: string, v: string): string {
  const p = d.param(name);
  if (p === null) return '';
  if (p.type === 'number') {
    const n = parseFloat(v);
    if (v.trim() === '' || isNaN(n)) return 'Enter a number';
    if (n < p.min) return `Minimum ${p.min}`;
    if (n > p.max) return `Maximum ${p.max}`;
  }
  if ((p.type === 'asset') && v.trim() === '') return 'Pick an asset';
  return '';
}

// ---------------------------------------------------------------- files
export function newProject(dir: string): void {
  const p = project.emptyProject(project.nameOf(dir));
  project.save(dir, p);
  openFile(project.absolute(dir), p);
}
/** Opens a project folder; throws when project.json cannot be read. */
export function openProject(dir: string): void { openFile(project.absolute(dir), project.load(dir)); }
function openFile(dir: string, p: ProjectFile): void {
  fromFile(p);
  setDir(dir);
  undoStack.length = 0; redoStack.length = 0; lastEditKey = '';
  setHistorySig(historySig() + 1);
  setDirty(false);
  select([]);
  setAssetSel('');
  setRev(revSig() + 1);
  remember(dir);
}
export function saveProject(): void {
  const dir = dirSig();
  if (dir === '') return;
  project.save(dir, toFile());
  setDirty(false);
  lastEditKey = '';
}

// ---------------------------------------------------------------- recent projects (zinc:storage)
export function recentProjects(): string[] {
  const s = storage.get('studio.recent');
  if (s === '') return [];
  return s.split('\n').filter((d: string) => fs.exists(project.join(d, 'project.json')));
}
function remember(dir: string): void {
  const list = recentProjects().filter((d: string) => d !== dir);
  list.unshift(dir);
  storage.set('studio.recent', list.slice(0, 8).join('\n'));
}
