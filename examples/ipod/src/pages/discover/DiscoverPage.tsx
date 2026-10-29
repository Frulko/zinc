// Discover: artists to hear next (services/discover.ts). The first list is Last.fm's similar artists of what you listen to that are not
// on this iPod, best first, each "because you listen to X, Y"; a click opens its top albums and songs (Last.fm, kept 30 days) and links
// to Bandcamp, MusicBrainz and Last.fm. The second list is the artists of your history that are not on this iPod, most played first.
import * as ui from 'zinc:ui';
import { createSignal, createMemo } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { openUrl } from 'zinc:system/opener';
import { library, scrollKey, showPage } from '../../state';
import { history, historyStarted, historyVersion, unmatchedArtists } from '../../services/historyJobs';
import { Ranked, normArtist } from '../../services/history';
import { readArtistGraph } from '../../services/genius';
import { Discovery, ArtistTop, Named, discoveries, becauseLine, artistTop, links, LINK_NAMES } from '../../services/discover';
import { backupPlace } from '../../services/log';
import { loadConfig } from '../../services/config';
import { fetchArtistsNow } from '../../drafts';
import { Button } from '../../components/Button';
import { count } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR, PAGE_SETTINGS } from '../../constants';

const SHOWN: i32 = 40;
const HISTORY_SHOWN: i32 = 30;

function dir(): string { return `${backupPlace()}/history`; }

class Found { list: Discovery[] = []; heard: i32 = 0; graph: i32 = 0; away: Ranked[] = []; }

const found = createMemo<Found>(() => {
  historyVersion();
  const lib = library(), f = new Found();
  if (lib === null || !historyStarted()) return f;
  const onPod = new Set<string>();
  for (const t of lib.tracks) { if (t.artist !== '') onPod.add(normArtist(t.artist)); if (t.albumArtist !== '') onPod.add(normArtist(t.albumArtist)); }
  const graph = readArtistGraph(dir());
  let heard: Ranked[] = [];
  try { heard = history().topArtists(0, 1e12, 5000); } catch (e) { /* no history yet */ }
  f.list = discoveries(graph, heard, onPod, SHOWN);
  f.heard = heard.length; f.graph = graph.size;
  f.away = unmatchedArtists(HISTORY_SHOWN);
  return f;
}, new Found());

/** The discovery opened (its key), what Last.fm said of it, or why it could not. */
const [opened, setOpened] = createSignal<string>('');
const [top, setTop] = createSignal<ArtistTop | null>(null);
const [topError, setTopError] = createSignal<string>('');

function open(d: Discovery): void {
  if (opened() === d.key) { setOpened(''); return; }
  setOpened(d.key); setTop(null); setTopError('');
  artistTop(dir(), loadConfig().lastfmKey, d.key, d.name).then((t: ArtistTop) => { if (opened() === d.key) setTop(t); })
    .catch((e: Error) => { if (opened() === d.key) setTopError(e.message); });
}

function Links(props: { name: string }): i32 {
  const urls = links(props.name);
  return <View className="flex-row gap-2">
    {urls.map((u: string, i: i32) => <Button icon="external-link" label={LINK_NAMES[i]} onPress={() => { openUrl(u); }} />)}
  </View>;
}

function TopList(props: { title: string; items: Named[] }): i32 {
  return <View className="grow basis-0 flex-col gap-1 min-w-0">
    <Text className={`text-[12px] font-semibold ${fg(MUTED)}`}>{props.title}</Text>
    {props.items.length === 0 ? <Text className={`text-[12px] ${fg(FAINT)}`}>Last.fm lists none</Text> : <View />}
    {props.items.map((n: Named) => <Text className={`text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{n.name}</Text>)}
  </View>;
}

function Detail(props: { d: Discovery }): i32 {
  return <View className="flex-col gap-3 pl-[42] pr-4 pb-4">
    {top() !== null ? <View className="flex-row gap-6">
        <TopList title="Top albums" items={(top() as ArtistTop).albums} />
        <TopList title="Top songs" items={(top() as ArtistTop).tracks} />
      </View>
      : topError() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{topError()}</Text>
      : <Text className={`text-[12px] ${fg(MUTED)}`}>Asking Last.fm…</Text>}
    <Links name={top() !== null ? (top() as ArtistTop).name : props.d.name} />
  </View>;
}

function Row(props: { d: Discovery; i: i32 }): i32 {
  const d = props.d;
  const on = (): boolean => opened() === d.key;
  return <View className={`flex-col rounded-[10] ${on() ? `border ${bg(CARD)} ${bd(BORDER)}` : ''}`}>
    <View className={`flex-row items-center gap-3 px-4 py-2.5 rounded-[10] cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => open(d)}>
      <Text className={`w-[22] text-[15px] font-bold ${fg(ACCENT)}`}>{`${props.i + 1}`}</Text>
      <View className="grow basis-0 flex-col min-w-0">
        <Text className={`text-[14px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{on() && top() !== null ? (top() as ArtistTop).name : d.name}</Text>
        <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{becauseLine(d.because)}</Text>
      </View>
      <Icon name={on() ? 'chevron-down' : 'chevron-right'} size={16} color={() => color(FAINT)} strokeWidth={2} />
    </View>
    {on() ? <Detail d={d} /> : <View />}
  </View>;
}

function AwayRow(props: { r: Ranked }): i32 {
  return <View className={`flex-row items-center gap-3 px-4 py-2 border-b ${bd(BORDER)}`}>
    <View className="grow basis-0 flex-col min-w-0">
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{props.r.artist}</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`}>{count(props.r.plays, 'listen', 'listens')}</Text>
    </View>
    <Links name={props.r.artist} />
  </View>;
}

function Note(props: { text: string; button: string; onPress: () => void }): i32 {
  return <View className={`flex-row items-center gap-4 px-5 py-4 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
    <Text className={`grow basis-0 text-[13px] ${fg(MUTED)}`}>{props.text}</Text>
    <Button icon="arrow-right" label={props.button} onPress={props.onPress} />
  </View>;
}

export function DiscoverPage(): i32 {
  const f = (): Found => found();
  return <ScrollView className="grow" scrollKey={scrollKey('discover')}>
    <View className="flex-col gap-4 px-10 pt-6 pb-10">
      <View className="flex-col gap-1">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Discover</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>Artists close to what you listen to that are not on this iPod</Text>
      </View>
      {f().heard === 0 ? <Note text="No listening history yet. Import your Last.fm or ListenBrainz history in Settings: discoveries follow what you play." button="Import in Settings" onPress={() => showPage(PAGE_SETTINGS)} />
        : f().graph === 0 ? <Note text={loadConfig().lastfmKey === '' ? 'Similar artists come from Last.fm: add an API key in Settings.' : 'Similar artists are not fetched from Last.fm yet.'}
            button={loadConfig().lastfmKey === '' ? 'Open Settings' : 'Fetch them'} onPress={() => { if (loadConfig().lastfmKey === '') showPage(PAGE_SETTINGS); else fetchArtistsNow(); }} />
        : <View className="flex-col gap-1">
            {f().list.length === 0 ? <Text className={`text-[13px] ${fg(MUTED)}`}>Every similar artist is on this iPod already.</Text> : <View />}
            {f().list.map((d: Discovery, i: i32) => <Row d={d} i={i} />)}
          </View>}
      {f().away.length > 0 ? <View className="flex-col gap-1 pt-4">
          <Text className={`text-[18px] font-bold ${fg(TEXT)}`}>In your history, not on this iPod</Text>
          <Text className={`text-[13px] pb-2 ${fg(MUTED)}`}>Artists you listen to elsewhere, most played first</Text>
          {f().away.map((r: Ranked) => <AwayRow r={r} />)}
        </View> : <View />}
    </View>
  </ScrollView>;
}
