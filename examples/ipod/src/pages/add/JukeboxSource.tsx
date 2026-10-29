// The Add page's "From jukebox" source: the library server of Settings (services/jukebox.ts) browsed by artist (then album), by
// playlist, or searched; Add on a row queues it (jukeboxAdd.ts): an album or an artist's songs, a playlist (made on the iPod too), a song.
import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as jb from '../../services/jukebox';
import { loadConfig } from '../../services/config';
import { addFromJukebox } from '../../jukeboxAdd';
import { allowChanges } from '../../state';
import { Button } from '../../components/Button';
import { SearchField } from '../../components/SearchField';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR } from '../../constants';

const ROWS_SHOWN = 300;

const [server, setServer] = createSignal<jb.Server | null>(null);
const [said, setSaid] = createSignal<string>('');
const [tab, setTab] = createSignal<string>('artists');
const [entries, setEntries] = createSignal<jb.Entry[]>([]);
/** The artist whose albums are listed, null at the top. */
const [artist, setArtist] = createSignal<jb.Entry | null>(null);
/** The album or playlist opened (its songs listed), null when none; search results have none. */
const [opened, setOpened] = createSignal<jb.Entry | null>(null);
const [songs, setSongs] = createSignal<jb.Song[]>([]);
const [query, setQuery] = createSignal<string>('');

function failed(e: Error): void { setSaid(e.message); }

async function show(which: string): Promise<void> {
  const s = server();
  if (s === null) return;
  setTab(which); setArtist(null); setOpened(null); setSongs([]); setSaid('');
  try {
    setEntries(which === 'playlists' ? await jb.playlists(s as jb.Server) : which === 'artists' ? await jb.artists(s as jb.Server) : []);
  } catch (e) { failed(e as Error); }
}

async function connectNow(): Promise<void> {
  const c = loadConfig();
  if (c.jukeboxUrl.trim() === '') { setSaid('Set the address of jukebox in Settings first'); return; }
  setSaid('Connecting…');
  try { setServer(await jb.connect(c.jukeboxUrl, c.jukeboxToken)); await show('artists'); }
  catch (e) { failed(e as Error); }
}

async function open(e: jb.Entry): Promise<void> {
  const s = server() as jb.Server;
  setSaid('');
  try {
    if (e.kind === 'artist') { setArtist(e); setOpened(null); setSongs([]); setEntries(await jb.albums(s, e)); return; }
    setOpened(e); setSongs(await jb.songsOf(s, e));
  } catch (x) { failed(x as Error); }
}

async function add(e: jb.Entry): Promise<void> {
  const s = server() as jb.Server;
  try {
    const list = await jb.songsOf(s, e);
    addFromJukebox(s, list, e.kind === 'album' ? `the album ${e.name}` : e.kind === 'playlist' ? `the playlist ${e.name}` : `the songs of ${e.name}`,
      e.kind === 'playlist' ? e.name : '');
  } catch (x) { failed(x as Error); }
}

let searchAt = 0;
function search(q: string): void {
  setQuery(q);
  const s = server();
  if (s === null) return;
  setTab('search'); setArtist(null); setOpened(null);
  const mine = ++searchAt;
  jb.search(s as jb.Server, q).then((r: jb.Song[]) => { if (mine === searchAt) setSongs(r); }).catch((e: Error) => failed(e));
}

function Tab(props: { id: string; label: string }): i32 {
  const on = (): boolean => tab() === props.id;
  return <View className={`px-3 h-[26] justify-center rounded-[6] cursor-pointer ${on() ? bg(HOVER) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { show(props.id); }}>
    <Text className={`text-[12px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`}>{props.label}</Text>
  </View>;
}

function EntryRow(props: { e: jb.Entry }): i32 {
  return <View className={`flex-row items-center gap-2.5 px-4 py-1.5 border-t cursor-pointer hover:${bg(HOVER)} ${bd(BORDER)}`}
    onPointerDown={(x: ui.PointerEvent) => { open(props.e); }}>
    <Icon name={props.e.kind === 'artist' ? 'mic-vocal' : props.e.kind === 'album' ? 'disc-3' : 'list-music'} size={14} color={() => color(MUTED)} strokeWidth={2} />
    <Text className={`grow basis-0 text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{props.e.name}</Text>
    <Text className={`w-[160] text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{props.e.sub}</Text>
    <Button icon="plus" label="Add" disabled={!allowChanges()} onPress={() => { add(props.e); }} />
  </View>;
}

function SongRow(props: { x: jb.Song }): i32 {
  const x = props.x;
  return <View className={`flex-row items-center gap-2.5 px-4 py-1.5 border-t ${bd(BORDER)}`}>
    <Text className={`w-[28] text-[12px] ${fg(FAINT)}`}>{x.trackNr > 0 ? `${x.trackNr}` : ''}</Text>
    <Text className={`grow basis-0 text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{x.title}</Text>
    <Text className={`w-[200] text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{`${x.artist}${x.album !== '' ? ` · ${x.album}` : ''}`}</Text>
    <Text className={`w-[44] text-[11px] ${fg(FAINT)}`}>{x.format.toUpperCase()}</Text>
    <Button icon="plus" label="Add" disabled={!allowChanges()} onPress={() => { addFromJukebox(server() as jb.Server, [x], `“${x.title}”`, ''); }} />
  </View>;
}

export function JukeboxSource(): i32 {
  if (server() === null && said() === '') connectNow();
  const heading = (): string => {
    const o = opened(), a = artist();
    if (o !== null) return `${(o as jb.Entry).name}${(o as jb.Entry).sub !== '' ? ` · ${(o as jb.Entry).sub}` : ''}`;
    if (tab() === 'search') return query() === '' ? 'Type to search' : `${songs().length} songs match “${query()}”`;
    return a !== null ? `Albums of ${(a as jb.Entry).name}` : tab() === 'playlists' ? 'Playlists' : 'Artists';
  };
  return <View className="flex-col gap-3">
    <View className="flex-row items-center gap-2">
      <Tab id="artists" label="Artists" />
      <Tab id="playlists" label="Playlists" />
      <View className="grow" />
      <SearchField value={query()} onInput={search} placeholder="Search jukebox" width={260} />
      <Button icon="refresh-cw" label="Connect" onPress={() => { connectNow(); }} />
    </View>
    {said() !== '' ? <Text className={`text-[12px] ${said().endsWith('…') ? fg(MUTED) : fg(ERROR)}`}>{said()}</Text> : <View />}
    <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
      <View className="flex-row items-center gap-2 px-4 py-2">
        {opened() !== null || artist() !== null ? <View className="cursor-pointer" onPointerDown={(e: ui.PointerEvent) => {
          if (opened() !== null && artist() !== null) { setOpened(null); setSongs([]); } else show(tab());
        }}><Icon name="chevron-left" size={16} color={() => color(ACCENT)} strokeWidth={2} /></View> : <View />}
        <Text className={`grow basis-0 text-[12px] font-semibold ${fg(MUTED)}`} numberOfLines={1}>{heading()}</Text>
        {opened() !== null ? <Button icon="plus" label={(opened() as jb.Entry).kind === 'playlist' ? 'Add as a playlist' : 'Add the album'} accent={true}
          disabled={!allowChanges()} onPress={() => { add(opened() as jb.Entry); }} /> : <View />}
      </View>
      {opened() !== null || tab() === 'search'
        ? <View className="flex-col">{songs().slice(0, ROWS_SHOWN).map((x: jb.Song) => <SongRow x={x} />)}</View>
        : <View className="flex-col">{entries().slice(0, ROWS_SHOWN).map((e: jb.Entry) => <EntryRow e={e} />)}</View>}
    </View>
  </View>;
}
