// The queue, as Spotify's panel shows it, at the right under the bar: Now playing, Next in queue (the tracks added by hand, with Clear
// queue) and Next from <the list it was started from>. A row is dragged up or down to another place (into the other section too), its x
// takes it out, a double-click plays it. The same queue plays here and on a Sonos group (services/player.ts keeps the group's in step).
import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as queue from '../services/queue';
import { isPlaying, jumpTo } from '../services/player';
import { duration } from '../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, SELECTED, TEXT, MUTED, FAINT, ACCENT, QUEUE_WIDTH, QUEUE_ROW_HEIGHT, QUEUE_FROM_SHOWN } from '../constants';

export const [queueOpen, setQueueOpen] = createSignal<boolean>(false);
/** The row dragged (its entry key, -1 when none) and how far it moved, in rows. */
const [dragKey, setDragKey] = createSignal<i32>(-1);
const [dragRows, setDragRows] = createSignal<i32>(0);

/** Where a row of index `i` lands after moving `rows` rows: within what follows the current entry. */
function target(i: i32, rows: i32): i32 { return Math.max(queue.position() + 1, Math.min(queue.entries().length - 1, i + rows)) as i32; }

function indexOfKey(key: i32): i32 { const list = queue.entries(); for (let k = 0; k < list.length; k++) if (list[k].key === key) return k as i32; return -1; }

function Row(props: { e: queue.Entry; i: i32; now: boolean }): i32 {
  const e = props.e, i = props.i;
  const dragged = (): boolean => dragKey() === e.key;
  const landing = (): boolean => dragKey() >= 0 && !dragged() && target(indexOfKey(dragKey()), dragRows()) === i;
  return <View className={`flex-row items-center gap-3 px-3 rounded-[6] ${dragged() ? bg(SELECTED) : `hover:${bg(HOVER)}`} ${landing() ? `border-t-2 ${bd(ACCENT)}` : ''}`}
    style={{ height: QUEUE_ROW_HEIGHT }} dragAxis="y"
    onPointerDown={(ev: ui.PointerEvent) => { if (ev.clicks === 2 && !props.now) jumpTo(i); }}
    onDrag={(ev: ui.PointerEvent) => {
      if (props.now) return;
      if (ev.phase === 0) { setDragKey(e.key); setDragRows(0); }
      else if (ev.phase === 1) setDragRows(Math.round(ev.dy / QUEUE_ROW_HEIGHT) as i32);
      else {
        const to = target(i, Math.round(ev.dy / QUEUE_ROW_HEIGHT) as i32), list = queue.entries();
        setDragKey(-1); setDragRows(0);
        if (ev.phase === 2 && to !== i) queue.moveTo(i, to, list[to].manual);
      }
    }}>
    {props.now ? <Icon name={isPlaying() ? 'volume-2' : 'volume'} size={14} color={() => color(ACCENT)} strokeWidth={2} /> : <View />}
    <View className="grow basis-0 flex-col min-w-0">
      <Text className={`text-[13px] ${props.now ? `${fg(ACCENT)} font-semibold` : fg(TEXT)}`} numberOfLines={1}>{e.track.title !== '' ? e.track.title : 'Untitled'}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{e.track.artist}</Text>
    </View>
    <Text className={`text-[11px] ${fg(FAINT)}`}>{duration(e.track.durationMs)}</Text>
    {props.now ? <View className="w-[16]" />
      : <View className="w-[16] items-center cursor-pointer" onPointerDown={(ev: ui.PointerEvent) => queue.removeAt(i)}>
          <Icon name="x" size={13} color={() => color(FAINT)} strokeWidth={2} />
        </View>}
  </View>;
}

function Heading(props: { label: string; action: string; onPress: () => void }): i32 {
  return <View className="flex-row items-center px-3 pt-4 pb-1.5">
    <Text className={`grow text-[13px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{props.label}</Text>
    {props.action !== '' ? <Text className={`text-[11px] font-semibold cursor-pointer ${fg(MUTED)}`} onPointerDown={(e: ui.PointerEvent) => props.onPress()}>{props.action}</Text> : <View />}
  </View>;
}

/** The sections, built again on each change of the queue (QueuePanel maps the version to them: a condition on it would be built once). */
function Sections(): i32 {
  const now = queue.current(), at = queue.position(), hand = queue.nextInQueue(), rest = queue.nextFrom(), n = hand.length as i32;
  if (now === null) return <Text className={`text-[13px] px-3 pt-2 ${fg(MUTED)}`}>Nothing is playing. Double-click a song, or right-click one to queue it.</Text>;
  return <View className="flex-col">
    <Heading label="Now playing" action="" onPress={() => {}} />
    <Row e={now as queue.Entry} i={at} now={true} />
    {n > 0 ? <Heading label="Next in queue" action="Clear queue" onPress={() => queue.clearHandAdded()} /> : <View />}
    {hand.map((e: queue.Entry, k: i32) => <Row e={e} i={at + 1 + k} now={false} />)}
    {rest.length > 0 ? <Heading label={queue.contextName() !== '' ? `Next from: ${queue.contextName()}` : 'Next up'} action="" onPress={() => {}} /> : <View />}
    {rest.slice(0, QUEUE_FROM_SHOWN).map((e: queue.Entry, k: i32) => <Row e={e} i={at + 1 + n + k} now={false} />)}
    {rest.length > QUEUE_FROM_SHOWN ? <Text className={`text-[11px] px-3 pt-2 ${fg(FAINT)}`}>{`and ${rest.length - QUEUE_FROM_SHOWN} more`}</Text> : <View />}
  </View>;
}

export function QueuePanel(): i32 {
  return <View className={`absolute top-[64] right-[0] bottom-[0] flex-col border-l ${bg(CARD)} ${bd(BORDER)}`} style={{ width: QUEUE_WIDTH }}>
    <View className="flex-row items-center px-4 h-[44] shrink-0">
      <Text className={`grow text-[15px] font-bold ${fg(TEXT)}`}>Queue</Text>
      <View className={`p-1 rounded-full cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => setQueueOpen(false)}>
        <Icon name="x" size={15} color={() => color(MUTED)} strokeWidth={2} />
      </View>
    </View>
    <ScrollView className="grow flex-col px-1 pb-4">
      {[queue.queueVersion()].map((v: i32) => <Sections />)}
    </ScrollView>
  </View>;
}
