// The bar at the top, as iTunes shows it: previous, play or pause and next on the left, and in the middle the "LCD": the track's cover,
// title, artist and album, the time played and left, and a progress bar a click seeks in; on the right, where it plays (this computer
// or a Sonos group, with its volume). Shuffle and repeat (off, all, one) beside the transport, and the queue panel's button (QueuePanel).
// The LCD's sparkles start "Genius from this song" (25 songs) from the track playing; while a radio plays (radio.ts), 👎 and 👍 beside
// the queue's button steer it.
import * as ui from 'zinc:ui';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { current, isPlaying, position, length, playError, toggle, next, previous, seek, setShuffle, cycleRepeat } from '../services/player';
import { shuffle, repeat } from '../services/queue';
import { queueOpen, setQueueOpen } from './QueuePanel';
import { useCover, releaseCover } from '../services/covers';
import { OutputButton } from './OutputPicker';
import { SleepButton } from './SleepButton';
import { geniusFrom } from '../drafts';
import { radioOn, likeNow, dislikeNow } from '../radio';
import { duration } from '../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK, STRIPE, LCD_WIDTH, PROGRESS_WIDTH } from '../constants';

function Transport(props: { icon: string; size: i32; onPress: () => void; on?: boolean }): i32 {
  return <View className={`items-center justify-center w-[34] h-[34] rounded-full cursor-pointer hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => props.onPress()}>
    <Icon name={props.icon} size={props.size} color={() => color(props.on === undefined ? TEXT : props.on ? ACCENT : MUTED)} strokeWidth={2} />
  </View>;
}

function Cover(props: { t: ipod.Track }): i32 {
  const t = props.t, size = 40, key = `track:${t.id}`;
  const [img, setImg] = createSignal<i32>(-1);
  if (t.artwork) { useCover(key, t.id, size * 2, setImg); onCleanup(() => releaseCover(key, size * 2)); }
  return <View className={`items-center justify-center rounded-[4] overflow-hidden ${bg(TRACK)}`} style={{ width: size, height: size }}>
    {img() >= 0 ? <Image image={img()} className="w-full h-full object-cover" /> : <Icon name="music" size={16} color={() => color(MUTED)} strokeWidth={1.5} />}
  </View>;
}

function Lcd(props: { t: ipod.Track }): i32 {
  const t = props.t;
  const done = (): number => length() > 0 ? Math.min(1, position() / length()) : 0;
  return <View className={`flex-row items-center gap-3 h-[52] px-2 rounded-[8] border ${bg(STRIPE)} ${bd(BORDER)}`} style={{ width: LCD_WIDTH }}>
    <Cover t={t} />
    <View className="grow basis-0 flex-col items-center min-w-0 gap-0.5">
      <Text className={`text-[12px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{t.title !== '' ? t.title : 'Untitled'}</Text>
      <Text className={`text-[11px] ${playError() !== '' ? fg(ERROR) : fg(MUTED)}`} numberOfLines={1}>
        {playError() !== '' ? playError() : [t.artist, t.album].filter((s: string) => s !== '').join(' — ')}
      </Text>
      <View className="flex-row items-center gap-2">
        <Text className={`w-[38] text-[10px] text-right ${fg(FAINT)}`}>{duration(position() * 1000)}</Text>
        <View className={`h-[5] rounded-full overflow-hidden cursor-pointer ${bg(TRACK)}`} style={{ width: PROGRESS_WIDTH }}
          onPointerDown={(e: ui.PointerEvent) => seek(Math.max(0, Math.min(1, e.x / PROGRESS_WIDTH)) * length())}>
          <View className={`h-full ${bg(ACCENT)}`} style={{ width: Math.round(done() * PROGRESS_WIDTH) }} />
        </View>
        <Text className={`w-[38] text-[10px] ${fg(FAINT)}`}>{`-${duration(Math.max(0, length() - position()) * 1000)}`}</Text>
      </View>
    </View>
    {t.mediaType === 'audio' ? <Transport icon="sparkles" size={15} onPress={() => geniusFrom(t, 25)} /> : <View />}
  </View>;
}

export function NowPlaying(): i32 {
  return <View className={`flex-row items-center gap-4 h-[64] px-5 border-b shrink-0 ${bg(CARD)} ${bd(BORDER)}`}>
    <View className="flex-row items-center gap-1">
      <Transport icon="shuffle" size={15} on={shuffle()} onPress={() => setShuffle(!shuffle())} />
      <Transport icon="skip-back" size={18} onPress={previous} />
      <Transport icon={isPlaying() ? 'pause' : 'play'} size={22} onPress={toggle} />
      <Transport icon="skip-forward" size={18} onPress={next} />
      <Transport icon={repeat() === 'one' ? 'repeat-1' : 'repeat'} size={15} on={repeat() !== 'off'} onPress={cycleRepeat} />
      <SleepButton />
    </View>
    <View className="grow items-center">
      {current() !== null ? <Lcd t={current() as ipod.Track} />
        : <View className={`items-center justify-center h-[52] rounded-[8] border ${bg(STRIPE)} ${bd(BORDER)}`} style={{ width: LCD_WIDTH }}>
          <Text className={`text-[12px] ${fg(FAINT)}`}>Double-click a track to play it</Text>
        </View>}
    </View>
    {radioOn() ? <View className="flex-row items-center gap-1">
      <Transport icon="thumbs-down" size={16} onPress={dislikeNow} />
      <Transport icon="thumbs-up" size={16} onPress={likeNow} />
    </View> : null}
    <Transport icon="list-music" size={17} on={queueOpen()} onPress={() => setQueueOpen(!queueOpen())} />
    <OutputButton />
  </View>;
}
