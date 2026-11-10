import { Button, List, ListItem, theme } from 'zinc:ui/kit';
import { Track } from '../data';
import { LibraryModel } from '../state';
import { Cover } from './Cover';
export function Library(p: { model: LibraryModel }): i32 {
  const model = p.model;
  return <View className="flex-col gap-6 min-w-0">
    <View className="flex-row flex-wrap gap-4">
      {model.visible().map((track: Track) => <View className="flex-col gap-2 w-[140px]">
        <Button variant="ghost" ariaLabel={'Select ' + track.title} className="p-0 w-[140px] h-[140px]" onClick={() => model.select(track.id)}><Cover art={track.art} size={140} /></Button>
        <Text className={`text-[13px] font-medium text-${theme().foreground}`}>{track.title}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{track.collection}</Text>
      </View>)}
    </View>
    <List>{model.visible().map((track: Track) => <ListItem title={track.title} description={track.artist + ' · ' + track.collection} selected={() => model.currentId() === track.id} onClick={() => model.select(track.id)} leading={() => <Cover art={track.art} size={36} />}>
      <Button label={model.queue().indexOf(track.id) >= 0 ? 'Queued' : 'Add'} ariaLabel={'Add ' + track.title + ' to queue'} size="sm" variant="ghost" disabled={model.queue().indexOf(track.id) >= 0} onClick={() => model.enqueue(track.id)} />
    </ListItem>)}</List>
    <Show when={model.visible().length === 0}><Text role="status" className={`py-6 text-[13px] text-${theme().mutedForeground}`}>No tracks found. Try a title or collection name.</Text></Show>
  </View>;
}
