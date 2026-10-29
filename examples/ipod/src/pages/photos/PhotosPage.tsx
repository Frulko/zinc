// The photos of the iPod: its albums on the left, the photos of the one picked as a grid (a VirtualList of rows: only the rows
// on screen are read from the iPod), and a photo opened in full.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { VirtualList } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { photoAlbums, photoAlbumShown, setPhotoAlbumShown, photoShown, setPhotoShown } from '../../state';
import { PhotoThumb } from '../../components/PhotoThumb';
import { count } from '../../format';
import { bg, bd, fg, color, BORDER, HOVER, SELECTED, TEXT, MUTED, ACCENT, GRID_COLUMNS, PHOTO_SIZE, PHOTO_ROW_HEIGHT, PHOTO_VIEW_SIZE } from '../../constants';

function AlbumRow(props: { a: ipod.PhotoAlbum; on: () => boolean }): i32 {
  const a = props.a;
  return <View className={`flex-row items-center gap-2.5 h-[44] px-3 rounded-[8] cursor-pointer ${props.on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { setPhotoAlbumShown(a.id); setPhotoShown(''); }}>
    <Icon name={a.master ? 'images' : 'image'} size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${props.on() ? 'font-semibold' : ''}`} numberOfLines={1}>{a.name !== '' ? a.name : 'Photos'}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>{count(a.photoIds.length, 'photo', 'photos')}</Text>
    </View>
  </View>;
}

function Grid(props: { a: ipod.PhotoAlbum }): i32 {
  const ids = props.a.photoIds;
  const rows = Math.ceil(ids.length / GRID_COLUMNS);
  return <VirtualList count={rows} itemHeight={PHOTO_ROW_HEIGHT} className="grow min-h-0">
    {(r: i32) => <View className="flex-row gap-4 px-8" style={{ height: PHOTO_ROW_HEIGHT }}>
      {ids.slice(r * GRID_COLUMNS, r * GRID_COLUMNS + GRID_COLUMNS).map((id: string) =>
        <View className="cursor-pointer" onPointerDown={(e: ui.PointerEvent) => setPhotoShown(id)}><PhotoThumb id={id} size={PHOTO_SIZE} /></View>)}
    </View>}
  </VirtualList>;
}

function PhotoView(props: { a: ipod.PhotoAlbum; id: string }): i32 {
  const k = props.a.photoIds.indexOf(props.id);
  return <View className="grow flex-col min-h-0">
    <View className="flex-row items-center gap-1 px-8 pt-5 pb-4 cursor-pointer" onPointerDown={(e: ui.PointerEvent) => setPhotoShown('')}>
      <Icon name="chevron-left" size={18} color={() => color(ACCENT)} strokeWidth={2.5} />
      <Text className={`grow text-[13px] ${fg(ACCENT)}`}>{props.a.name !== '' ? props.a.name : 'Photos'}</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`}>{`${k + 1} of ${props.a.photoIds.length}`}</Text>
    </View>
    <View className="grow items-center justify-center min-h-0 px-8 pb-8">
      <PhotoThumb id={props.id} size={PHOTO_VIEW_SIZE} />
    </View>
  </View>;
}

export function PhotosPage(): i32 {
  const shown = (): ipod.PhotoAlbum | null => {
    for (const a of photoAlbums()) if (a.id === photoAlbumShown()) return a;
    return photoAlbums().length > 0 ? photoAlbums()[0] : null;
  };
  return <View className="grow flex-row min-h-0">
    <View className={`flex-col w-[250] shrink-0 border-r ${bd(BORDER)}`}>
      <Text className={`text-[26px] font-bold px-6 pt-8 pb-4 ${fg(TEXT)}`}>Photos</Text>
      <ScrollView className="grow flex-col px-3 gap-0.5">
        {photoAlbums().length === 0 ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No photos on this iPod</Text> : <View />}
        {photoAlbums().map((a: ipod.PhotoAlbum) => <AlbumRow a={a} on={() => (shown() as ipod.PhotoAlbum | null) !== null && (shown() as ipod.PhotoAlbum).id === a.id} />)}
      </ScrollView>
    </View>
    <View className="grow basis-0 flex-col min-h-0 min-w-0">
      {shown() === null ? <View />
        : photoShown() !== '' ? <PhotoView a={shown() as ipod.PhotoAlbum} id={photoShown()} />
        : <View className="grow flex-col min-h-0">
          <View className="flex-col px-8 pt-8 pb-4">
            <Text className={`text-[22px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{(shown() as ipod.PhotoAlbum).name}</Text>
            <Text className={`text-[13px] ${fg(MUTED)}`}>{count((shown() as ipod.PhotoAlbum).photoIds.length, 'photo', 'photos')}</Text>
          </View>
          {(shown() as ipod.PhotoAlbum).photoIds.length === 0 ? <Text className={`text-[13px] px-8 ${fg(MUTED)}`}>No photos in this album</Text> : <Grid a={shown() as ipod.PhotoAlbum} />}
        </View>}
    </View>
  </View>;
}
