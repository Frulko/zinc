/** @jsxHelpers zinc:ui/kit/host */
import {
  CurveEditor,
  CurveKey,
  GradientEditor,
  GradientStop,
  TimelineEditor,
  TimelineTrack,
  heading,
  theme,
} from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
export function AnimationExample(): i32 {
  const [keys, setKeys] = componentSignal<CurveKey[]>([
    { id: 'start', time: 0, value: 0, mode: 'smooth' },
    { id: 'attack', time: 1, value: 0.85, mode: 'smooth' },
    { id: 'end', time: 4, value: 0.3, mode: 'linear' },
  ]);
  const [stops, setStops] = componentSignal<GradientStop[]>([
    { id: 'black', position: 0, color: '#181818ff' },
    { id: 'white', position: 1, color: '#c8c8c880' },
  ]);
  const [playhead, setPlayhead] = componentSignal(1.5),
    [playing, setPlaying] = componentSignal(false);
  const [tracks, setTracks] = componentSignal<TimelineTrack[]>([
    {
      id: 'audio',
      label: 'Audio clip',
      keys: [],
      clips: [{ id: 'take', start: 0.5, end: 3.5, offset: 0.25, duration: 5, label: 'Studio take' }],
    },
    {
      id: 'locked',
      label: 'Reference',
      keys: [{ id: 'fixed', time: 2, value: 1, mode: 'step' }],
      clips: [],
      locked: true,
    },
  ]);
  const allTracks = (): TimelineTrack[] => {
    const envelope: TimelineTrack = { id: 'curve', label: 'Gain envelope', keys: keys(), clips: [] };
    return [envelope].concat(tracks());
  };
  const changed = (next: TimelineTrack[]): void => {
    const curve = next.find((track: TimelineTrack) => track.id === 'curve');
    if (curve !== undefined) setKeys(curve.keys);
    setTracks(next.filter((track: TimelineTrack) => track.id !== 'curve'));
  };
  return (
    <View className="flex-col gap-6 min-w-0">
      <Text className={heading(3)}>Curve editor</Text>
      <CurveEditor keys={keys} onChange={setKeys} maxTime={4} maxValue={1} snap={0.05} />
      <Text className={heading(3)}>Gradient editor</Text>
      <GradientEditor stops={stops} onChange={setStops} />
      <Text className={heading(3)}>Timeline editor</Text>
      <TimelineEditor
        tracks={allTracks}
        onChange={changed}
        playhead={playhead}
        onPlayheadChange={setPlayhead}
        duration={4}
        snap={0.05}
        height={170}
        onPlayRequest={() => setPlaying(!playing())}
        playing={playing}
      />
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>
        {playing()
          ? 'Play requested — the caller owns playback.'
          : 'The envelope keys above are the timeline keys below.'}
      </Text>
    </View>
  );
}
