// The transfers: a queue of jobs (add, download, backup, restore, delete, repair) run one at a time, since zinc:ipod has one
// worker and one open iPod. A job's progress comes from ipod.onProgress: item counts (add, download, backup, restore) and the
// bytes of the file being copied (copy). A job that has not started can be cancelled; one that runs finishes. Every job ends
// in the log with its result; every step it reports (phase, item, detail) is a line of its detail view and of details.log.
// Each job is also announced where the owner is (components/Toasts.tsx): a toast from the moment it is queued until it has ended
// (a failure stays until closed), and the sidebar's Transfers row counts what runs and marks a failure not seen yet.
import { createSignal, batch, untrack } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { log, now, backupPlace } from './log';

export const WAITING = 'waiting', RUNNING = 'running', DONE = 'done', FAILED = 'failed', CANCELLED = 'cancelled';

/** One item of a job, shown when its row is opened: a file added (its title, artist and album) or refused (why), a track downloaded. */
export class JobLine {
  ok: boolean; text: string;
  /** The file's size in bytes, -1 when unknown. */
  size: number;
  constructor(ok: boolean, text: string, size: number) { this.ok = ok; this.text = text; this.size = size; }
}

export enum DownloadState { Waiting, Running, Done, Failed, Cancelled }
export class TrackDownload {
  constructor(public id: string, public state: DownloadState = DownloadState.Waiting, public fraction: number = 0) {}
}

export class Job {
  id: i32; kind: string; label: string;
  downloads: () => TrackDownload[]; setDownloads: (items: TrackDownload[]) => void;
  /** What the control that started it asks busy() (a track's arrow: 'track:<id>'); the label by default. */
  key: string;
  /** A file or folder the result can be revealed in Finder ('' = none): set by the work before it resolves. */
  reveal: string = '';
  /** False for a message that is only a toast (an eject): it has no row in Transfers. */
  queued: boolean = true;
  /** Asks a running job to stop (a history import: it stops after the page it reads and resumes later); null when it cannot. */
  stop: (() => void) | null = null;
  /** Does the job; resolves with the line its result shows ("3 added, 1 refused"). */
  work: () => Promise<string>;
  status: () => string; setStatus: (s: string) => void;
  /** Items done of the job (files, tracks), and the bytes (KiB) of the file being copied. */
  done: () => number; setDone: (n: number) => void;
  total: () => number; setTotal: (n: number) => void;
  fileDone: () => number; setFileDone: (n: number) => void;
  fileTotal: () => number; setFileTotal: (n: number) => void;
  detail: () => string; setDetail: (s: string) => void;
  result: () => string; setResult: (s: string) => void;
  lines: () => JobLine[]; setLines: (l: JobLine[]) => void;
  /** What the job did, step by step, as zinc:ipod reports it (the last EVENTS_SHOWN lines; every line is in details.log). */
  events: () => string; setEvents: (s: string) => void;
  private kept: string[] = [];
  private dropped: number = 0;
  constructor(id: i32, kind: string, label: string, work: () => Promise<string>) {
    const [items, setItems] = createSignal<TrackDownload[]>([]); this.downloads = items; this.setDownloads = setItems;
    this.id = id; this.kind = kind; this.label = label; this.work = work; this.key = label;
    const [s, ss] = createSignal<string>(WAITING); this.status = s; this.setStatus = ss;
    const [d, sd] = createSignal<number>(0); this.done = d; this.setDone = sd;
    const [t, st] = createSignal<number>(0); this.total = t; this.setTotal = st;
    const [fd, sfd] = createSignal<number>(0); this.fileDone = fd; this.setFileDone = sfd;
    const [ft, sft] = createSignal<number>(0); this.fileTotal = ft; this.setFileTotal = sft;
    const [de, sde] = createSignal<string>(''); this.detail = de; this.setDetail = sde;
    const [r, sr] = createSignal<string>(''); this.result = r; this.setResult = sr;
    const [l, sl] = createSignal<JobLine[]>([]); this.lines = l; this.setLines = sl;
    const [ev, sev] = createSignal<string>(''); this.events = ev; this.setEvents = sev;
  }
  /** One transition boundary for each ordered track; final results cannot be reopened by a late copy event. */
  downloadState(index: i32, state: DownloadState, fraction: number): void {
    const items = this.downloads();
    if (index < 0 || index >= items.length) return;
    const prior = items[index];
    if (prior.state !== DownloadState.Waiting && prior.state !== DownloadState.Running) return;
    if (state !== DownloadState.Running && state !== DownloadState.Done && state !== DownloadState.Failed) return;
    const next = items.slice();
    next[index] = new TrackDownload(prior.id, state, Math.max(0, Math.min(1, fraction)));
    this.setDownloads(next);
  }
  /** Adds a step to the job's detail view and to <backups>/logs/details.log. */
  note(text: string): void {
    const line = `${now().slice(11)}  ${text}`;
    this.kept.push(line);
    if (this.kept.length > EVENTS_SHOWN) { this.kept.shift(); this.dropped++; }
    this.setEvents((this.dropped > 0 ? `… ${this.dropped} earlier lines in ${detailsFile()}\n` : '') + this.kept.join('\n'));
    try { fs.mkdir(`${backupPlace()}/logs`, true); fs.appendText(detailsFile(), `${now()}\t${this.label}\t${text}\n`); } catch (e) { /* the view still has it */ }
  }
  /** 0..1: the items done, plus the share of the file being copied. */
  fraction(): number {
    const t = this.total(), ft = this.fileTotal();
    const part = ft > 0 ? Math.min(1, this.fileDone() / ft) : 0;
    if (t > 0) return Math.min(1, (Math.min(this.done(), t - 1) + part) / t);
    return part;
  }
  /** One line of where it stands: waiting, the item and file being copied, or its result. */
  summary(): string {
    const s = this.status();
    if (s === WAITING) return 'Waiting for the jobs before it';
    if (s === RUNNING) return this.total() > 0 ? `${Math.min(this.done() + 1, this.total())} of ${this.total()}${this.detail() !== '' ? ` · ${this.detail()}` : ''}` : this.detail() !== '' ? this.detail() : 'Working…';
    return this.result();
  }
  /** Waiting or running. */
  active(): boolean { const s = this.status(); return s === WAITING || s === RUNNING; }
}

const KIND_ICONS: string[] = ['add', 'plus', 'download', 'download', 'backup', 'archive', 'restore', 'rotate-ccw', 'delete', 'x', 'check', 'shield-check', 'repair', 'wrench',
  'analyse', 'sparkles', 'merge', 'copy', 'eject', 'eject', 'mount', 'usb', 'history', 'radio', 'info', 'info'];
/** The icon of a kind of job. */
export function iconOf(kind: string): string { for (let i = 0; i < KIND_ICONS.length; i += 2) if (KIND_ICONS[i] === kind) return KIND_ICONS[i + 1]; return 'arrow-down-up'; }

const EVENTS_SHOWN = 400;
/** Every step of every job, one line each (the detail views show the last ones). */
export function detailsFile(): string { return `${backupPlace()}/logs/details.log`; }

export const [jobs, setJobs] = createSignal<Job[]>([]);
/** The job running, null when the queue rests. */
/** A monotonic job identity survives page navigation; only a mounted, revealed row consumes it. */
export const [revealJobId, setRevealJobId] = createSignal<i32>(0);
export function requestJobReveal(id: i32): void { setRevealJobId(jobs().some((j: Job) => j.id === id) ? id : 0); }
export const [runningJob, setRunningJob] = createSignal<Job | null>(null);

let nextId: i32 = 1;
let listening = false;

/** The jobs announced by a toast, oldest first (components/Toasts.tsx shows the last three). */
export const [toasts, setToasts] = createSignal<Job[]>([]);
/** How many jobs failed since the Transfers page was last shown (the sidebar's red dot). */
export const [unseenFailed, setUnseenFailed] = createSignal<i32>(0);

/** How many jobs wait or run (the sidebar's indicator). */
export function pending(): i32 { let n = 0; for (const j of jobs()) if (j.active()) n++; return n; }

/** 0..1 over the jobs that wait or run (one waiting counts as not started). */
export function overallFraction(): number {
  let n = 0, sum = 0;
  for (const j of jobs()) if (j.active()) { n++; sum += j.status() === RUNNING ? j.fraction() : 0; }
  return n > 0 ? sum / n : 0;
}

/** True while a job of this kind ('backup') or key (a label, 'track:<id>') waits or runs: its control shows busy. */
export function busy(match: string): boolean { for (const j of jobs()) if (j.active() && (j.kind === match || j.key === match)) return true; return false; }

/** The last job queued with this key, null when none was. */
export function latestJob(key: string): Job | null { const all = jobs(); for (let i = all.length - 1; i >= 0; i--) if (all[i].key === key) return all[i]; return null; }

/** Latest request wins, including a cancelled retry; album and playlist members use the same track identity. */
export function trackDownload(id: string): TrackDownload | null {
  const all = jobs();
  for (let i = all.length - 1; i >= 0; i--) {
    const job = all[i];
    for (const item of job.downloads()) if (item.id === id) {
      let state = item.state;
      if (state === DownloadState.Waiting || state === DownloadState.Running) {
        if (job.status() === CANCELLED) state = DownloadState.Cancelled;
        else if (job.status() === FAILED) state = DownloadState.Failed;
      }
      const view = new TrackDownload(id, state, item.fraction);
      return view;
    }
  }
  return null;
}

/** Native copy precedes its ordered download completion; filenames need not be unique. */
function downloadProgress(job: Job, phase: string, done: number, total: number): void {
  const items = job.downloads();
  const index = phase === 'download' ? done - 1 : job.done();
  if (index < 0 || index >= items.length) return;
  job.downloadState(index, DownloadState.Running, phase === 'download' ? 1 : total > 0 ? done / total : 0);
}

export function dismissToast(job: Job): void { setToasts(toasts().filter((j: Job) => j !== job)); }
/** The Transfers page shows it all: the toasts of the jobs that ended go, and the failures count as seen. */
export function transfersSeen(): void {
  const keep = untrack((): Job[] => toasts().filter((j: Job) => j.active()));
  batch(() => { setToasts(keep); setUnseenFailed(0); });
}

/** A toast that is not a job (an eject, a mount): its sentence, red when `ok` is false. */
export function notify(kind: string, label: string, result: string, ok: boolean): void {
  const job = new Job(0, kind, label, async (): Promise<string> => result);
  job.queued = false;
  batch(() => { job.setStatus(ok ? DONE : FAILED); job.setResult(result); setToasts([...toasts(), job]); });
}

/** Queues a job; it starts when the ones before it end. */
export function enqueue(kind: string, label: string, work: () => Promise<string>, key: string = '', downloadIds: string[] = []): Job {
  if (!listening) {
    listening = true;
    ipod.onProgress((phase: string, done: i32, total: i32, detail: string) => {
      const j = runningJob();
      if (j === null) return;
      const job = j as Job;
      if (phase === 'copy') { if (detail !== job.detail()) job.note(`copy ${detail}`); }   // one line per file, not per block
      else if (detail !== '') job.note(total > 0 && done > 0 ? `${phase} ${done}/${total}  ${detail}` : `${phase}  ${detail}`);
      batch(() => {
        if (job.kind === 'download' && (phase === 'copy' || phase === 'download')) downloadProgress(job, phase, done, total);
        if (phase === 'copy') { job.setFileDone(done); job.setFileTotal(total); job.setDetail(detail); }
        else if (phase !== 'save' && phase !== 'artwork') { job.setDone(done); job.setTotal(total); job.setFileDone(0); job.setFileTotal(0); }
      });
    });
  }
  const job = new Job(nextId++, kind, label, work);
  if (key !== '') job.key = key;
  job.setDownloads(downloadIds.map((id: string) => new TrackDownload(id)));
  if (downloadIds.length > 0) job.setTotal(downloadIds.length);
  batch(() => { setJobs([...jobs(), job]); setToasts([...toasts(), job]); });
  pump();
  return job;
}

export function cancel(job: Job): void {
  if (job.status() === RUNNING && job.stop !== null) { job.note('stop asked'); (job.stop as () => void)(); return; }
  if (job.status() !== WAITING) return;
  batch(() => { job.setStatus(CANCELLED); job.setResult('Cancelled before it started'); });
  log(job.label, 'cancelled before it started', true);
}

/** Cancels every job that has not started (the iPod is gone). */
export function cancelWaiting(): void { for (const j of jobs()) cancel(j); }

/** Drops the jobs that ended from the list. */
export function clearFinished(): void {
  const keep: Job[] = [];
  for (const j of jobs()) if (j.status() === WAITING || j.status() === RUNNING) keep.push(j);
  batch(() => { setJobs(keep); if (!keep.some((j: Job) => j.id === revealJobId())) setRevealJobId(0); });
}

/** Starts a job at once beside the queue: one that does not use the iPod (a history import), so the iPod's jobs do not wait for it.
 *  `stop` (Cancel while it runs) asks it to stop. */
export function runBeside(kind: string, label: string, work: () => Promise<string>, stop: () => void): Job {
  const job = new Job(nextId++, kind, label, work);
  job.stop = stop;
  batch(() => { setJobs([...jobs(), job]); setToasts([...toasts(), job]); job.setStatus(RUNNING); });
  job.note(`started: ${job.label}`);
  finish(job);
  return job;
}

async function finish(job: Job): Promise<void> {
  try {
    const line = await job.work();
    job.note(`done: ${line}`);
    batch(() => { job.setStatus(DONE); job.setResult(line); job.setDone(job.total()); });
    log(job.label, line, true);
  } catch (e) {
    const why = (e as Error).message;
    job.note(`failed: ${why}`);
    batch(() => { job.setStatus(FAILED); job.setResult(why); setUnseenFailed(unseenFailed() + 1); });
    log(job.label, why, false);
  }
}

async function pump(): Promise<void> {
  if (runningJob() !== null) return;
  let next: Job | null = null;
  for (const j of jobs()) if (j.status() === WAITING) { next = j; break; }
  if (next === null) return;
  const job = next as Job;
  batch(() => { setRunningJob(job); job.setStatus(RUNNING); });
  job.note(`started: ${job.label}`);
  await finish(job);
  setRunningJob(null);
  pump();
}
