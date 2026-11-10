import { Button, theme } from 'zinc:ui/kit';
import { tracks, Track } from '../data';
import { LibraryModel } from '../state';
export function Queue(p: { model: LibraryModel }): i32 {
  const model = p.model;
  return <View className="flex-col gap-3 min-w-0">
    <View className="flex-row items-center justify-between"><Text className={`text-[17px] font-medium text-${theme().foreground}`}>Play queue</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{model.queue().length + ' tracks'}</Text></View>
    {model.queue().map((id: string, index: i32) => <View className={`flex-col gap-1 pb-3 border-b border-${theme().border}`}>
      <Button label={(index + 1) + '. ' + (tracks.find((track: Track) => track.id === id)?.title ?? '')} variant={id === model.currentId() ? 'secondary' : 'ghost'} className="justify-start" onClick={() => model.select(id)} />
      <View className="flex-row gap-1"><Button label="Up" ariaLabel={'Move ' + id + ' up'} size="sm" variant="ghost" disabled={index === 0} onClick={() => model.move(id, -1)} /><Button label="Down" ariaLabel={'Move ' + id + ' down'} size="sm" variant="ghost" disabled={index === model.queue().length - 1} onClick={() => model.move(id, 1)} /><Button label="Remove" ariaLabel={'Remove ' + id + ' from queue'} size="sm" variant="ghost" onClick={() => model.remove(id)} /></View>
    </View>)}
    <Show when={model.queue().length === 0}><Text role="status" className={`text-[13px] text-${theme().mutedForeground}`}>Queue is empty. Add a track from your library.</Text></Show>
  </View>;
}
