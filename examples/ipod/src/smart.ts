// Smart playlists made in the app, as iTunes' Smart Playlist dialog: "Match all/any of the following rules", rows of field, condition
// and value, a limit with its order, live updating and a name. The editor (pages/playlists/SmartEditor.tsx) shows on the Playlists page
// with a live preview (zinc:ipod's evaluateSmart over the library: the same rules, limits and sorts libgpod fills the iPod's list with),
// played through the queue like a draft. Save to iPod writes a real smart playlist (createSmartPlaylist, or setSmartRules on one being
// edited); an iPod that keeps none (a Nano 6G or 7G) gets the songs chosen now as a normal playlist, and says so. The editor offers only
// fields the preview reads, so what is heard is what the iPod gets; a playlist whose rules use others (iTunes' newer fields, grouping...)
// is not edited: it can be duplicated as a normal playlist. A remote iPod's daemon has no smart playlist API: the preview works there,
// Save says why it cannot.
import { createSignal } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { library, playlists, openPlaylist } from './state';
import { PodLibrary } from './services/ipod';
import { playList } from './services/player';
import { enqueue } from './services/transfers';
import { allowed, localOnly, refresh, remoteOpen, setNotice } from './actions';
import { count } from './format';

/** The Playlists page's entry that shows the editor (openPlaylist). */
export const SMART_EDITOR = 'draft:smart-editor';

/** A field the editor offers: its rule name, its label, its kind (text | number | rating | date | media | playlist), and for a number
 *  the unit typed and how many of the rule's units make one ("minutes", 60000 for durationMs). */
export class FieldInfo {
  key: string; label: string; kind: string; unit: string; scale: number;
  constructor(key: string, label: string, kind: string, unit: string, scale: number) { this.key = key; this.label = label; this.kind = kind; this.unit = unit; this.scale = scale; }
}
function f(key: string, label: string, kind: string, unit: string = '', scale: number = 1): FieldInfo { return new FieldInfo(key, label, kind, unit, scale); }
export const FIELDS: FieldInfo[] = [f('artist', 'Artist', 'text'), f('albumArtist', 'Album Artist', 'text'), f('album', 'Album', 'text'),
  f('title', 'Name', 'text'), f('genre', 'Genre', 'text'), f('composer', 'Composer', 'text'), f('comment', 'Comment', 'text'),
  f('rating', 'Rating', 'rating'), f('playCount', 'Plays', 'number'), f('skipCount', 'Skips', 'number'), f('year', 'Year', 'number'),
  f('bpm', 'BPM', 'number'), f('durationMs', 'Time', 'number', 'minutes', 60000), f('size', 'Size', 'number', 'MB', 1048576),
  f('bitrate', 'Bit Rate', 'number', 'kbps'), f('sampleRate', 'Sample Rate', 'number', 'Hz'), f('trackNr', 'Track Number', 'number'),
  f('cdNr', 'Disc Number', 'number'), f('added', 'Date Added', 'date'), f('lastPlayed', 'Last Played', 'date'),
  f('lastSkipped', 'Last Skipped', 'date'), f('videoKind', 'Media Kind', 'media'), f('playlist', 'Playlist', 'playlist')];
/** The text fields whose value field suggests the library's values. */
const SUGGESTED: string[] = ['artist', 'albumArtist', 'album', 'genre', 'composer'];

export function fieldInfo(key: string): FieldInfo | null { for (const x of FIELDS) if (x.key === key) return x; return null; }

const KIND_ACTIONS: string[] = ['text', 'contains,doesNotContain,is,isNot,startsWith,endsWith', 'number', 'is,isNot,greaterThan,lessThan,inRange',
  'rating', 'is,isNot,greaterThan,lessThan,inRange', 'date', 'inTheLast,notInTheLast,greaterThan,lessThan,inRange', 'media', 'is,isNot',
  'playlist', 'is,isNot'];
/** The conditions of a field's kind, in the order of the menu. */
export function actionsOf(kind: string): string[] { for (let i = 0; i < KIND_ACTIONS.length; i += 2) if (KIND_ACTIONS[i] === kind) return KIND_ACTIONS[i + 1].split(','); return []; }
const SAY: string[] = ['is', 'is', 'isNot', 'is not', 'contains', 'contains', 'doesNotContain', 'does not contain', 'startsWith', 'starts with',
  'endsWith', 'ends with', 'doesNotStartWith', 'does not start with', 'doesNotEndWith', 'does not end with', 'greaterThan', 'is greater than',
  'lessThan', 'is less than', 'inRange', 'is in the range', 'notInRange', 'is not in the range', 'inTheLast', 'is in the last',
  'notInTheLast', 'is not in the last', 'notGreaterThan', 'is not after', 'notLessThan', 'is not before'];
/** A condition as the menu says it ("is after" for a date). */
export function actionLabel(kind: string, a: string): string {
  if (kind === 'date' && a === 'greaterThan') return 'is after';
  if (kind === 'date' && a === 'lessThan') return 'is before';
  if (kind === 'playlist' && a === 'is') return 'is in';
  if (kind === 'playlist' && a === 'isNot') return 'is not in';
  for (let i = 0; i < SAY.length; i += 2) if (SAY[i] === a) return SAY[i + 1];
  return a;
}
export const MEDIA_NAMES: string[] = ['Music', 'Video', 'Podcast', 'Audiobook', 'Music Video', 'TV Show'];   // ipod.MEDIA_TYPES' order
export const DATE_UNITS: string[] = ['days', 'weeks', 'months'];
export const LIMIT_TYPES: string[] = ['songs', 'minutes', 'hours', 'MB', 'GB'];
export const LIMIT_SORTS: string[] = ['random', 'title', 'album', 'artist', 'genre', 'highestRating', 'lowestRating', 'mostRecentlyPlayed',
  'leastRecentlyPlayed', 'mostOftenPlayed', 'leastOftenPlayed', 'mostRecentlyAdded', 'leastRecentlyAdded'];
export const LIMIT_SORT_NAMES: string[] = ['random', 'name', 'album', 'artist', 'genre', 'highest rating', 'lowest rating',
  'most recently played', 'least recently played', 'most often played', 'least often played', 'most recently added', 'least recently added'];

/** What the editor holds besides the rows: the playlist edited ('' for a new one), its name, all or any, the limit, live updating. */
export class SmartEdit {
  id: string = '';
  name: string = '';
  match: string = 'all';
  limitOn: boolean = false;
  limitValue: number = 25;
  limitType: string = 'songs';
  limitSort: string = 'random';
  live: boolean = true;
}
/** The editor open (a new object each time it opens or a template is applied: the form is drawn again), null when closed. */
export const [smartEdit, setSmartEdit] = createSignal<SmartEdit | null>(null);
/** The rows. A row changed in shape (field, condition, a value picked from a menu) is replaced by a copy, so only it is drawn again;
 *  a value typed changes the rule in place and bumps `edits`. */
export const [rows, setRows] = createSignal<ipod.SmartRule[]>([]);
/** Bumped on every change: the preview and the header's menus read it. */
export const [edits, setEdits] = createSignal<i32>(0);
export function touched(): void { setEdits(edits() + 1); }

function rule(field: string, action: string, value: number, value2: number, units: string, text: string): ipod.SmartRule {
  return { field: field, action: action, value: value, value2: value2, units: units, text: text };
}
function copy(r: ipod.SmartRule): ipod.SmartRule { return rule(r.field, r.action, r.value, r.value2, r.units, r.text); }

/** A new row on `field`, with iTunes' first condition and a value that makes sense. */
export function newRule(field: string): ipod.SmartRule {
  const info = fieldInfo(field);
  const kind = info !== null ? (info as FieldInfo).kind : 'text';
  if (kind === 'rating') return rule(field, 'is', 5, 5, '', '');
  if (kind === 'date') return rule(field, 'inTheLast', 2, 0, 'weeks', '');
  if (kind === 'media') return rule(field, 'is', ipod.MEDIA_BITS[0], 0, '', '');
  if (kind === 'playlist') { const ps = playlists(); return rule(field, 'is', 0, 0, '', ps.length > 0 ? ps[0].id : ''); }
  return rule(field, actionsOf(kind)[0], 0, 0, '', '');
}

/** Replaces row `r` by `next` (drawn again), or removes it (`next` null); a row is added after `r` with `add`. */
export function replaceRow(r: ipod.SmartRule, next: ipod.SmartRule | null): void {
  const out: ipod.SmartRule[] = [];
  for (const x of rows()) if (x !== r) out.push(x); else if (next !== null) out.push(next as ipod.SmartRule);
  setRows(out); touched();
}
export function addRowAfter(r: ipod.SmartRule): void {
  const out: ipod.SmartRule[] = [];
  for (const x of rows()) { out.push(x); if (x === r) out.push(newRule(x.field)); }
  setRows(out); touched();
}
export function setField(r: ipod.SmartRule, field: string): void { if (field !== r.field) replaceRow(r, newRule(field)); }
export function setAction(r: ipod.SmartRule, action: string): void {
  const n = copy(r);
  n.action = action;
  if ((action === 'inTheLast' || action === 'notInTheLast') && n.units === '') { n.units = 'weeks'; n.value = 2; }
  else if (action !== 'inTheLast' && action !== 'notInTheLast' && n.units !== '') { n.units = ''; n.value = Math.floor(Date.now() / 1000 / 86400) * 86400; n.value2 = n.value; }
  replaceRow(r, n);
}
/** A value picked from a menu (a suggestion, stars, a media kind, a playlist, a unit): the row is drawn again with it. */
export function setPicked(r: ipod.SmartRule, text: string, value: number, value2: number, units: string): void {
  const n = copy(r);
  n.text = text; n.value = value; n.value2 = value2; n.units = units;
  replaceRow(r, n);
}

/** The rules the editor says, as zinc:ipod writes them. */
export function rulesOf(e: SmartEdit, rs: ipod.SmartRule[]): ipod.SmartRules {
  return { match: e.match, rules: rs.map((r: ipod.SmartRule) => copy(r)), liveUpdate: e.live, checkedOnly: false, refreshable: true,
    limit: e.limitOn ? { type: e.limitType, value: e.limitValue, sort: e.limitSort } : { type: 'none', value: 0, sort: '' } };
}

/** The songs the rules choose now, in order. */
export function previewTracks(): ipod.Track[] {
  edits();
  const e = smartEdit(), lib = library();
  if (e === null || lib === null) return [];
  const ids = ipod.evaluateSmart(rulesOf(e as SmartEdit, rows()), (lib as PodLibrary).tracks, playlists(), 0);
  const byId = new Map<string, ipod.Track>();
  for (const t of (lib as PodLibrary).tracks) byId.set(t.id, t);
  const out: ipod.Track[] = [];
  for (const id of ids) { const t = byId.get(id); if (t !== undefined) out.push(t as ipod.Track); }
  return out;
}

function trackText(t: ipod.Track, field: string): string {
  if (field === 'artist') return t.artist;
  if (field === 'albumArtist') return t.albumArtist;
  if (field === 'album') return t.album;
  if (field === 'genre') return t.genre;
  return t.composer;
}
export function suggests(field: string): boolean { return SUGGESTED.indexOf(field) >= 0; }
/** The library's values of `field` that contain `typed` (without case), the most frequent first: what the value's menu offers. */
export function suggestions(field: string, typed: string, most: i32 = 30): string[] {
  const lib = library();
  if (lib === null) return [];
  const w = typed.trim().toLowerCase(), counts = new Map<string, i32>(), names: string[] = [];
  for (const t of (lib as PodLibrary).tracks) {
    const v = trackText(t, field);
    if (v === '' || (w !== '' && v.toLowerCase().indexOf(w) < 0)) continue;
    const n = counts.get(v);
    if (n === undefined) { counts.set(v, 1); names.push(v); } else counts.set(v, (n as i32) + 1);
  }
  names.sort((a: string, b: string) => { const d = (counts.get(b) as i32) - (counts.get(a) as i32); return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0; });
  return names.slice(0, most);
}

/** '' when the editor can open the playlist's rules, else why not (the playlist can still be duplicated as a normal one). */
export function whyNotEditable(p: ipod.Playlist): string {
  if (!p.rules.refreshable) return 'iTunes wrote them on a field of a newer iTunes, which this app cannot read; they stay on the iPod as they are';
  for (const r of p.rules.rules) {
    if (r.field.startsWith('0x') || r.action.startsWith('0x')) return 'iTunes wrote them on a field of a newer iTunes, which this app cannot read; they stay on the iPod as they are';
    if (fieldInfo(r.field) === null) return `they use “${r.field}”, which the preview cannot read; they stay on the iPod as they are`;
  }
  if (p.rules.limit.type !== 'none' && p.rules.limit.type !== '' && LIMIT_SORTS.indexOf(p.rules.limit.sort) < 0)
    return `the limit is ordered by “${p.rules.limit.sort}”, which the preview cannot read`;
  return '';
}

function open(e: SmartEdit, rs: ipod.SmartRule[]): void { setRows(rs); setSmartEdit(e); touched(); openPlaylist(SMART_EDITOR); }

/** A new smart playlist, with one row (`first`, or "Artist contains"). */
export function newSmart(first: ipod.SmartRule | null = null, name: string = ''): void {
  const e = new SmartEdit();
  e.name = name;
  open(e, [first !== null ? first as ipod.SmartRule : newRule('artist')]);
}
/** "Smart playlist like this…": a new one whose first row is `field` is `value`. */
export function smartLike(field: string, value: string): void { const r = newRule(field); r.action = 'is'; r.text = value; newSmart(r, value); }
/** Opens a smart playlist of the iPod in the editor (whyNotEditable first). */
export function editSmart(p: ipod.Playlist): void {
  const e = new SmartEdit();
  e.id = p.id; e.name = p.name; e.match = p.rules.match === 'any' ? 'any' : 'all'; e.live = p.rules.liveUpdate;
  const l = p.rules.limit;
  if (l.type !== 'none' && l.type !== '') { e.limitOn = true; e.limitType = l.type; e.limitValue = l.value; e.limitSort = l.sort; }
  open(e, p.rules.rules.map((r: ipod.SmartRule) => copy(r)));
}
export function closeEditor(): void { setSmartEdit(null); }

/** The one-click presets of a new smart playlist; the tempo one only when some song has a BPM. */
export function templates(): string[] {
  const out = ['Never played', 'Top 25 most played', 'Recently added', '5 stars', 'Forgotten favourites'];
  const lib = library();
  if (lib !== null) for (const t of (lib as PodLibrary).tracks) if (t.bpm > 0) { out.push('Tempo 120–130'); break; }
  return out;
}
export function applyTemplate(name: string): void {
  const prev = smartEdit();
  const e = new SmartEdit();
  if (prev !== null) e.id = (prev as SmartEdit).id;
  e.name = name;
  const music = rule('videoKind', 'is', ipod.MEDIA_BITS[0], 0, '', '');
  let rs: ipod.SmartRule[] = [];
  if (name === 'Never played') rs = [music, rule('playCount', 'is', 0, 0, '', '')];
  else if (name === 'Top 25 most played') { rs = [music, rule('playCount', 'greaterThan', 0, 0, '', '')]; e.limitOn = true; e.limitValue = 25; e.limitSort = 'mostOftenPlayed'; }
  else if (name === 'Recently added') rs = [rule('added', 'inTheLast', 1, 0, 'months', '')];
  else if (name === '5 stars') rs = [rule('rating', 'is', 5, 0, '', '')];
  else if (name === 'Forgotten favourites') rs = [music, rule('playCount', 'greaterThan', 9, 0, '', ''), rule('lastPlayed', 'notInTheLast', 6, 0, 'months', '')];
  else rs = [rule('bpm', 'inRange', 120, 130, '', '')];
  open(e, rs);
}

/** Play: the preview through the queue (this Mac or the Sonos group chosen). */
export function playPreview(e: SmartEdit): void {
  const lib = library(), ts = previewTracks();
  if (lib !== null && ts.length > 0) playList(lib as PodLibrary, ts, 0, e.name !== '' ? e.name : 'Smart playlist');
}

/** Save to iPod: a real smart playlist (a new one, or the rules of the one edited), else the songs chosen now as a normal playlist on an
 *  iPod that keeps no smart playlists. Allow changes; an iPod plugged into this computer. */
export function saveSmart(e: SmartEdit): void {
  if (library() === null) return;
  if (remoteOpen()) { setNotice('Save to iPod: the iPod daemon cannot write smart playlists yet; plug the iPod into this Mac to save one'); return; }
  if (!allowed('Save to iPod')) return;
  const name = e.name.trim() !== '' ? e.name.trim() : 'Untitled smart playlist', id0 = e.id, rules = rulesOf(e, rows());
  const ids = previewTracks().map((t: ipod.Track) => t.id);
  let oldName = '';
  for (const p of playlists()) if (p.id === id0) oldName = p.name;
  enqueue('playlist', `Save “${name}” to the iPod`, async (): Promise<string> => {
    let id = id0, note = '';
    try {
      if (id === '') id = await ipod.createSmartPlaylist(name, rules);
      else { await ipod.setSmartRules(id, rules); if (name !== oldName) await ipod.renamePlaylist(id, name); }
    } catch (err) {
      if (id0 !== '' || (err as Error).message.indexOf('no smart playlists') < 0) throw err;
      id = await ipod.createPlaylist(name);   // a Nano 6G or 7G: its database keeps no smart playlist
      await ipod.setPlaylistTracks(id, ids);
      note = ' as a normal playlist (this iPod keeps no smart playlists: it will not update by itself)';
    }
    await ipod.save();
    await refresh();
    closeEditor();
    openPlaylist(id);
    return `“${name}” saved${note}`;
  });
}

/** The playlist's songs as a new normal playlist ("<name> copy"): what a smart playlist the editor cannot open becomes, to change by hand. */
export function duplicateAsNormal(p: ipod.Playlist): void {
  if (!localOnly('Duplicate as normal playlist') || !allowed('Duplicate as normal playlist')) return;
  const name = `${p.name} copy`, ids = p.trackIds.slice();
  enqueue('playlist', `Duplicate “${p.name}”`, async (): Promise<string> => {
    const id = await ipod.createPlaylist(name);
    await ipod.setPlaylistTracks(id, ids);
    await ipod.save();
    await refresh();
    openPlaylist(id);
    return `${count(ids.length, 'song', 'songs')} in the playlist “${name}”`;
  });
}
