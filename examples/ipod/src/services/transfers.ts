// The transfers: a queue of jobs (add, download, backup, restore, delete, repair) run one at a time, since zinc:ipod has one
// worker and one open iPod. A job's progress comes from ipod.onProgress: item counts (add, download, backup, restore) and the
// bytes of the file being copied (copy). A job that has not started can be cancelled; one that runs finishes. Every job ends
// in the log with its result.
import { createSignal, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { log } from './log';

export const WAITING = 'waiting', RUNNING = 'running', DONE = 'done', FAILED = 'failed', CANCELLED = 'cancelled';

export class Job {
  id: i32; kind: string; label: string;
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
  constructor(id: i32, kind: string, label: string, work: () => Promise<string>) {
    this.id = id; this.kind = kind; this.label = label; this.work = work;
    const [s, ss] = createSignal<string>(WAITING); this.status = s; this.setStatus = ss;
    const [d, sd] = createSignal<number>(0); this.done = d; this.setDone = sd;
    const [t, st] = createSignal<number>(0); this.total = t; this.setTotal = st;
    const [fd, sfd] = createSignal<number>(0); this.fileDone = fd; this.setFileDone = sfd;
    const [ft, sft] = createSignal<number>(0); this.fileTotal = ft; this.setFileTotal = sft;
    const [de, sde] = createSignal<string>(''); this.detail = de; this.setDetail = sde;
    const [r, sr] = createSignal<string>(''); this.result = r; this.setResult = sr;
  }
  /** 0..1: the items done, plus the share of the file being copied. */
  fraction(): number {
    const t = this.total(), ft = this.fileTotal();
    const part = ft > 0 ? Math.min(1, this.fileDone() / ft) : 0;
    if (t > 0) return Math.min(1, (Math.min(this.done(), t - 1) + part) / t);
    return part;
  }
}

export const [jobs, setJobs] = createSignal<Job[]>([]);
/** The job running, null when the queue rests. */
export const [runningJob, setRunningJob] = createSignal<Job | null>(null);

let nextId: i32 = 1;
let listening = false;

/** How many jobs wait or run (the sidebar's indicator). */
export function pending(): i32 { let n = 0; for (const j of jobs()) if (j.status() === WAITING || j.status() === RUNNING) n++; return n; }

/** Queues a job; it starts when the ones before it end. */
export function enqueue(kind: string, label: string, work: () => Promise<string>): Job {
  if (!listening) {
    listening = true;
    ipod.onProgress((phase: string, done: i32, total: i32, detail: string) => {
      const j = runningJob();
      if (j === null) return;
      const job = j as Job;
      batch(() => {
        if (phase === 'copy') { job.setFileDone(done); job.setFileTotal(total); job.setDetail(detail); }
        else if (phase !== 'save' && phase !== 'artwork') { job.setDone(done); job.setTotal(total); job.setFileDone(0); job.setFileTotal(0); }
      });
    });
  }
  const job = new Job(nextId++, kind, label, work);
  setJobs([...jobs(), job]);
  pump();
  return job;
}

export function cancel(job: Job): void {
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
  setJobs(keep);
}

async function pump(): Promise<void> {
  if (runningJob() !== null) return;
  let next: Job | null = null;
  for (const j of jobs()) if (j.status() === WAITING) { next = j; break; }
  if (next === null) return;
  const job = next as Job;
  batch(() => { setRunningJob(job); job.setStatus(RUNNING); });
  try {
    const line = await job.work();
    batch(() => { job.setStatus(DONE); job.setResult(line); job.setDone(job.total()); });
    log(job.label, line, true);
  } catch (e) {
    const why = (e as Error).message;
    batch(() => { job.setStatus(FAILED); job.setResult(why); });
    log(job.label, why, false);
  }
  setRunningJob(null);
  pump();
}
