// The media on the mapper: send files, play one on the selected layer, arm one for a column cell.
import { Button } from 'zinc:ui/kit';
import { pickMedia } from '../services/files';
import { MediaFile, playOnLayer, removeMedia, sendMedia, store, touch } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';

function size(bytes: number): string {
  return bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

async function pickAndSend(): Promise<void> {
  await sendMedia(await pickMedia());
}

function MediaRow(props: { file: MediaFile }): i32 {
  const name = props.file.name;
  const armed = store.armedMedia === name;
  return <View className={`flex-row items-center gap-1 h-[30] px-1 rounded ${armed ? 'bg-zinc-700' : ''}`}>
    <Text className="text-xs text-zinc-100 grow cursor-pointer" onPress={() => { store.armedMedia = armed ? '' : name; touch(); }}>{name}</Text>
    <Text className="text-[11px] text-zinc-500">{size(props.file.bytes)}</Text>
    <Button size="sm" variant="secondary" label="Play" onClick={() => playOnLayer(name)} />
    <Button size="sm" variant="ghost" label="x" onClick={() => { removeMedia(name); }} />
  </View>;
}

function Rows(): i32 {
  return <View className="gap-1">{store.media.map((file: MediaFile) => <MediaRow file={file} />)}</View>;
}

export function MediaBin(): i32 {
  return <View>
    <Heading text="Media" />
    <Rebuilt make={Rows} />
    <View className="mt-2"><Button size="sm" label="Send files" onClick={() => { pickAndSend(); }} /></View>
    <Text className="text-[11px] text-zinc-500 mt-1">Or drop them on this window. Click a name, then a column cell, to place it there.</Text>
  </View>;
}
