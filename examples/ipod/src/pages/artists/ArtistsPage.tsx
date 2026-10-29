// The album artists (searched by name) as a VirtualList on the left, and the albums of the one picked as a grid of covers on the right;
// an album opens on the Albums page. Picking an artist is an entry of the history.
import * as ui from 'zinc:ui';
import { VirtualList } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Artist, Album, artists, shownArtists, artistShown, openArtist, search, setSearch, scrollKey } from '../../state';
import { SearchField } from '../../components/SearchField';
import { AlbumTile } from '../albums/AlbumsPage';
import { count } from '../../format';
import { bg, bd, fg, color, BORDER, HOVER, SELECTED, TEXT, MUTED, ACCENT, GRID_ROW_HEIGHT, ARTIST_ROW_HEIGHT, ARTIST_COLUMNS } from '../../constants';

function ArtistRow(props: { a: Artist; on: () => boolean }): i32 {
  const a = props.a;
  return <View className={`flex-row items-center gap-2.5 px-3 mx-3 rounded-[8] cursor-pointer ${props.on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    style={{ height: ARTIST_ROW_HEIGHT }} onPointerDown={(e: ui.PointerEvent) => openArtist(a.name)}>
    <Icon name="mic-vocal" size={16} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow basis-0 flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${props.on() ? 'font-semibold' : ''}`} numberOfLines={1}>{a.name}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>{`${count(a.albums.length, 'album', 'albums')} · ${count(a.songs, 'song', 'songs')}`}</Text>
    </View>
  </View>;
}

export function ArtistsPage(): i32 {
  const shown = (): Artist | null => {
    for (const a of artists()) if (a.name === artistShown()) return a;
    return shownArtists().length > 0 ? shownArtists()[0] : null;
  };
  const albumsOf = (): Album[] => { const a = shown(); return a === null ? [] : (a as Artist).albums; };
  return <View className="grow flex-row min-h-0">
    <View className={`flex-col w-[280] shrink-0 border-r ${bd(BORDER)}`}>
      <Text className={`text-[26px] font-bold px-6 pt-8 pb-1 ${fg(TEXT)}`}>Artists</Text>
      <Text className={`text-[13px] px-6 pb-3 ${fg(MUTED)}`}>{search().trim() === '' ? count(artists().length, 'artist', 'artists') : `${shownArtists().length} of ${count(artists().length, 'artist', 'artists')}`}</Text>
      <View className="px-3 pb-3"><SearchField value={search()} onInput={(v: string) => setSearch(v)} placeholder="Search artists" width={256} /></View>
      {search().trim() !== '' && shownArtists().length === 0 ? <Text className={`text-[13px] px-6 ${fg(MUTED)}`}>No artist matches</Text> : <View />}
      <VirtualList count={shownArtists().length} itemHeight={ARTIST_ROW_HEIGHT} className="grow min-h-0" scrollKey={scrollKey('artists')}>
        {(i: i32) => i < shownArtists().length
          ? <ArtistRow a={shownArtists()[i]} on={() => { const s = shown(); return s !== null && (s as Artist).name === shownArtists()[i].name; }} />
          : <View />}
      </VirtualList>
    </View>
    <View className="grow basis-0 flex-col min-h-0 min-w-0">
      {shown() !== null ? <View className="grow flex-col min-h-0">
        <View className="flex-col px-8 pt-8 pb-4">
          <Text className={`text-[22px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{(shown() as Artist).name}</Text>
          <Text className={`text-[13px] ${fg(MUTED)}`}>{`${count((shown() as Artist).albums.length, 'album', 'albums')} · ${count((shown() as Artist).songs, 'song', 'songs')}`}</Text>
        </View>
        <VirtualList count={Math.ceil(albumsOf().length / ARTIST_COLUMNS)} itemHeight={GRID_ROW_HEIGHT} className="grow min-h-0" scrollKey={scrollKey('artist')}>
          {(r: i32) => <View className="flex-row gap-6 px-8" style={{ height: GRID_ROW_HEIGHT }}>
            {albumsOf().slice(r * ARTIST_COLUMNS, r * ARTIST_COLUMNS + ARTIST_COLUMNS).map((a: Album) => <AlbumTile album={a} />)}
          </View>}
        </VirtualList>
      </View> : <Text className={`text-[13px] px-8 pt-8 ${fg(MUTED)}`}>No artists on this iPod</Text>}
    </View>
  </View>;
}
