// A picture on the deck: its thumbnail (zinc:imageio, decoded off the program's thread and kept on disk), and what its EXIF says.
import { createSignal, onCleanup, Show } from 'zinc:ui/solid';
import { destroyImage } from 'zinc:gfx';
import { Icon } from 'zinc:icons';
import { thumbnail, cancel } from 'zinc:imageio';
import { THEME } from 'zinc:trieur';
import { t } from '../i18n';
import { infoOf, takenAt, type Photo } from '../library';

export const CARD_W = 340, CARD_H = 420;

export function PhotoCard(p: { photo: Photo }): any {
  const ph = p.photo, i = infoOf(ph);
  const [img, setImg] = createSignal(0);
  let alive = true;
  thumbnail(ph.path, 720).then((h) => { if (alive) setImg(h); else destroyImage(h); }).catch(() => { /* not a picture after all */ });
  onCleanup(() => { alive = false; cancel(ph.path); if (img()) destroyImage(img()); });
  const when = takenAt(ph);
  // ponytail: toLocaleDateString ignores the language on QuickJS (no Intl yet): the months come from the app's words
  const date = () => t.date(when.getDate(), when.getMonth(), when.getFullYear());
  const camera = i ? `${i.make} ${i.model}`.trim() : '';
  const chip = (icon: string, text: string) => <View className="h-[24] px-2 rounded-full flex-row items-center gap-1" style={{ backgroundColor: 0x000000, opacity: 0.55 }}>
    <Icon name={icon} size={12} color={() => 0xffffff} />
    <Text className="text-[11px] text-white">{text}</Text>
  </View>;
  return <View className="grow" style={{ backgroundColor: THEME.tileBg }}>
    <Show when={img() !== 0} fallback={<View className="absolute inset-0 items-center justify-center"><Icon name="image" size={40} color={() => THEME.line} /></View>}>
      <Image image={img()} className="absolute inset-0 w-full h-full object-cover" />
    </Show>
    <View className="absolute left-0 right-0 bottom-0 h-[150] bg-linear-to-t from-[#000000cc] to-[#00000000]" />
    <View className="absolute left-0 right-0 top-0 p-3 flex-row gap-1 flex-wrap">
      {i ? chip('ratio', `${i.width} × ${i.height}`) : null}
      {i && i.location ? chip('map-pin', `${i.location.latitude.toFixed(2)}, ${i.location.longitude.toFixed(2)}`) : null}
      {i && i.iso ? chip('aperture', `ISO ${i.iso}${i.fNumber ? ' · f/' + i.fNumber : ''}`) : null}
    </View>
    <View className="absolute left-0 right-0 bottom-0 p-4 gap-1">
      <Text className="text-[16px] font-semibold text-white" numberOfLines={1}>{ph.name}</Text>
      <Text className="text-[12px] text-[#e2e4f5]" numberOfLines={1}>{date() + (camera ? ' · ' + camera : '')}</Text>
    </View>
  </View>;
}
