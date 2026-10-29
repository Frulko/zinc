// The albums as a grid of covers, a VirtualList of rows: only the rows on screen exist, and only their covers are read from the
// iPod and kept (components/AlbumCover). The search keeps the albums whose title, artist or year match. An album opens its tracks (an
// entry of the history: back shows the grid where it was scrolled, with its search); a right click plays it or queues it (menus.ts).
import * as ui from 'zinc:ui';
import { VirtualList } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Album, albums, shownAlbums, albumShown, openAlbum, goBack, search, setSearch, scrollKey } from '../../state';
import { AlbumCover } from '../../components/AlbumCover';
import { Button } from '../../components/Button';
import { download } from '../../actions';
import { busy } from '../../services/transfers';
import { TrackTable } from '../../components/TrackTable';
import { openTrackMenu } from '../../menus';
import { SearchField } from '../../components/SearchField';
import { count, longDuration } from '../../format';
import { fg, color, TEXT, MUTED, ACCENT, GRID_COLUMNS, COVER_SIZE, GRID_ROW_HEIGHT, HEADER_COVER_SIZE } from '../../constants';

export function AlbumTile(props: { album: Album }): i32 {
  const a = props.album;
  return <View className="flex-col gap-1.5 cursor-pointer" style={{ width: COVER_SIZE }}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) openAlbum(a); }}
    onContextMenu={(e: ui.PointerEvent) => { openTrackMenu(e, a.tracks, 0, a.tracks, a.title); }}>
    <AlbumCover album={a} size={COVER_SIZE} />
    <View className="flex-col pt-0.5">
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{a.title}</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{a.artist}</Text>
    </View>
  </View>;
}

function Grid(): i32 {
  const rows = (): i32 => Math.ceil(shownAlbums().length / GRID_COLUMNS);
  return <View className="grow flex-col min-h-0">
    <View className="flex-row items-center gap-4 px-10 pt-8 pb-4">
      <View className="grow flex-col">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Albums</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>{search().trim() === '' ? count(albums().length, 'album', 'albums') : `${shownAlbums().length} of ${count(albums().length, 'album', 'albums')}`}</Text>
      </View>
      <SearchField value={search()} onInput={(v: string) => setSearch(v)} placeholder="Search album, artist, year" width={260} />
    </View>
    {search().trim() !== '' && shownAlbums().length === 0 ? <Text className={`text-[13px] px-10 ${fg(MUTED)}`}>No album matches</Text> : <View />}
    <VirtualList count={rows()} itemHeight={GRID_ROW_HEIGHT} className="grow min-h-0" scrollKey={scrollKey('albums')}>
      {(r: i32) => <View className="flex-row gap-6 px-10" style={{ height: GRID_ROW_HEIGHT }}>
        {shownAlbums().slice(r * GRID_COLUMNS, r * GRID_COLUMNS + GRID_COLUMNS).map((a: Album) => <AlbumTile album={a} />)}
      </View>}
    </VirtualList>
  </View>;
}

function AlbumView(props: { album: Album }): i32 {
  const a = props.album;
  let ms = 0;
  for (const t of a.tracks) ms += t.durationMs;
  const facts = [count(a.tracks.length, 'song', 'songs'), longDuration(ms)];
  if (a.year > 0) facts.unshift(`${a.year}`);
  if (a.tracks.length > 0 && a.tracks[0].genre !== '') facts.unshift(a.tracks[0].genre);
  return <View className="grow flex-col min-h-0">
    <View className="flex-row items-center gap-1 px-8 pt-5 cursor-pointer" onPointerDown={(e: ui.PointerEvent) => goBack()}>
      <Icon name="chevron-left" size={18} color={() => color(ACCENT)} strokeWidth={2.5} />
      <Text className={`text-[13px] ${fg(ACCENT)}`}>Back</Text>
    </View>
    <View className="flex-row items-end gap-7 px-10 pt-4 pb-6">
      <AlbumCover album={a} size={HEADER_COVER_SIZE} />
      <View className="grow flex-col gap-1.5 min-w-0 pb-2">
        <Text className={`text-[28px] font-bold ${fg(TEXT)}`} numberOfLines={2}>{a.title}</Text>
        <Text className={`text-[18px] ${fg(ACCENT)}`} numberOfLines={1}>{a.artist}</Text>
        <Text className={`text-[12px] ${fg(MUTED)}`}>{facts.join(' · ')}</Text>
        <View className="flex-row pt-2"><Button icon="download" label="Download" busy={busy(`Download “${a.title}”`)} onPress={() => download(`“${a.title}”`, a.tracks)} /></View>
      </View>
    </View>
    <TrackTable tracks={() => a.tracks} numbered={true} sortable={false} showAlbum={false} from={a.title} scrollKey={scrollKey('album')} />
  </View>;
}

export function AlbumsPage(): i32 {
  return <View className="grow flex-col min-h-0">
    {albumShown() !== null ? <AlbumView album={albumShown() as Album} /> : <Grid />}
  </View>;
}
