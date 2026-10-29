// The Optimise page's state and actions: the last analysis of the open iPod (zinc:ipod's analyze(): duplicates, music without a
// cover or tags, the files check() finds, empty playlists), which duplicate groups are ticked and which copy each keeps, and the
// merge of the ticked groups. Analysing only reads the iPod (a job of Transfers, for its progress); merging waits for Allow
// changes and a question, and is a job with one line per group.
import { createSignal, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { library } from './state';
import { PodLibrary } from './services/ipod';
import { enqueue, runningJob, Job, JobLine } from './services/transfers';
import { stop as stopPlaying } from './services/player';
import { allowed, confirm, refresh, podName, setNotice, localOnly } from './actions';
import { bytes, count } from './format';

/** One duplicate group as the page shows it: the copies (zinc:ipod's best first), whether it is ticked and the copy kept. */
export class DuplicateRow {
  group: ipod.DuplicateGroup;
  ticked: () => boolean; setTicked: (on: boolean) => void;
  /** The id of the copy kept: zinc:ipod's choice, or the one the owner clicked. */
  keep: () => string; setKeep: (id: string) => void;
  constructor(group: ipod.DuplicateGroup) {
    this.group = group;
    const [t, st] = createSignal<boolean>(true); this.ticked = t; this.setTicked = st;
    const [k, sk] = createSignal<string>(group.trackIds[0]); this.keep = k; this.setKeep = sk;
  }
  /** The copies removed by a merge: every one but the kept. */
  removed(): string[] { const k = this.keep(); return this.group.trackIds.filter((id: string) => id !== k); }
  /** The bytes a merge frees: the sizes of the removed copies. */
  freed(tracks: Map<string, ipod.Track>): number {
    let n = 0;
    for (const id of this.removed()) { const t = tracks.get(id); if (t !== undefined) n += (t as ipod.Track).size; }
    return n;
  }
}

/** The last analysis, the iPod it was made of (its mountpoint and serial) and its duplicate groups. */
const [lastAnalysis, setAnalysis] = createSignal<ipod.Analysis | null>(null);
const [analysedPod, setAnalysedPod] = createSignal<string>('');
export const [duplicates, setDuplicates] = createSignal<DuplicateRow[]>([]);

function podKey(): string { const l = library(); return l === null ? '' : `${(l as PodLibrary).device.mountpoint}|${(l as PodLibrary).device.serial}`; }
/** The analysis of the iPod open now: null before one ran on it (another iPod's is not shown). */
export function analysis(): ipod.Analysis | null { return analysedPod() === podKey() ? lastAnalysis() : null; }

/** The open iPod's tracks by id. */
export function tracksById(): Map<string, ipod.Track> {
  const m = new Map<string, ipod.Track>();
  const l = library();
  if (l !== null) for (const t of (l as PodLibrary).tracks) m.set(t.id, t);
  return m;
}

/** "Blue Hour — Lumen" of a track id ('' when it is gone). */
export function songName(id: string, tracks: Map<string, ipod.Track>): string {
  const t = tracks.get(id);
  if (t === undefined) return '';
  const x = t as ipod.Track;
  return `${x.title !== '' ? x.title : 'Untitled'}${x.artist !== '' ? ` — ${x.artist}` : ''}`;
}

/** Queues an analysis of the open iPod (it only reads it): fingerprints decoded for what changed since the last one. */
export function analyse(): void {
  if (library() === null || !localOnly('Analyse')) return;
  const pod = podKey();
  enqueue('analyse', `Analyse ${podName()}`, async (): Promise<string> => {
    const a = await ipod.analyze(true);
    const rows: DuplicateRow[] = [];
    for (const g of a.groups) rows.push(new DuplicateRow(g));
    batch(() => { setAnalysis(a); setAnalysedPod(pod); setDuplicates(rows); });
    let spare = 0;
    for (const g of a.groups) spare += g.savedBytes;
    return `${count(a.groups.length, 'duplicate group', 'duplicate groups')} (${bytes(spare)} to free), ${a.noArtwork.length} without a cover, ` +
      `${a.missingTags.length} with missing tags, ${a.orphans.length} orphan files, ${a.emptyPlaylists.length} empty playlists`;
  });
}

/** Merges the ticked groups into their kept copies (after a question), as one job with one line per group; the library is read
 *  again and the merged groups leave the list. */
export async function mergeTicked(): Promise<void> {
  if (library() === null || !localOnly('Merge')) return;
  const rows =duplicates().filter((r: DuplicateRow) => r.ticked());
  if (rows.length === 0) { setNotice('Tick the groups to merge first'); return; }
  if (!allowed('Merge duplicates')) return;
  const tracks = tracksById();
  let freed = 0, copies = 0;
  for (const r of rows) { freed += r.freed(tracks); copies += r.removed().length; }
  if (!(await confirm(`Merge ${count(rows.length, 'group', 'groups')} of duplicates?`,
    `${count(copies, 'copy is', 'copies are')} removed from the iPod with ${copies === 1 ? 'its file' : 'their files'} (${bytes(freed)}). Each kept copy takes the tags and cover it lacks, the play counts, the higher rating and the playlist places. The database is backed up first.`, 'Merge'))) {
    return;
  }
  setNotice('');
  stopPlaying();
  const groups: ipod.MergeGroup[] = [];
  for (const r of rows) groups.push({ keep: r.keep(), remove: r.removed() });
  enqueue('merge', `Merge ${count(rows.length, 'duplicate group', 'duplicate groups')}`, async (): Promise<string> => {
    const res = await ipod.merge(groups);
    await refresh();
    const out: JobLine[] = [];
    const merged: string[] = [];
    let removed = 0, total = 0, failed = 0;
    for (const m of res) {
      const name = songName(m.keep, tracksById());
      if (m.error !== '') { failed++; out.push(new JobLine(false, `${name !== '' ? name : m.keep}: ${m.error}`, -1)); continue; }
      merged.push(m.keep);
      removed += m.removed.length; total += m.freedBytes;
      out.push(new JobLine(true, `${name}: ${count(m.removed.length, 'copy', 'copies')} removed, ${m.playCount} plays${m.filled.length > 0 ? `, took ${m.filled.join(', ')}` : ''}${m.playlistPlaces > 0 ? `, ${count(m.playlistPlaces, 'playlist place', 'playlist places')} moved` : ''}`, m.freedBytes));
    }
    const job = runningJob();
    if (job !== null) (job as Job).setLines(out);
    setDuplicates(duplicates().filter((r: DuplicateRow) => merged.indexOf(r.keep()) < 0));
    const line = `${count(removed, 'copy', 'copies')} removed (${bytes(total)} freed)${failed > 0 ? `, ${failed} left as they were` : ''}`;
    if (failed > 0 && removed === 0) throw new Error(line);
    return line;
  });
}
