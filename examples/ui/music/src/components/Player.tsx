import { NowPlaying, Slider, Button, theme } from 'zinc:ui/kit';
import { LibraryModel, Playback } from '../state';
export function Player(p: { model: LibraryModel }): i32 {
  const model = p.model;
  return <View className="flex-col gap-4">
    <NowPlaying title={model.current().title} artist={model.current().artist + ' · original local sample'} peaks={model.current().peaks} duration={model.duration()} playing={() => model.state() === Playback.Playing} position={model.position} onPlay={model.play} onSeek={model.seek} onPrevious={() => model.advance(-1)} onNext={() => model.advance(1)} />
    <View className="flex-row items-center gap-3"><Text className={`text-[12px] text-${theme().mutedForeground}`}>Volume</Text><View className="grow min-w-0"><Slider accessibilityLabel="Playback volume" value={model.volume} onChange={model.changeVolume} min={0} max={100} step={1} /></View><Text className={`w-[32px] text-[12px] tabular-nums text-${theme().mutedForeground}`}>{model.volume() + '%'}</Text></View>
    <Button label="Stop playback" variant="outline" size="sm" disabled={model.state() === Playback.Stopped} onClick={model.stop} />
    <Text role="status" className={`text-[12px] text-${model.state() === Playback.Failed ? theme().destructive : theme().mutedForeground}`}>{model.notice()}</Text>
  </View>;
}
