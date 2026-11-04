// The library: what can go in the grid, the media on the mapper and its sources. Drag a tile onto a cell, or click it and then click cells.
import { Button, ResizeHandle } from 'zinc:ui/kit';
import * as dnd from 'zinc:ui/dnd';
import { createNodeRef, onCleanup, onMount } from 'zinc:ui/solid';
import { Clip, EMPTY_CLIP, isEmptyClip } from '../model/clips';
import { pickFolder, pickMedia } from '../services/files';
import { sendFiles } from '../transfers';
import { MediaFile, PANEL_LIBRARY, panelSize, removeMedia, resizePanel, store, touch } from '../state';
import { ClipThumb } from './ClipThumb';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';

const MIN_WIDTH = 140, MAX_WIDTH = 560;

function source(label: string, kind: string, color: number[]): Clip { return { ...EMPTY_CLIP, label, source: kind, color }; }

const SOURCES: Clip[] = [
  source('Test pattern', 'pattern', []),
  source('Gradient', 'gradient', [1, 1, 1]),
  source('White', 'solid', [1, 1, 1]),
  source('Red', 'solid', [1, 0, 0]),
  source('Green', 'solid', [0, 1, 0]),
  source('Blue', 'solid', [0, 0, 1]),
];

function size(bytes: number): string {
  return bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

async function pickAndSend(): Promise<void> { sendFiles(await pickMedia()); }

async function pickFolderAndSend(): Promise<void> { sendFiles(await pickFolder()); }

function sameClip(a: Clip, b: Clip): boolean { return a.media === b.media && a.label === b.label && a.source === b.source; }

function Tile(props: { clip: Clip; detail: string }): i32 {
  const tile = createNodeRef();
  const armed = !isEmptyClip(store.armed) && sameClip(store.armed, props.clip);
  let off = (): void => {};
  onMount(() => { off = dnd.draggable(tile.node, { data: JSON.stringify(props.clip) }); });
  onCleanup(() => { off(); });
  return <View ref={tile} className={`w-[104] rounded overflow-hidden cursor-pointer bg-zinc-800 ${armed ? 'border-2 border-orange-500' : 'border-2 border-zinc-800'}`} grab="keep"
    onPress={() => { store.armed = armed ? EMPTY_CLIP : props.clip; touch(); }}>
    <ClipThumb clip={props.clip} className="w-full h-[56]" />
    <Text className="px-1 text-[11px] text-zinc-100" numberOfLines={1}>{props.clip.label}</Text>
    <Text className="px-1 text-[10px] text-zinc-500" numberOfLines={1}>{props.detail}</Text>
  </View>;
}

function MediaTiles(): i32 {
  const armed = store.armed.media;
  return <View className="gap-2">
    {store.media.length === 0 && <Text className="text-[11px] text-zinc-500">Nothing on the mapper yet.</Text>}
    <View className="flex-row flex-wrap gap-2">
      {store.media.map((file: MediaFile) => <Tile clip={{ ...EMPTY_CLIP, label: file.name, media: file.name }} detail={size(file.bytes)} />)}
    </View>
    {armed !== '' && <Button size="sm" variant="ghost" label={`Delete ${armed}`} onClick={() => { removeMedia(armed); }} />}
  </View>;
}

function SourceTiles(): i32 {
  return <View className="flex-row flex-wrap gap-2">{SOURCES.map((clip: Clip) => <Tile clip={clip} detail="source" />)}</View>;
}

export function Library(): i32 {
  return <View className="flex-row"><ScrollView className="p-3 bg-zinc-900 gap-1" style={{ width: panelSize(PANEL_LIBRARY) }}>
    <Heading text="Media" />
    <Rebuilt make={MediaTiles} />
    <View className="mt-2 flex-row flex-wrap gap-1">
      <Button size="sm" label="Send files" onClick={() => { pickAndSend(); }} />
      <Button size="sm" variant="secondary" label="Send a folder" onClick={() => { pickFolderAndSend(); }} />
    </View>
    <Text className="text-[11px] text-zinc-500 mt-1">Or drop them on this window: they play on the selected layer.</Text>
    <Heading text="Sources" />
    <Rebuilt make={SourceTiles} />
    <Text className="text-[11px] text-zinc-500 mt-2">Drag a tile onto a cell of the grid, or click it and then click cells.</Text>
  </ScrollView>
  <ResizeHandle vertical size={() => panelSize(PANEL_LIBRARY)} min={MIN_WIDTH} max={MAX_WIDTH} onResize={(px: number) => resizePanel(PANEL_LIBRARY, px)} /></View>;
}
