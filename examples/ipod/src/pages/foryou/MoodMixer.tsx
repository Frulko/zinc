// The mood mixer of For you: a mood chip (Chill, Focus, Party, Workout, Melancholy, Happy) sets the energy and tempo bars, and the list
// (services/moods.ts) is made again at each click. Play plays it; Open shows it as a draft on the Playlists page (Play, Save to iPod).
// Without AudioMuse's analysis the list comes from the genres and the BPM only, the energy bar is hidden and the line says so. While
// Genius' model is built (drafts.ts, a slice at a time) a turning ring says the songs are being picked.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { createSignal, createMemo } from 'zinc:ui/solid';
import { openPlaylist } from '../../state';
import { MOODS, Mood, moodMix } from '../../services/moods';
import { Draft, currentModel, modelWorking, keepDrafts, play } from '../../drafts';
import { Working } from '../../components/Working';
import { Button } from '../../components/Button';
import { count } from '../../format';
import { bg, bd, fg, CARD, BORDER, HOVER, TEXT, MUTED, ACCENT, TRACK } from '../../constants';

const BAR_WIDTH: i32 = 160;
const TEMPO_MIN = 60, TEMPO_MAX = 180;
const PREFIX = 'draft:mood:';

const [mood, setMood] = createSignal<Mood>(MOODS[0]);
const [energy, setEnergy] = createSignal<number>(MOODS[0].energy);
const [tempo, setTempo] = createSignal<number>(MOODS[0].tempo);

class Mixed { d: Draft = new Draft(); deep: boolean = false; }

const mixed = createMemo<Mixed>(() => {
  const out = new Mixed(), m = currentModel();
  out.d.id = `${PREFIX}${mood().id}`;
  out.d.name = `${mood().name} mix`;
  if (m === null) return out;
  const mx = moodMix(m, mood(), energy(), tempo());
  out.d.tracks = mx.tracks; out.deep = mx.deep;
  return out;
}, new Mixed());

function Chip(props: { m: Mood }): i32 {
  const on = mood().id === props.m.id;
  return <View className={`px-3 h-[26] rounded-full items-center justify-center border cursor-pointer ${on ? `${bg(ACCENT)} ${bd(ACCENT)}` : `${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { setMood(props.m); setEnergy(props.m.energy); setTempo(props.m.tempo); }}>
    <Text className={`text-[12px] font-semibold ${on ? 'text-white' : fg(TEXT)}`}>{props.m.name}</Text>
  </View>;
}

/** A bar clicked where the value goes (as the volume bar), its label and value beside it. */
function Bar(props: { label: string; value: string; at: number; set: (x: number) => void }): i32 {
  return <View className="flex-row items-center gap-2">
    <Text className={`w-[52] text-[12px] ${fg(MUTED)}`}>{props.label}</Text>
    <View className={`h-[6] rounded-full overflow-hidden cursor-pointer ${bg(TRACK)}`} style={{ width: BAR_WIDTH }}
      onPointerDown={(e: ui.PointerEvent) => props.set(Math.max(0, Math.min(1, e.x / BAR_WIDTH)))}>
      <View className={`h-full ${bg(ACCENT)}`} style={{ width: Math.round(props.at * BAR_WIDTH) }} />
    </View>
    <Text className={`w-[64] text-[12px] ${fg(TEXT)}`}>{props.value}</Text>
  </View>;
}

function Body(props: { mx: Mixed }): i32 {
  const mx = props.mx, d = mx.d;
  const shown = d.tracks.slice(0, 4).map((t: ipod.Track) => t.title).join(', ');
  return <View className={`flex-col gap-3 mx-10 mb-6 px-5 py-4 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
    <Text className={`text-[19px] font-bold ${fg(TEXT)}`}>Mood mixer</Text>
    <View className="flex-row flex-wrap gap-2">{MOODS.map((m: Mood) => <Chip m={m} />)}</View>
    <View className="flex-row flex-wrap items-center gap-6">
      {mx.deep ? <Bar label="Energy" value={`${Math.round(energy() * 100)}%`} at={energy()} set={(x: number) => setEnergy(x)} /> : null}
      <Bar label="Tempo" value={`${Math.round(tempo())} BPM`} at={(tempo() - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN)}
        set={(x: number) => setTempo(Math.round(TEMPO_MIN + x * (TEMPO_MAX - TEMPO_MIN)))} />
    </View>
    <View className="flex-row items-center gap-3">
      <View className="grow basis-0 min-w-0 flex-col">
        {d.tracks.length === 0 && modelWorking() ? <Working text={`Picking the ${d.name}…`} />
          : <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>
          {d.tracks.length === 0 ? 'No songs for this mood yet' : `${d.name} · ${count(d.tracks.length, 'song', 'songs')}: ${shown}…`}</Text>}
        <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={2}>{mx.deep ? 'By the moods, energy and tempo AudioMuse found in each song'
          : 'Without AudioMuse’s analysis: by genre and BPM only (Settings › Recommendations connects it)'}</Text>
      </View>
      <Button icon="play" label="Play" accent={true} disabled={d.tracks.length === 0} onPress={() => play(d)} />
      <Button icon="list-music" label="Open" disabled={d.tracks.length === 0} onPress={() => { keepDrafts(PREFIX, [d]); openPlaylist(d.id); }} />
    </View>
  </View>;
}

/** Made again with its list whenever the mood, a bar, the iPod, the history or AudioMuse's results change. */
export function MoodMixer(): i32 {
  return <View className="flex-col">{[mixed()].map((mx: Mixed) => <Body mx={mx} />)}</View>;
}
