// The playlists on the iPod, and the tracks of the one picked, in its order.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { Icon } from 'zinc:icons';
import { playlists, playlistShown, setPlaylistShown, playlistTracks } from '../../state';
import { TrackTable } from '../../components/TrackTable';
import { Button } from '../../components/Button';
import { download } from '../../actions';
import { busy } from '../../services/transfers';
import { count } from '../../format';
import { bg, bd, fg, color, BORDER, HOVER, SELECTED, TEXT, MUTED, ACCENT } from '../../constants';

function PlaylistRow(props: { p: ipod.Playlist }): i32 {
  const p = props.p;
  const on = (): boolean => playlistShown() === p.id;
  return <View className={`flex-row items-center gap-2.5 h-[44] px-3 rounded-[8] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => setPlaylistShown(p.id)}>
    <Icon name={p.smart ? 'sparkles' : 'list-music'} size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`} numberOfLines={1}>{p.name}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>{`${count(p.trackIds.length, 'song', 'songs')}${p.podcasts ? ' · podcasts' : p.smart ? ' · smart' : ''}`}</Text>
    </View>
  </View>;
}

export function PlaylistsPage(): i32 {
  const shown = (): ipod.Playlist | null => { for (const p of playlists()) if (p.id === playlistShown()) return p; return playlists().length > 0 ? playlists()[0] : null; };
  return <View className="grow flex-row min-h-0">
    <View className={`flex-col w-[250] shrink-0 border-r ${bd(BORDER)}`}>
      <Text className={`text-[26px] font-bold px-6 pt-8 pb-4 ${fg(TEXT)}`}>Playlists</Text>
      <ScrollView className="grow flex-col px-3 gap-0.5">
        {playlists().length === 0 ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No playlists on this iPod</Text> : <View />}
        {playlists().map((p: ipod.Playlist) => <PlaylistRow p={p} />)}
      </ScrollView>
    </View>
    <View className="grow basis-0 flex-col min-h-0 min-w-0">
      {shown() !== null ? <View className="grow flex-col min-h-0 min-w-0">
        <View className="flex-row items-end gap-3 px-8 pt-8 pb-4">
          <View className="grow basis-0 flex-col min-w-0">
            <Text className={`text-[22px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{(shown() as ipod.Playlist).name}</Text>
            <Text className={`text-[13px] ${fg(MUTED)}`}>{count((shown() as ipod.Playlist).trackIds.length, 'song', 'songs')}</Text>
          </View>
          <Button icon="download" label="Download" busy={busy(`Download “${(shown() as ipod.Playlist).name}”`)} onPress={() => { const p = shown() as ipod.Playlist; download(`“${p.name}”`, playlistTracks(p.id)); }} />
        </View>
        <TrackTable tracks={() => playlistTracks((shown() as ipod.Playlist).id)} numbered={false} sortable={false} showAlbum={true} />
      </View> : <View />}
    </View>
  </View>;
}
