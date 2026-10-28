// The iPod's disk as one bar: a segment per kind of media (bytes of its tracks), the rest of the used space, then the free
// space; a legend under it with each part's size.
import * as ipod from 'zinc:ipod';
import { bytes } from '../format';
import { bg, fg, MUTED, TEXT, TRACK, MEDIA_KINDS, MEDIA_NAMES, MEDIA_COLORS, OTHER_COLOR } from '../constants';

class Part { name: string; size: number; color: i32; constructor(name: string, size: number, color: i32) { this.name = name; this.size = size; this.color = color; } }

function partsOf(device: ipod.Device, tracks: ipod.Track[]): Part[] {
  const sizes: number[] = [];
  for (let k = 0; k < MEDIA_KINDS.length; k++) sizes.push(0);
  let media = 0;
  for (const t of tracks) {
    const k = MEDIA_KINDS.indexOf(t.mediaType);
    sizes[k < 0 ? 0 : k] += t.size;
    media += t.size;
  }
  const out: Part[] = [];
  for (let k = 0; k < MEDIA_KINDS.length; k++) if (sizes[k] > 0) out.push(new Part(MEDIA_NAMES[k], sizes[k], MEDIA_COLORS[k]));
  const other = device.totalBytes - device.freeBytes - media;
  if (other > 0) out.push(new Part('Other', other, OTHER_COLOR));
  return out;
}

export function StorageBar(props: { device: ipod.Device; tracks: ipod.Track[] }): i32 {
  const d = props.device, parts = partsOf(d, props.tracks);
  const total = d.totalBytes > 0 ? d.totalBytes : 1;
  return <View className="flex-col gap-3">
    <View className={`flex-row h-[14] rounded-full overflow-hidden ${bg(TRACK)}`}>
      {parts.map((p: Part) => <View className="h-full" bg={p.color} style={{ widthPercent: Math.max(0.006, p.size / total) }} />)}
    </View>
    <View className="flex-row flex-wrap gap-x-5 gap-y-2">
      {parts.map((p: Part) => <View className="flex-row items-center gap-1.5">
        <View className="w-[9] h-[9] rounded-full" bg={p.color} />
        <Text className={`text-[12px] ${fg(TEXT)}`}>{p.name}</Text>
        <Text className={`text-[12px] ${fg(MUTED)}`}>{bytes(p.size)}</Text>
      </View>)}
      <View className="flex-row items-center gap-1.5">
        <View className={`w-[9] h-[9] rounded-full ${bg(TRACK)}`} />
        <Text className={`text-[12px] ${fg(TEXT)}`}>Free</Text>
        <Text className={`text-[12px] ${fg(MUTED)}`}>{bytes(d.freeBytes)}</Text>
      </View>
    </View>
  </View>;
}
