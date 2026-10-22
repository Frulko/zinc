import { STATUSES } from './constants';

export class Task {
  id: string = ''; title: string = ''; status: string = 'Backlog';
  assignees: string[] = []; labels: string[] = [];
  milestone: string = ''; parent: string = ''; priority: string = '';
  completed: number = 0; criteria: number = 0; ordinal: number = 0;
  updated: string = ''; ready: boolean = false;
}
export class Criterion {
  text: string = ''; checked: boolean = false;
}
export class Detail {
  id: string = ''; title: string = ''; description: string = ''; notes: string = ''; plan: string = '';
  summary: string = ''; path: string = ''; dependencies: string[] = [];
  criteria: Criterion[] = [];
  comments: Comment[] = [];
}
export class Comment {
  body: string = ''; author: string = ''; created: string = '';
}
export function copyDetail(d: Detail): Detail {
  const n = new Detail();
  n.id = d.id; n.title = d.title; n.description = d.description; n.plan = d.plan; n.notes = d.notes; n.summary = d.summary;
  n.path = d.path; n.dependencies = d.dependencies; n.comments = d.comments;
  n.criteria = d.criteria.map((c: Criterion) => { const ac = new Criterion(); ac.text = c.text; ac.checked = c.checked; return ac; });
  return n;
}
export function text(v: any): string { return typeof v === 'string' ? v as string : ''; }
function number(v: any): number { return typeof v === 'number' && Number.isFinite(v as number) ? v as number : 0; }
export function strings(v: any): string[] {
  const out: string[] = [];
  if (Array.isArray(v)) for (const s of v) if (typeof s === 'string') out.push(s as string);
  return out;
}
export function decodeTasks(raw: string): Task[] {
  const j = JSON.parse(raw);
  if (j.schemaVersion !== 1 || j.kind !== 'task-list' || !Array.isArray(j.tasks)) throw new Error('Format Backlog.md incompatible.');
  const out: Task[] = [], seen = new Set<string>();
  for (const v of j.tasks) {
    const t = new Task();
    t.id = text(v.id); t.title = text(v.title); t.status = text(v.status);
    if (t.id === '' || seen.has(t.id) || STATUSES.indexOf(t.status) < 0) throw new Error('Tâche ou statut invalide : ' + t.id);
    seen.add(t.id);
    t.assignees = strings(v.assignees); t.labels = strings(v.labels);
    t.milestone = text(v.milestone); t.parent = text(v.parentTaskId); t.priority = text(v.priority);
    t.completed = number(v.acceptanceCriteriaCompleted); t.criteria = number(v.acceptanceCriteriaCount);
    t.ordinal = number(v.ordinal); t.updated = text(v.updatedAt); t.ready = v.isReady === true;
    out.push(t);
  }
  out.sort((a: Task, b: Task): number => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
  return out;
}
export function decodeDetail(raw: string): Detail {
  const j = JSON.parse(raw);
  if (j.schemaVersion !== 1 || j.kind !== 'task-view' || j.task === null || j.task === undefined) throw new Error('Détail Backlog.md incompatible.');
  const v = j.task, d = new Detail();
  d.id = text(v.id); d.title = text(v.title); d.description = text(v.description); d.notes = text(v.implementationNotes);
  d.plan = text(v.implementationPlan); d.summary = text(v.finalSummary); d.path = text(v.path); d.dependencies = strings(v.dependencies);
  if (Array.isArray(v.acceptanceCriteria)) for (const c of v.acceptanceCriteria) {
    const ac = new Criterion(); ac.text = text(c.text); ac.checked = c.checked === true; d.criteria.push(ac);
  }
  if (Array.isArray(v.comments)) for (const c of v.comments) {
    const comment = new Comment(); comment.body = text(c.body); comment.author = text(c.author); comment.created = text(c.createdAt);
    d.comments.push(comment);
  }
  return d;
}
export function assignment(t: Task): string {
  if (t.assignees.length === 0) return t.status === 'In Progress' ? 'Agent non renseigné' : 'Non assignée';
  return t.assignees.map((a: string) => a === '@parallel' ? 'Agent parallèle · identité inconnue' : a).join(', ');
}
export function activityState(t: Task): string {
  if (t.status === 'Done') return 'Terminée';
  if (t.status === 'Review') return 'En revue';
  return t.status === 'In Progress' ? 'Prise en charge déclarée' : t.assignees.length > 0 ? 'Réservée' : 'Disponible';
}
