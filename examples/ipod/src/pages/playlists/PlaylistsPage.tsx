// The playlists on the iPod (searched by name), and the tracks of the one picked, in its order (searched by title, artist and album);
// a smart playlist shows its rules, read-only.
// Picking one is an entry of the history; a right click on one plays it or queues it (menus.ts).
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { Icon } from 'zinc:icons';
import { playlists, playlistShown, openPlaylist, playlistTracks, filterTracks, search, setSearch, trackSearch, setTrackSearch, scrollKey } from '../../state';
import { SearchField } from '../../components/SearchField';
import { hay, words, matches } from '../../search';
import { TrackTable } from '../../components/TrackTable';
import { openTrackMenu } from '../../menus';
import { Button } from '../../components/Button';
import { download } from '../../actions';
import { busy } from '../../services/transfers';
import { count } from '../../format';
import { bg, bd, fg, color, BORDER, HOVER, SELECTED, TEXT, MUTED, ACCENT } from '../../constants';

function PlaylistRow(props: { p: ipod.Playlist }): i32 {
  const p = props.p;
  const on = (): boolean => playlistShown() === p.id;
  return <View className={`flex-row items-center gap-2.5 h-[44] px-3 rounded-[8] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) openPlaylist(p.id); }}
    onContextMenu={(e: ui.PointerEvent) => { const list = playlistTracks(p.id); openTrackMenu(e, list, 0, list, p.name); }}>
    <Icon name={p.smart ? 'sparkles' : 'list-music'} size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`} numberOfLines={1}>{p.name}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>{`${count(p.trackIds.length, 'song', 'songs')}${p.podcasts ? ' · podcasts' : p.smart ? ' · smart' : ''}`}</Text>
    </View>
  </View>;
}

export function PlaylistsPage(): i32 {
  const shown = (): ipod.Playlist | null => { for (const p of playlists()) if (p.id === playlistShown()) return p; return playlists().length > 0 ? playlists()[0] : null; };
  const listed = (): ipod.Playlist[] => { const ws = words(search()); return ws.length === 0 ? playlists() : playlists().filter((p: ipod.Playlist) => matches(hay([p.name]), ws)); };
  const tracks = (): ipod.Track[] => filterTracks(playlistTracks((shown() as ipod.Playlist).id), words(trackSearch()));
  return <View className="grow flex-row min-h-0">
    <View className={`flex-col w-[250] shrink-0 border-r ${bd(BORDER)}`}>
      <Text className={`text-[26px] font-bold px-6 pt-8 pb-3 ${fg(TEXT)}`}>Playlists</Text>
      <View className="px-3 pb-3"><SearchField value={search()} onInput={(v: string) => setSearch(v)} placeholder="Search playlists" width={226} /></View>
      <ScrollView className="grow flex-col px-3 gap-0.5" scrollKey={scrollKey('playlists')}>
        {playlists().length === 0 ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No playlists on this iPod</Text>
          : listed().length === 0 ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No playlist matches</Text> : <View />}
        {listed().map((p: ipod.Playlist) => <PlaylistRow p={p} />)}
      </ScrollView>
    </View>
    <View className="grow basis-0 flex-col min-h-0 min-w-0">
      {shown() !== null ? <View className="grow flex-col min-h-0 min-w-0">
        <View className="flex-row items-end gap-3 px-8 pt-8 pb-4">
          <View className="grow basis-0 flex-col min-w-0">
            <Text className={`text-[22px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{(shown() as ipod.Playlist).name}</Text>
            <Text className={`text-[13px] ${fg(MUTED)}`}>{trackSearch().trim() === '' ? count((shown() as ipod.Playlist).trackIds.length, 'song', 'songs')
              : `${tracks().length} of ${count((shown() as ipod.Playlist).trackIds.length, 'song', 'songs')}`}</Text>
            {(shown() as ipod.Playlist).smart ? <View className="flex-row items-center gap-1.5 pt-1 min-w-0">
              <Icon name="sparkles" size={13} color={() => color(MUTED)} strokeWidth={2} />
              <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={2}>{ipod.describeSmart((shown() as ipod.Playlist).rules, playlists()) +
                ((shown() as ipod.Playlist).rules.refreshable ? '' : ' · kept as iTunes wrote it')}</Text>
            </View> : <View />}
          </View>
          <SearchField value={trackSearch()} onInput={(v: string) => setTrackSearch(v)} placeholder="Search in the playlist" width={220} />
          <Button icon="download" label="Download" busy={busy(`Download “${(shown() as ipod.Playlist).name}”`)} onPress={() => { const p = shown() as ipod.Playlist; download(`“${p.name}”`, playlistTracks(p.id)); }} />
        </View>
        <TrackTable tracks={tracks} numbered={false} sortable={false} showAlbum={true} from={(shown() as ipod.Playlist).name} scrollKey={scrollKey('playlist')} />
      </View> : <View />}
    </View>
  </View>;
}
