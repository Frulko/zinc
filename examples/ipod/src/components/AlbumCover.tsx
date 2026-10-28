// An album's cover, read from the iPod when the node is shown and freed when it is dropped (services/covers.ts); a tinted
// square with a note while it is read and for an album without a cover.
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Album } from '../state';
import { useCover, releaseCover } from '../services/covers';
import { bg, MUTED, TRACK, color } from '../constants';

export function AlbumCover(props: { album: Album; size: i32 }): i32 {
  const a = props.album, size = props.size;
  const [img, setImg] = createSignal<i32>(-1);
  if (a.coverTrack !== '') {
    useCover(a.key, a.coverTrack, size * 2, setImg);   // twice the size: sharp on a Retina screen
    onCleanup(() => releaseCover(a.key, size * 2));
  }
  const radius = size > 100 ? 8 : 4;
  return <View className={`items-center justify-center rounded-[${radius}] overflow-hidden ${bg(TRACK)}`} style={{ width: size, height: size }}>
    {img() >= 0
      ? <Image image={img()} className="w-full h-full object-cover" />
      : <Icon name="music" size={Math.round(size * 0.3)} color={() => color(MUTED)} strokeWidth={1.5} />}
  </View>;
}
