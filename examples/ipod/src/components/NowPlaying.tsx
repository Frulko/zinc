// The bar at the top, as iTunes shows it: previous, play or pause and next on the left, and in the middle the "LCD": the track's cover,
// title, artist and album, the time played and left, and a progress bar a click seeks in; on the right, where it plays (this computer
// or a Sonos group, with its volume). Shuffle and repeat (off, all, one) beside the transport, and the queue panel's button (QueuePanel).
// The LCD's sparkles start "Genius from this song" (25 songs) from the track playing; its quote button opens the Lyrics panel (LyricsPanel);
// while a radio plays (radio.ts), 👎 and 👍 beside the queue's button steer it.
import * as ui from 'zinc:ui';
import { createSignal, createNodeRef, onCleanup } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { current, isPlaying, position, length, playError, toggle, next, previous, seek, setShuffle, cycleRepeat } from '../services/player';
import { shuffle, repeat } from '../services/queue';
import { queueOpen, setQueueOpen } from './QueuePanel';
import { lyricsOpen, setLyricsOpen } from './LyricsPanel';
import { useCover, releaseCover } from '../services/covers';
import { OutputButton } from './OutputPicker';
import { SleepButton } from './SleepButton';
import { geniusFrom } from '../drafts';
import { radioOn, likeNow, dislikeNow } from '../radio';
import { duration } from '../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK, STRIPE, LCD_WIDTH } from '../constants';

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
  const rail = createNodeRef();
  const [railWidth, setRailWidth] = createSignal<number>(0);
  const measure = (): void => {
    const box = ui.inspectNode(rail.node);
    if (box !== null && box.lw !== railWidth()) setRailWidth(Math.max(0, box.lw));
  };
  ui.addWatcher(measure);
  onCleanup(() => ui.removeWatcher(measure));
  const done = (): number => length() > 0 ? Math.max(0, Math.min(1, position() / length())) : 0;
  return <View className={`flex-row items-center gap-1.5 h-[52] px-2 rounded-[8] border w-full min-w-0 ${bg(STRIPE)} ${bd(BORDER)}`} style={{ maxWidth: LCD_WIDTH }}>
    <Cover t={t} />
    <View className="grow basis-0 flex-col items-center min-w-0 gap-0.5">
      <Text className={`text-[12px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{t.title !== '' ? t.title : 'Untitled'}</Text>
      <Text className={`text-[11px] ${playError() !== '' ? fg(ERROR) : fg(MUTED)}`} numberOfLines={1}>
        {playError() !== '' ? playError() : [t.artist, t.album].filter((s: string) => s !== '').join(' — ')}
      </Text>
      <View className="flex-row items-center gap-1 w-full min-w-0">
        <Text className={`w-[48] text-[10px] text-right shrink-0 ${fg(FAINT)}`} numberOfLines={1}>{duration(position() * 1000)}</Text>
        <View ref={rail} className={`grow basis-0 min-w-0 h-[5] rounded-full overflow-hidden cursor-pointer ${bg(TRACK)}`}
          onPointerDown={(e: ui.PointerEvent) => {
            const box = ui.inspectNode(rail.node);
            if (box !== null && box.lw > 0) seek(Math.max(0, Math.min(1, e.x / box.lw)) * Math.max(0, length()));
          }}>
          <View className={`h-full ${bg(ACCENT)}`} style={{ width: Math.round(done() * railWidth()) }} />
        </View>
        <Text className={`w-[48] text-[10px] shrink-0 ${fg(FAINT)}`} numberOfLines={1}>{`-${duration(Math.max(0, length() - position()) * 1000)}`}</Text>
      </View>
    </View>
    {t.mediaType === 'audio' ? <Transport icon="sparkles" size={15} onPress={() => geniusFrom(t, 25)} /> : <View />}
    <View className={`items-center justify-center w-[22] h-[34] rounded-full cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => setLyricsOpen(!lyricsOpen())}>
      <Icon name="text-quote" size={15} color={() => color(lyricsOpen() ? ACCENT : MUTED)} strokeWidth={2} />
    </View>
  </View>;
}

export function NowPlaying(): i32 {
  return <View className={`flex-row items-center gap-1 h-[64] px-2 border-b shrink-0 ${bg(CARD)} ${bd(BORDER)}`}>
    <View className="flex-row items-center">
      <Transport icon="shuffle" size={15} on={shuffle()} onPress={() => setShuffle(!shuffle())} />
      <Transport icon="skip-back" size={18} onPress={previous} />
      <Transport icon={isPlaying() ? 'pause' : 'play'} size={22} onPress={toggle} />
      <Transport icon="skip-forward" size={18} onPress={next} />
      <Transport icon={repeat() === 'one' ? 'repeat-1' : 'repeat'} size={15} on={repeat() !== 'off'} onPress={cycleRepeat} />
      <SleepButton />
    </View>
    <View className="grow basis-0 min-w-0 items-center">
      {current() !== null ? <Lcd t={current() as ipod.Track} />
        : <View className={`items-center justify-center h-[52] rounded-[8] border w-full min-w-0 ${bg(STRIPE)} ${bd(BORDER)}`} style={{ maxWidth: LCD_WIDTH }}>
          <Text className={`text-[12px] ${fg(FAINT)}`}>Double-click a track to play it</Text>
        </View>}
    </View>
    {radioOn() ? <View className="flex-row items-center">
      <Transport icon="thumbs-down" size={16} onPress={dislikeNow} />
      <Transport icon="thumbs-up" size={16} onPress={likeNow} />
    </View> : null}
    <Transport icon="list-music" size={17} on={queueOpen()} onPress={() => setQueueOpen(!queueOpen())} />
    <OutputButton />
  </View>;
}
