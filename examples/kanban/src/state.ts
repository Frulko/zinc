import { createSignal, createMemo, batch } from 'zinc:ui/solid';
import { Task, Detail, Criterion, copyDetail, assignment, activityState } from './models';
import { STATUSES, ACTIVITY_LIMIT } from './constants';
import { startBacklog, loadDetail, cancelDetail, editTask, commentTask } from './services/backlog';

export const [tasks, setTasks] = createSignal<Task[]>([]);
export const [sourceTasks, setSourceTasks] = createSignal<Task[]>([]);
export const [query, setQuery] = createSignal<string>('');
export const [scope, setScope] = createSignal<string>('all');
export const [milestone, setMilestone] = createSignal<string>('');
export const [live, setLive] = createSignal<boolean>(false);
export const [connection, setConnection] = createSignal<string>('Connexion au backlog…');
export const [selectedId, setSelectedId] = createSignal<string>('');
export const [detail, setDetail] = createSignal<Detail | null>(null);
export const [detailError, setDetailError] = createSignal<string>('');
export const [activity, setActivity] = createSignal<string[]>([]);
export const [localCount, setLocalCount] = createSignal<number>(0);
export const [notice, setNotice] = createSignal<string>('Glissez une carte, ou ouvrez-la pour la déplacer au clavier.');
export const [draggedId, setDraggedId] = createSignal<string>('');
export const [dropId, setDropId] = createSignal<string>('');
export const [activityOpen, setActivityOpen] = createSignal<boolean>(false);
export const [editing, setEditing] = createSignal<boolean>(false);
export const [editDraft, setEditDraft] = createSignal<Detail>(new Detail());
export const [commentDraft, setCommentDraft] = createSignal<string>('');
export const [saving, setSaving] = createSignal<boolean>(false);
export const [writeError, setWriteError] = createSignal<string>('');

class Draft {
  content: Detail = new Detail(); comment = ''; editing = false; base: Detail | null = null;
}
const drafts = new Map<string, Draft>();
let editBase: Detail | null = null;

const overrides = new Map<string, string>();
export const selected = createMemo<Task | null>(() => tasks().find((t: Task) => t.id === selectedId()) ?? null, null);
export const milestones = createMemo<string[]>(() => {
  const values: string[] = [];
  for (const t of tasks()) if (t.milestone !== '' && values.indexOf(t.milestone) < 0) values.push(t.milestone);
  values.sort((a: string, b: string) => a.localeCompare(b)); return values;
}, []);
export const filtered = createMemo<Task[]>(() => {
  const q = query().trim().toLowerCase(), s = scope(), m = milestone();
  return tasks().filter((t: Task) => (m === '' || t.milestone === m)
    && (s === 'all' || (s === 'active' && t.status === 'In Progress') || (s === 'assigned' && t.assignees.length > 0) || (s === 'open' && t.status !== 'Done'))
    && (q === '' || (t.id + ' ' + t.title + ' ' + t.labels.join(' ') + ' ' + t.assignees.join(' ') + ' ' + t.milestone).toLowerCase().includes(q)));
}, []);
export function inColumn(status: string): Task[] { return filtered().filter((t: Task) => t.status === status); }
export function taskOf(id: string): Task | null { return tasks().find((t: Task) => t.id === id) ?? null; }
export function declaredState(id: string): string {
  const t = sourceTasks().find((x: Task) => x.id === id);
  return t === undefined ? '' : activityState(t);
}
function record(message: string): void { setActivity([new Date().toISOString().slice(11, 19) + ' · ' + message, ...activity()].slice(0, ACTIVITY_LIMIT)); }
function fetchDetail(id: string): void {
  setDetail(null); setDetailError('');
  loadDetail(id, (d: Detail | null, error: string) => { if (selectedId() === id) { setDetail(d); setDetailError(error); } });
}
function rememberDraft(): void {
  if (selectedId() === '') return;
  if (!editing() && commentDraft() === '') { drafts.delete(selectedId()); return; }
  const d = new Draft(); d.content = editDraft(); d.comment = commentDraft(); d.editing = editing(); d.base = editBase;
  drafts.set(selectedId(), d);
}
export function openTask(id: string): void {
  if (saving()) return;
  rememberDraft();
  const d = drafts.get(id);
  batch(() => { setEditing(d !== undefined && d.editing); setEditDraft(d !== undefined ? d.content : new Detail()); setCommentDraft(d !== undefined ? d.comment : ''); setWriteError(''); });
  editBase = d !== undefined ? d.base : null;
  setSelectedId(id); fetchDetail(id);
}
export function closeTask(): void {
  if (saving()) return;
  rememberDraft(); setSelectedId(''); setDetail(null); cancelDetail();
}
export function beginEdit(): void {
  const d = detail(); if (d === null || saving()) return;
  editBase = d; const draft = copyDetail(d); draft.title = d.title !== '' ? d.title : selected()?.title ?? '';
  batch(() => { setEditDraft(draft); setEditing(true); setWriteError(''); });
}
export function setEditField(field: string, value: string): void {
  const d = copyDetail(editDraft());
  if (field === 'title') d.title = value;
  else if (field === 'description') d.description = value;
  else if (field === 'plan') d.plan = value;
  else if (field === 'notes') d.notes = value;
  else if (field === 'summary') d.summary = value;
  else throw new Error('Unknown task field: ' + field);
  setEditDraft(d);
}
export function updateCriterion(index: i32, text: string, checked: boolean): void {
  const d = copyDetail(editDraft()); d.criteria[index].text = text; d.criteria[index].checked = checked; setEditDraft(d);
}
export function addCriterion(): void { const d = copyDetail(editDraft()); d.criteria.push(new Criterion()); setEditDraft(d); }
export function removeCriterion(index: i32): void { const d = copyDetail(editDraft()); d.criteria.splice(index, 1); setEditDraft(d); }
export function cancelEdit(): void { if (!saving()) { setEditing(false); setWriteError(''); } }
export async function saveEdits(): Promise<void> {
  if (saving() || editBase === null) return;
  setSaving(true); setWriteError('');
  try { await editTask(editBase as Detail, editDraft()); setEditing(false); fetchDetail(selectedId()); setNotice('Modifications enregistrées dans Backlog.md.'); }
  catch (e) { setWriteError('' + e); }
  setSaving(false);
}
export async function postComment(): Promise<void> {
  if (saving() || commentDraft().trim() === '') return;
  setSaving(true); setWriteError('');
  try { await commentTask(selectedId(), commentDraft()); setCommentDraft(''); fetchDetail(selectedId()); setNotice('Commentaire enregistré dans Backlog.md.'); }
  catch (e) { setWriteError('' + e); }
  setSaving(false);
}

export function acceptSnapshot(next: Task[]): void {
  const previous = new Map<string, Task>();
  for (const t of sourceTasks()) previous.set(t.id, t);
  for (const t of next) {
    const old = previous.get(t.id);
    if (old === undefined) { if (sourceTasks().length > 0) record(t.id + ' · nouvelle tâche'); continue; }
    if (old.status !== t.status || old.assignees.join(',') !== t.assignees.join(',')) {
      overrides.delete(t.id);
      record(t.id + ' · ' + activityState(t) + ' · ' + assignment(t));
    }
  }
  const current = new Map<string, Task>();
  for (const t of next) current.set(t.id, t);
  const order = (overrides.size > 0 ? tasks() : next).map((t: Task) => t.id), arranged: Task[] = [];
  for (const id of order) { const t = current.get(id); if (t !== undefined) { arranged.push(t); current.delete(id); } }
  current.forEach((t: Task) => arranged.push(t));
  const output: Task[] = [];
  for (const t of arranged) {
    const status = overrides.get(t.id);
    if (status !== undefined) { const copy = clone(t); copy.status = status; output.push(copy); } else output.push(t);
  }
  for (const id of Array.from(overrides.keys())) if (!next.some((t: Task) => t.id === id)) overrides.delete(id);
  batch(() => { setSourceTasks(next); setTasks(output); setLocalCount(overrides.size); });
  if (selectedId() !== '') {
    const t = next.find((x: Task) => x.id === selectedId());
    if (t === undefined) closeTask();
    else { const old = previous.get(t.id); if (old === undefined || old.updated !== t.updated) fetchDetail(t.id); }
  }
}
function clone(t: Task): Task {
  const n = new Task();
  n.id = t.id; n.title = t.title; n.status = t.status; n.assignees = t.assignees; n.labels = t.labels;
  n.milestone = t.milestone; n.parent = t.parent; n.priority = t.priority; n.completed = t.completed;
  n.criteria = t.criteria; n.ordinal = t.ordinal; n.updated = t.updated; n.ready = t.ready; return n;
}
export function moveTask(id: string, status: string, targetId: string = '', after: boolean = false): void {
  if (STATUSES.indexOf(status) < 0 || id === targetId) return;
  const task = taskOf(id);
  if (task === null) return;
  const list = tasks().filter((t: Task) => t.id !== id), copy = clone(task as Task);
  copy.status = status;
  let at = targetId === '' ? -1 : list.findIndex((t: Task) => t.id === targetId);
  if (at >= 0 && after) at++;
  if (at < 0) { at = list.length; for (let i = 0; i < list.length; i++) if (list[i].status === status) at = i + 1; }
  const arranged = [...list.slice(0, at), copy, ...list.slice(at)];
  overrides.set(id, status);
  setTasks(arranged); setLocalCount(overrides.size);
  setNotice(id + ' déplacée · modification locale, backlog source inchangé');
  console.log('kanban move ' + id + ' -> ' + status + (targetId !== '' ? ' ' + (after ? 'after ' : 'before ') + targetId : ''));
}
export function resetBoard(): void {
  overrides.clear(); setLocalCount(0); setTasks(sourceTasks().slice());
  setNotice('Tableau réinitialisé depuis le backlog source.');
}
export function connect(): void {
  setConnection('Connexion au backlog…'); setLive(false);
  startBacklog(acceptSnapshot, (connected: boolean, message: string) => { setLive(connected); setConnection(message); });
}
