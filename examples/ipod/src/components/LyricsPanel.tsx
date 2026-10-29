// The lyrics of the song playing (services/lyrics.ts, from LRCLIB), at the right under the bar, beside the queue when it is open too. Synced
// lyrics highlight the line sung and keep it in view as the song plays; plain ones are shown as they are. "Write to iPod" puts them in the
// song's file on the iPod (zinc:ipod writeLyrics), so the iPod shows them too: a Transfers job, behind Allow changes.
import * as ui from 'zinc:ui';
import { createSignal, createMemo, createEffect, createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { current, position } from '../services/player';
import { Lyrics, Line, lyricsOf, parseLrc, lineAt } from '../services/lyrics';
import { writeLyrics } from '../services/ipod';
import { enqueue, busy } from '../services/transfers';
import { allowed, refresh } from '../actions';
import { queueOpen } from './QueuePanel';
import { Button } from './Button';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ERROR, QUEUE_WIDTH } from '../constants';

const WIDTH: i32 = 340;
const LINE_HEIGHT: i32 = 44;   // a line of synced lyrics (two lines of text at most): the scroll keeps the one sung near the top third

export const [lyricsOpen, setLyricsOpen] = createSignal<boolean>(false);
/** The lyrics shown, the track they are of, and why there are none ('' while asking). */
const [shown, setShown] = createSignal<Lyrics | null>(null);
const [shownId, setShownId] = createSignal<string>('');
const [why, setWhy] = createSignal<string>('');

function load(t: ipod.Track): void {
  setShownId(t.id); setShown(null); setWhy('');
  lyricsOf(t).then((l: Lyrics) => {
    if (shownId() !== t.id) return;
    setShown(l);
    if (l.synced === '' && l.plain === '') setWhy('LRCLIB has no lyrics for this song.');
  }).catch((e: Error) => { if (shownId() === t.id) setWhy(e.message); });
}

const lines = createMemo<Line[]>(() => { const l = shown(); return l !== null && (l as Lyrics).synced !== '' ? parseLrc((l as Lyrics).synced) : []; }, []);
const sung = createMemo<i32>(() => lineAt(lines(), position() * 1000), -1);

/** The words the iPod shows: the plain lyrics, else the synced ones without their times. */
function words(l: Lyrics): string { return l.plain !== '' ? l.plain : parseLrc(l.synced).map((x: Line) => x.text).join('\n'); }

function writeToIpod(t: ipod.Track, l: Lyrics): void {
  if (!allowed('Write the lyrics to the iPod')) return;
  const text = words(l);
  enqueue('lyrics', `Write the lyrics of ${t.title !== '' ? t.title : 'Untitled'}`, async (): Promise<string> => {
    await writeLyrics(t.id, text);
    await refresh();
    return `${text.split('\n').length} lines written to the song's file`;
  });
}

function Synced(): i32 {
  const ref = createNodeRef();
  createEffect(() => { const i = sung(); if (ref.node >= 0) ui.scrollTo(ref.node, 0, Math.max(0, (i - 2) * LINE_HEIGHT), true); });
  return <ScrollView ref={ref} className="grow flex-col px-5 pb-6">
    {lines().map((x: Line, i: i32) => <View className="justify-center" style={{ height: LINE_HEIGHT }}>
      <Text className={`text-[16px] font-semibold ${i === sung() ? fg(TEXT) : i < sung() ? fg(FAINT) : fg(MUTED)}`} numberOfLines={2}>{x.text !== '' ? x.text : '♪'}</Text>
    </View>)}
  </ScrollView>;
}

function Body(props: { t: ipod.Track }): i32 {
  const l = (): Lyrics | null => shown();
  if (shownId() !== props.t.id) setTimeout(() => load(props.t), 0);
  return <View className="grow flex-col min-h-0">
    {l() === null ? <Text className={`text-[13px] px-5 pt-2 ${why() !== '' ? fg(ERROR) : fg(MUTED)}`}>{why() !== '' ? why() : 'Asking LRCLIB…'}</Text>
      : (l() as Lyrics).synced !== '' ? <Synced />
      : (l() as Lyrics).plain !== '' ? <ScrollView className="grow flex-col px-5 pb-6"><Text className={`text-[14px] leading-[24px] ${fg(TEXT)}`}>{(l() as Lyrics).plain}</Text></ScrollView>
      : <Text className={`text-[13px] px-5 pt-2 ${fg(MUTED)}`}>{why()}</Text>}
    {l() !== null && words(l() as Lyrics) !== '' ? <View className={`flex-row items-center gap-2 px-4 py-3 border-t ${bd(BORDER)}`}>
      <Text className={`grow text-[11px] ${fg(FAINT)}`} numberOfLines={2}>{props.t.lyrics ? 'The iPod has lyrics for this song' : 'Lyrics from LRCLIB'}</Text>
      <Button icon="download" label="Write to iPod" busy={busy('lyrics')} onPress={() => writeToIpod(props.t, l() as Lyrics)} />
    </View> : <View />}
  </View>;
}

export function LyricsPanel(): i32 {
  return <View className={`absolute top-[64] bottom-[0] flex-col border-l ${bg(CARD)} ${bd(BORDER)}`} style={{ width: WIDTH, right: queueOpen() ? QUEUE_WIDTH : 0 }}>
    <View className="flex-row items-center px-4 h-[44] shrink-0">
      <Text className={`grow text-[15px] font-bold ${fg(TEXT)}`}>Lyrics</Text>
      <View className={`p-1 rounded-full cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => setLyricsOpen(false)}>
        <Icon name="x" size={15} color={() => color(MUTED)} strokeWidth={2} />
      </View>
    </View>
    {current() !== null ? <Body t={current() as ipod.Track} />
      : <Text className={`text-[13px] px-5 pt-2 ${fg(MUTED)}`}>Nothing is playing. The lyrics of the song playing show here.</Text>}
  </View>;
}
