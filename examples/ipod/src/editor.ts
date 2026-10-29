// The Info window's logic (iTunes' Get Info and "Multiple Item Information"): the fields and their tabs, the value the songs share or
// MIXED, the edits and the per-field apply boxes (an edit ticks its box; only ticked fields are written), the patch they make, and the
// job that writes it (one save of the iPod, through services/ipod.ts so a remote iPod's daemon writes it too). Behind Allow changes.
// One song: Previous and Next move through the table it was opened from, writing the edits first. components/InfoSheet.tsx draws it.
import { createSignal, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { updateTracks } from './services/ipod';
import { enqueue } from './services/transfers';
import * as cache from './services/cache';
import { dropCovers } from './services/covers';
import { allowed, refresh, setNotice } from './actions';
import { library } from './state';
import { count } from './format';

/** A value the songs do not share: shown as an empty field with "Mixed" in it. */
export const MIXED = '\u0000mixed';

export const TAB_DETAILS = 'details', TAB_ARTWORK = 'artwork', TAB_OPTIONS = 'options', TAB_SORTING = 'sorting', TAB_FILE = 'file';
export const TABS: string[] = [TAB_DETAILS, TAB_ARTWORK, TAB_OPTIONS, TAB_SORTING, TAB_FILE];
export const TAB_NAMES: string[] = ['Details', 'Artwork', 'Options', 'Sorting', 'File'];

/** A field: its key (TrackInput's name), label, kind (text, area, number, time, check, rating, media), tab, width (0: the rest of the
 *  row) and whether it goes on the row of the field before it. */
export class InfoField {
  key: string; label: string; kind: string; tab: string; width: i32; inline: boolean;
  constructor(key: string, label: string, kind: string, tab: string, width: i32, inline: boolean) {
    this.key = key; this.label = label; this.kind = kind; this.tab = tab; this.width = width; this.inline = inline;
  }
}
const F = (key: string, label: string, kind: string, tab: string, width: i32 = 0, inline: boolean = false): InfoField => new InfoField(key, label, kind, tab, width, inline);
export const FIELDS: InfoField[] = [
  F('title', 'Name', 'text', TAB_DETAILS), F('artist', 'Artist', 'text', TAB_DETAILS), F('albumArtist', 'Album artist', 'text', TAB_DETAILS),
  F('album', 'Album', 'text', TAB_DETAILS), F('grouping', 'Grouping', 'text', TAB_DETAILS), F('composer', 'Composer', 'text', TAB_DETAILS),
  F('genre', 'Genre', 'text', TAB_DETAILS, 180), F('year', 'Year', 'number', TAB_DETAILS, 60, true), F('bpm', 'BPM', 'number', TAB_DETAILS, 50, true),
  F('trackNr', 'Track', 'number', TAB_DETAILS, 50), F('tracks', 'of', 'number', TAB_DETAILS, 50, true),
  F('cdNr', 'Disc', 'number', TAB_DETAILS, 50, true), F('cds', 'of', 'number', TAB_DETAILS, 50, true),
  F('compilation', 'Album is a compilation of songs by various artists', 'check', TAB_DETAILS), F('comment', 'Comments', 'area', TAB_DETAILS),
  F('mediaType', 'Media kind', 'media', TAB_OPTIONS, 200), F('rating', 'Rating', 'rating', TAB_OPTIONS, 200),
  F('volume', 'Volume (%)', 'number', TAB_OPTIONS, 70), F('startMs', 'Start', 'time', TAB_OPTIONS, 90), F('stopMs', 'Stop', 'time', TAB_OPTIONS, 90, true),
  F('rememberPosition', 'Remember playback position', 'check', TAB_OPTIONS), F('skipWhenShuffling', 'Skip when shuffling', 'check', TAB_OPTIONS),
  F('lyrics', 'Has lyrics (the iPod shows those of the file)', 'check', TAB_OPTIONS), F('resetPlays', 'Reset plays', 'check', TAB_OPTIONS),
  F('description', 'Description', 'area', TAB_OPTIONS),
  F('sortTitle', 'Sort name', 'text', TAB_SORTING), F('sortArtist', 'Sort artist', 'text', TAB_SORTING), F('sortAlbumArtist', 'Sort album artist', 'text', TAB_SORTING),
  F('sortAlbum', 'Sort album', 'text', TAB_SORTING), F('sortComposer', 'Sort composer', 'text', TAB_SORTING),
];
export function fieldsOf(tab: string): InfoField[] { return FIELDS.filter((f: InfoField) => f.tab === tab); }
/** The fields of `tab` by row (a field marked inline joins the row before it). */
export function rowsOf(tab: string): InfoField[][] {
  const out: InfoField[][] = [];
  for (const f of fieldsOf(tab)) { if (f.inline && out.length > 0) out[out.length - 1].push(f); else out.push([f]); }
  return out;
}
export function fieldOf(key: string): InfoField { for (const f of FIELDS) if (f.key === key) return f; return FIELDS[0]; }

function num(n: number): string { return n !== 0 ? `${n}` : ''; }
function yes(b: boolean): string { return b ? 'true' : 'false'; }
/** Milliseconds as m:ss.mmm ('' for 0). */
export function timeText(ms: number): string {
  if (ms <= 0) return '';
  const s = Math.floor(ms / 1000), r = ms % 1000;
  return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}${r > 0 ? `.${`${r}`.padStart(3, '0')}` : ''}`;
}
/** "1:02.5", "62.5" or "" → milliseconds; -1 when it is not a time. */
export function timeValue(v: string): number {
  const s = v.trim();
  if (s === '') return 0;
  const c = s.indexOf(':');
  const m = c >= 0 ? Number(s.slice(0, c)) : 0, sec = Number(c >= 0 ? s.slice(c + 1) : s);
  return isNaN(m) || isNaN(sec) || m < 0 || sec < 0 ? -1 : Math.round((m * 60 + sec) * 1000);
}

/** The field `key` of `t` as the editor holds it (a string). */
export function valueOf(t: ipod.Track, key: string): string {
  switch (key) {
    case 'title': return t.title; case 'artist': return t.artist; case 'albumArtist': return t.albumArtist; case 'album': return t.album;
    case 'grouping': return t.grouping; case 'composer': return t.composer; case 'genre': return t.genre; case 'comment': return t.comment;
    case 'description': return t.description; case 'year': return num(t.year); case 'bpm': return num(t.bpm);
    case 'trackNr': return num(t.trackNr); case 'tracks': return num(t.tracks); case 'cdNr': return num(t.cdNr); case 'cds': return num(t.cds);
    case 'compilation': return yes(t.compilation); case 'mediaType': return t.mediaType; case 'rating': return `${t.rating}`;
    case 'volume': return num(t.volume); case 'startMs': return timeText(t.startMs); case 'stopMs': return timeText(t.stopMs);
    case 'rememberPosition': return yes(t.rememberPosition); case 'skipWhenShuffling': return yes(t.skipWhenShuffling);
    case 'lyrics': return yes(t.lyrics); case 'resetPlays': return 'false';
    case 'sortTitle': return t.sortTitle; case 'sortArtist': return t.sortArtist; case 'sortAlbumArtist': return t.sortAlbumArtist;
    case 'sortAlbum': return t.sortAlbum; case 'sortComposer': return t.sortComposer;
  }
  return '';
}

/** The value every track has for `key`, or MIXED. */
export function shared(tracks: ipod.Track[], key: string): string {
  if (tracks.length === 0) return '';
  const v = valueOf(tracks[0], key);
  for (const t of tracks) if (valueOf(t, key) !== v) return MIXED;
  return v;
}

function int(v: string): i32 { const n = Number(v.trim()); return v.trim() === '' || isNaN(n) ? 0 : Math.round(n) as i32; }

/** Why the edit of `key` cannot be written ('' when it can). */
export function invalid(key: string, v: string): string {
  const f = fieldOf(key);
  if (f.kind === 'number' && v.trim() !== '' && isNaN(Number(v.trim()))) return `${f.label}: not a number`;
  if (f.kind === 'time' && timeValue(v) < 0) return `${f.label}: write a time as 1:30 or 90`;
  return '';
}

/** The TrackInput of the fields ticked in `applied`: the value in `edits`, else (a box ticked by hand) what the field shows, the
 *  songs' shared value; a mixed field ticked without an edit writes nothing. */
export function patchOf(edits: Map<string, string>, applied: string[], tracks: ipod.Track[]): ipod.TrackInput {
  const p: ipod.TrackInput = { file: '' };
  for (const key of applied) {
    const e = edits.get(key);
    const v = e !== undefined ? e as string : shared(tracks, key);
    if (v === MIXED) continue;
    switch (key) {
      case 'title': p.title = v; break; case 'artist': p.artist = v; break; case 'albumArtist': p.albumArtist = v; break;
      case 'album': p.album = v; break; case 'grouping': p.grouping = v; break; case 'composer': p.composer = v; break;
      case 'genre': p.genre = v; break; case 'comment': p.comment = v; break; case 'description': p.description = v; break;
      case 'year': p.year = int(v); break; case 'bpm': p.bpm = int(v); break; case 'trackNr': p.trackNr = int(v); break;
      case 'tracks': p.tracks = int(v); break; case 'cdNr': p.cdNr = int(v); break; case 'cds': p.cds = int(v); break;
      case 'compilation': p.compilation = v === 'true'; break; case 'mediaType': p.mediaType = v; break; case 'rating': p.rating = int(v); break;
      case 'volume': p.volume = int(v); break; case 'startMs': p.startMs = timeValue(v) as i32; break; case 'stopMs': p.stopMs = timeValue(v) as i32; break;
      case 'rememberPosition': p.rememberPosition = v === 'true'; break; case 'skipWhenShuffling': p.skipWhenShuffling = v === 'true'; break;
      case 'lyrics': p.lyrics = v === 'true'; break; case 'resetPlays': if (v === 'true') p.playCount = 0; break;
      case 'sortTitle': p.sortTitle = v; break; case 'sortArtist': p.sortArtist = v; break; case 'sortAlbumArtist': p.sortAlbumArtist = v; break;
      case 'sortAlbum': p.sortAlbum = v; break; case 'sortComposer': p.sortComposer = v; break;
    }
  }
  return p;
}

// ---- the window's state
/** The songs the Info window edits (none: closed). */
export const [infoTracks, setInfoTracks] = createSignal<ipod.Track[]>([]);
export const [infoTab, setInfoTab] = createSignal<string>(TAB_DETAILS);
/** The values typed or picked, by field key. */
export const [edits, setEdits] = createSignal<Map<string, string>>(new Map<string, string>());
/** The fields to write (an edit ticks its field; a box can be ticked or unticked by hand). */
export const [applied, setApplied] = createSignal<string[]>([]);
/** An image picked for the cover of every song ('' none). */
export const [newCover, setNewCover] = createSignal<string>('');
/** The table the window was opened from: Previous and Next move through it (one song). */
let fromList: ipod.Track[] = [];

export function infoOpen(): boolean { return infoTracks().length > 0; }

/** Opens the Info window on `tracks`, from the table `list`. */
export function openInfo(list: ipod.Track[], tracks: ipod.Track[]): void {
  if (tracks.length === 0) return;
  fromList = list;
  batch(() => { setInfoTracks(tracks); setEdits(new Map<string, string>()); setApplied([]); setNewCover(''); setNotice(''); });
}
export function closeInfo(): void { batch(() => { setInfoTracks([]); setEdits(new Map<string, string>()); setApplied([]); setNewCover(''); }); }

/** What the field shows: the edit, else the shared value (MIXED when the songs differ). */
export function shownValue(key: string): string {
  const e = edits().get(key);
  return e !== undefined ? e as string : shared(infoTracks(), key);
}
export function isApplied(key: string): boolean { return applied().indexOf(key) >= 0; }

/** An edit of `key`: kept, and its box ticked. */
export function setField(key: string, v: string): void {
  const m = new Map<string, string>();
  edits().forEach((x: string, k: string) => { m.set(k, x); });
  m.set(key, v);
  batch(() => { setEdits(m); if (!isApplied(key)) setApplied([...applied(), key]); });
}

/** The box of `key` clicked: unticked, the field goes back to the songs' value. */
export function toggleApplied(key: string): void {
  if (!isApplied(key)) { setApplied([...applied(), key]); return; }
  const m = new Map<string, string>();
  edits().forEach((x: string, k: string) => { if (k !== key) m.set(k, x); });
  batch(() => { setEdits(m); setApplied(applied().filter((k: string) => k !== key)); });
}

export function pickCover(file: string): void { setNewCover(file); }

/** How many fields (and the cover) will be written. */
export function pendingCount(): i32 { return applied().length + (newCover() !== '' ? 1 : 0); }

/** Writes the ticked fields to the songs as one job (one save), then reads the library again. False (and the window stays) when it
 *  cannot: Allow changes is off, or a value is not valid. */
export function applyInfo(): boolean {
  const tracks = infoTracks();
  if (tracks.length === 0) return true;
  if (pendingCount() === 0) return true;
  if (!allowed('Change the song info')) return false;
  for (const k of applied()) { const why = invalid(k, shownValue(k)); if (why !== '') { setNotice(why); return false; } }
  const patch = patchOf(edits(), applied(), tracks);
  const cover = newCover();
  if (cover !== '') patch.artworkFile = cover;
  const ids: string[] = tracks.map((t: ipod.Track) => t.id);
  const label = tracks.length === 1 ? `“${tracks[0].title}”` : count(tracks.length, 'song', 'songs');
  const fields = pendingCount();
  setNotice('');
  enqueue('info', `Change the info of ${label}`, async (): Promise<string> => {
    try { await updateTracks(ids, patch); }
    catch (e) { setNotice((e as Error).message); throw e; }
    if (cover !== '') { for (const id of ids) { const f = cache.coverFile(id); if (fs.exists(f)) fs.remove(f, false); } dropCovers(); }
    await refresh();
    return `${count(fields, 'field', 'fields')} written to ${count(ids.length, 'song', 'songs')}`;
  });
  return true;
}

/** OK: writes, then closes. */
export function okInfo(): void { if (applyInfo()) closeInfo(); }

/** One song: the previous (-1) or next (1) song of the table, after writing the edits. */
export function stepInfo(by: i32): void {
  const tracks = infoTracks();
  if (tracks.length !== 1 || !applyInfo()) return;
  let at = -1;
  for (let i = 0; i < fromList.length; i++) if (fromList[i].id === tracks[0].id) at = i;
  const to = at + by;
  if (at < 0 || to < 0 || to >= fromList.length) return;
  let next = fromList[to];   // as the library holds it now: a song written a moment ago shows its new values
  const lib = library();
  if (lib !== null) for (const t of lib.tracks) if (t.id === next.id) next = t;
  batch(() => { setInfoTracks([next]); setEdits(new Map<string, string>()); setApplied([]); setNewCover(''); });
}
export function canStep(by: i32): boolean {
  const tracks = infoTracks();
  if (tracks.length !== 1) return false;
  for (let i = 0; i < fromList.length; i++) if (fromList[i].id === tracks[0].id) return i + by >= 0 && i + by < fromList.length;
  return false;
}
