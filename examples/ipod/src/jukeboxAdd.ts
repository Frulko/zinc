// Adding from jukebox (services/jukebox.ts): one Transfers job per album, playlist or song picked on the Add page. Behind Allow changes;
// the job's steps (the conversion asked of jukebox, each file fetched) are its detail lines, its result says what was added, kept
// (already on the iPod) or failed; a failed song (a download cut) is fetched from where it stopped when it is added again.
import * as ipod from 'zinc:ipod';
import * as jb from './services/jukebox';
import { library, showPage, page } from './state';
import { PodLibrary } from './services/ipod';
import { enqueue, runningJob, Job, JobLine } from './services/transfers';
import { allowed, refresh } from './actions';
import { count } from './format';
import { PAGE_ADD } from './constants';

/** Queues the add of `songs` (`label`: "the album Night Drive"); with `playlist`, an iPod playlist of them in this order. */
export function addFromJukebox(s: jb.Server, songs: jb.Song[], label: string, playlist: string): void {
  const l = library();
  if (l === null || songs.length === 0) return;
  if (page() !== PAGE_ADD) showPage(PAGE_ADD);
  if (!allowed('Add from jukebox')) return;
  enqueue('add', `Add ${label} from jukebox`, async (): Promise<string> => {
    const job = runningJob() as Job;
    const now = library();
    const rep = await jb.addSongs(s, songs, playlist, now !== null ? (now as PodLibrary).tracks : [] as ipod.Track[],
      (t: string) => { job.note(t); },
      (done: i32, total: i32, detail: string) => { job.setDone(done); job.setTotal(total); job.setDetail(detail); });
    await refresh();
    const lines: JobLine[] = [];
    for (const t of rep.lines) lines.push(new JobLine(true, t, -1));
    for (const t of rep.failed) lines.push(new JobLine(false, t, -1));
    job.setLines(lines);
    if (rep.added + rep.kept === 0 && rep.failed.length > 0) throw new Error(`nothing added: ${rep.failed[0]}`);
    return `${count(rep.added, 'song', 'songs')} added, ${rep.kept} already there${rep.failed.length > 0 ? `, ${rep.failed.length} failed (add again to resume)` : ''}` +
      `${rep.playlist !== '' ? `, playlist “${rep.playlist}”` : ''}`;
  });
}
