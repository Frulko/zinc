// The global search (Cmd+F or Cmd+K from any page, or the magnifier of the top bar): one field over the whole library, its results grouped as
// songs, albums, artists and playlists (the first few of each). Up and Down move through them, Enter (or a click) plays a song or opens the
// rest (an entry of the history), Escape or a click outside closes it. Every track's text is folded once per library (state.trackHay), so a
// key typed costs a scan of strings already folded.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { createSignal, createMemo, createNodeRef, onMount } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { library, albums, artists, playlists, trackHay, Album, Artist, openAlbum, openArtist, openPlaylist } from '../state';
import { PodLibrary } from '../services/ipod';
import { playList } from '../services/player';
import { words, matches, hay } from '../search';
import { bg, bd, fg, color, CARD, BORDER, SELECTED, TEXT, MUTED, FAINT, ACCENT, FINDER_WIDTH, FINDER_PER_GROUP } from '../constants';

export const [quickOpen, setQuickOpen] = createSignal<boolean>(false);
const [query, setQuery] = createSignal<string>('');
const [at, setAt] = createSignal<i32>(0);

const SONG = 0, ALBUM = 1, ARTIST = 2, PLAYLIST = 3;
const GROUPS: string[] = ['Songs', 'Albums', 'Artists', 'Playlists'];
const ICONS: string[] = ['music', 'disc-3', 'mic-vocal', 'list-music'];

/** One result: what it is, the two lines it shows, and what Enter opens. */
class Hit {
  kind: i32; label: string; detail: string; id: string;
  track: ipod.Track | null = null; album: Album | null = null;
  constructor(kind: i32, label: string, detail: string, id: string) { this.kind = kind; this.label = label; this.detail = detail; this.id = id; }
}

/** The results of the query, in group order (the first FINDER_PER_GROUP of each). */
export function findAll(q: string): Hit[] {
  const out: Hit[] = [];
  const ws = words(q), lib = library();
  if (ws.length === 0 || lib === null) return out;
  const index = trackHay();
  let n = 0;
  for (const t of (lib as PodLibrary).tracks) {
    if (!matches(index.get(t.id) ?? '', ws)) continue;
    const h = new Hit(SONG, t.title !== '' ? t.title : 'Untitled', `${t.artist}${t.album !== '' ? ` · ${t.album}` : ''}`, t.id);
    h.track = t; out.push(h);
    if (++n >= FINDER_PER_GROUP) break;
  }
  n = 0;
  for (const a of albums()) {
    if (!matches(a.hay, ws)) continue;
    const h = new Hit(ALBUM, a.title, a.artist, a.key);
    h.album = a; out.push(h);
    if (++n >= FINDER_PER_GROUP) break;
  }
  n = 0;
  for (const a of artists()) {
    if (!matches(a.hay, ws)) continue;
    out.push(new Hit(ARTIST, a.name, `${a.albums.length} ${a.albums.length === 1 ? 'album' : 'albums'}`, a.name));
    if (++n >= FINDER_PER_GROUP) break;
  }
  n = 0;
  for (const p of playlists()) {
    if (!matches(hay([p.name]), ws)) continue;
    out.push(new Hit(PLAYLIST, p.name, `${p.trackIds.length} ${p.trackIds.length === 1 ? 'song' : 'songs'}`, p.id));
    if (++n >= FINDER_PER_GROUP) break;
  }
  return out;
}

const hits = createMemo<Hit[]>(() => findAll(query()), []);

export function openQuickSearch(): void { setQuery(''); setAt(0); setQuickOpen(true); }
function close(): void { setQuickOpen(false); }

function choose(h: Hit): void {
  close();
  const lib = library();
  if (h.kind === SONG && lib !== null && h.track !== null) playList(lib as PodLibrary, [h.track as ipod.Track], 0);
  else if (h.kind === ALBUM && h.album !== null) openAlbum(h.album as Album);
  else if (h.kind === ARTIST) openArtist(h.id);
  else if (h.kind === PLAYLIST) openPlaylist(h.id);
}

function Row(props: { h: Hit; i: i32 }): i32 {
  const h = props.h, i = props.i;
  const first = i === 0 || hits()[i - 1].kind !== h.kind;
  return <View className="flex-col">
    {first ? <Text className={`text-[11px] font-semibold px-3 pt-2.5 pb-1 ${fg(FAINT)}`}>{GROUPS[h.kind].toUpperCase()}</Text> : <View />}
    <View className={`flex-row items-center gap-2.5 h-[40] px-3 mx-1 rounded-[7] cursor-pointer ${at() === i ? bg(SELECTED) : ''}`}
      onPointerEnter={(e: ui.PointerEvent) => setAt(i)} onPointerDown={(e: ui.PointerEvent) => choose(h)}>
      <Icon name={ICONS[h.kind]} size={16} color={() => color(ACCENT)} strokeWidth={2} />
      <View className="grow basis-0 flex-col min-w-0">
        <Text className={`text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{h.label}</Text>
        <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{h.detail}</Text>
      </View>
    </View>
  </View>;
}

export function QuickSearch(): i32 {
  const field = createNodeRef();
  onMount(() => { if (field.node >= 0) ui.focusNode(field.node); });
  const key = (e: ui.KeyEvent): void => {
    const n = hits().length;
    if (e.key === 'Escape') { close(); e.handled = true; }
    else if (e.key === 'ArrowDown') { if (n > 0) setAt((at() + 1) % n); e.handled = true; }
    else if (e.key === 'ArrowUp') { if (n > 0) setAt((at() + n - 1) % n); e.handled = true; }
    else if (e.key === 'Enter') { if (at() < n) choose(hits()[at()]); e.handled = true; }
  };
  return <View className="absolute inset-0">
    <View className="absolute inset-0" onPointerDown={(e: ui.PointerEvent) => close()} />
    <View className="absolute top-[80] left-0 right-0 items-center">
      <View className={`flex-col rounded-[12] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`} style={{ width: FINDER_WIDTH, shadowLevel: 4 }} onKeyDown={key}>
        <View className={`flex-row items-center gap-2.5 h-[48] px-4 border-b ${bd(BORDER)}`}>
          <Icon name="search" size={18} color={() => color(MUTED)} strokeWidth={2} />
          <Input ref={field} className={`grow text-[15px] ${fg(TEXT)}`} value={query()} onInput={(v: string) => { setQuery(v); setAt(0); }} placeholder="Search songs, albums, artists, playlists" />
        </View>
        {query().trim() === '' ? <Text className={`text-[12px] px-4 py-3 ${fg(MUTED)}`}>Type to search the whole iPod; Enter plays a song or opens the rest</Text>
          : hits().length === 0 ? <Text className={`text-[12px] px-4 py-3 ${fg(MUTED)}`}>{`Nothing matches “${query().trim()}”`}</Text>
          : <View className="flex-col pb-1">{hits().map((h: Hit, i: i32) => <Row h={h} i={i} />)}</View>}
      </View>
    </View>
  </View>;
}
