// A photo read from the iPod when the node is shown and freed when it is dropped (services/covers.ts), fitted in a square; a
// tinted square with an icon while it is read.
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { usePhoto, releaseCover } from '../services/covers';
import { bg, MUTED, TRACK, color } from '../constants';

export function PhotoThumb(props: { id: string; size: i32 }): i32 {
  const id = props.id, size = props.size;
  const [img, setImg] = createSignal<i32>(-1);
  usePhoto(id, size * 2, setImg);   // twice the size: sharp on a Retina screen
  onCleanup(() => releaseCover(`photo:${id}`, size * 2));
  return <View className={`items-center justify-center rounded-[6] overflow-hidden ${bg(TRACK)}`} style={{ width: size, height: size }}>
    {img() >= 0
      ? <Image image={img()} className="w-full h-full object-contain" />
      : <Icon name="image" size={Math.round(size * 0.25)} color={() => color(MUTED)} strokeWidth={1.5} />}
  </View>;
}
