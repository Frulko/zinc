// The grid, as in Resolume and Millumin: a row per layer, top layer first, a column per moment of the show. A click on a clip plays it on its layer, a second click stops it,
// a column's title plays the whole column or stops it, an empty column stops everything, a layer's x empties it. Clips arrive by a drag from the library, or by a click with a tile armed.
import { Icon } from 'zinc:icons';
import { Button, ResizeHandle, Switch, theme } from 'zinc:ui/kit';
import * as dnd from 'zinc:ui/dnd';
import { createNodeRef, createSignal, onCleanup, onMount } from 'zinc:ui/solid';
import { Clip, Column, clipFrom, columnIsEmpty, isEmptyClip } from '../model/clips';
import { send } from '../services/link';
import { PANEL_GRID, afterLayerChange, clipAt, fireCell, fireColumn, holdPanels, isPlaying, moveClip, numbers, panelSize, placeClip, removeClip, resizePanel, selectLayer, showClip, stopAll, stopLayer, store, touch, word } from '../state';
import { ClipThumb } from './ClipThumb';
import { IconButton, ValueSlider } from './Field';
import { Rebuilt } from './Rebuilt';
import { tr } from '../i18n';

const [dropCell, setDropCell] = createSignal('');
const [ghost, setGhost] = createSignal<number[]>([]);   // x, y of the tile being dragged
const [ghostLabel, setGhostLabel] = createSignal('');
const [dragged, setDragged] = createSignal('');         // what the drag carries, '' with no drag
const X_ICON: i32 = 0xf4f4f5, PLAYING_ICON: i32 = 0x34d399;
const GHOST_OFFSET = 12;
const MIN_GRID = 70, MAX_GRID = 640;

function cellKey(column: i32, layer: i32): string { return `${column}:${layer}`; }

// What a drag carries: `cell:<column>:<layer>` from the grid, a clip as JSON from the library. A drop target's data is its cellKey.
const FROM_CELL = 'cell:';

function cellOfKey(key: string): i32[] { return key.split(':').map((part: string): i32 => parseInt(part) as i32); }

function draggedClip(data: string): Clip {
  if (!data.startsWith(FROM_CELL)) return clipFrom(JSON.parse(data));
  const from = cellOfKey(data.slice(FROM_CELL.length));
  return clipAt(from[0], from[1]);
}

function dropOn(data: string, column: i32, layer: i32): void {
  if (!data.startsWith(FROM_CELL)) {
    placeClip(column, layer, draggedClip(data));
    return;
  }
  const from = cellOfKey(data.slice(FROM_CELL.length));
  moveClip(from[0], from[1], column, layer);
}

dnd.monitor({
  onDragStart: (d: dnd.DragInfo) => {
    holdPanels(true);
    setDragged(d.data as string);
    setGhostLabel(draggedClip(d.data as string).label);
  },
  onDrag: (d: dnd.DragInfo) => { setGhost([d.x + GHOST_OFFSET, d.y + GHOST_OFFSET]); },
  onDrop: (d: dnd.DragInfo) => {
    setGhost([]);
    setDropCell('');
    setDragged('');
    if (d.targets.length > 0) {
      const at = cellOfKey(d.targets[0].data as string);
      dropOn(d.data as string, at[0], at[1]);
    }
    holdPanels(false);
  },
});

function pressCell(column: i32, layer: i32, clip: Clip): void {
  if (!isEmptyClip(store.armed)) {
    placeClip(column, layer, store.armed);   // stays armed: a tile goes in several cells in a row
    return;
  }
  if (isEmptyClip(clip)) {
    if (columnIsEmpty(store.columns[column].cells)) stopAll();
    store.clipColumn = -1;
    selectLayer(layer);
    return;
  }
  if (isPlaying(column, layer)) {
    stopLayer(layer);
    showClip(column, layer);   // stopped, its settings stay in view
    touch();
    return;
  }
  fireCell(column, layer);
}

function pressColumn(index: i32): void {
  if (store.activeColumn === index || columnIsEmpty(store.columns[index].cells)) stopAll();
  else fireColumn(index);
}

function CellBox(props: { column: i32; layer: i32; rowSelected: boolean }): i32 {
  const clip = clipAt(props.column, props.layer);
  const empty = isEmptyClip(clip);
  const playing = !empty && isPlaying(props.column, props.layer);
  const chosen = !empty && store.clipColumn === props.column && store.clipLayer === props.layer;
  const key = cellKey(props.column, props.layer);
  const cell = createNodeRef();
  let offTarget = (): void => {}, offDrag = (): void => {};
  onMount(() => {
    offTarget = dnd.dropTarget(cell.node, { data: key, canDrop: (d: dnd.DragInfo) => d.data !== FROM_CELL + key, onDragEnter: (d: dnd.DragInfo) => { setDropCell(key); }, onDragLeave: (d: dnd.DragInfo) => { if (dropCell() === key) setDropCell(''); } });
    if (!empty) offDrag = dnd.draggable(cell.node, { data: FROM_CELL + key });
  });
  onCleanup(() => { offTarget(); offDrag(); });
  const dragging = (): boolean => dragged() !== '';
  const edge = (): string => dropCell() === key ? `border-${theme().accent}` : dragged() === FROM_CELL + key ? 'border-zinc-500' : dragging() ? 'border-zinc-600' : playing ? 'border-emerald-400' : chosen ? 'border-zinc-100' : 'border-transparent';
  return <View ref={cell} grab="keep" className={`w-[112] h-[63] rounded overflow-hidden border-2 cursor-pointer ${edge()} ${dragged() === FROM_CELL + key ? 'opacity-40' : ''} ${props.rowSelected ? `bg-${theme().accentSoft}` : 'bg-zinc-800'}`}
    onPress={() => pressCell(props.column, props.layer, clip)}>
    {!empty && <ClipThumb clip={clip} className="absolute left-0 top-0 right-0 bottom-0" />}
    {!empty && <Text className="absolute left-0 right-0 bottom-0 px-1 bg-black/60 text-[10px] text-zinc-100" numberOfLines={1}>{clip.label}</Text>}
    {playing && <View className="absolute left-[2] top-[2] w-[18] h-[18] items-center justify-center rounded bg-black/60"><Icon name="play" size={12} color={() => PLAYING_ICON} /></View>}
    {!empty && <View className="absolute right-[2] top-[2] w-[18] h-[18] items-center justify-center rounded bg-black/60 cursor-pointer" role="button" aria-label={tr('mapper.dashboard.removeClip')}
      onPress={() => removeClip(props.column, props.layer)}><Icon name="x" size={12} color={() => X_ICON} /></View>}
    {dropCell() === key && <View className="absolute left-0 top-0 right-0 bottom-0 items-center justify-center bg-zinc-700/60 pointer-events-none">
      <Text className="text-xs text-white">{empty ? tr('mapper.dashboard.dropHere') : tr('mapper.dashboard.replace')}</Text>
    </View>}
  </View>;
}

function LayerHead(props: { layer: i32 }): i32 {
  const layer = store.layers[props.layer];
  const selected = props.layer === store.selected;
  return <View className={`w-[196] h-[63] px-2 justify-center rounded overflow-hidden cursor-pointer ${selected ? `bg-${theme().accentSoft}` : 'bg-zinc-800'}`} onPress={() => selectLayer(props.layer)}>
    <View className="flex-row items-center gap-2">
      <Switch checked={() => numbers(layer, 'visible')[0] > 0} accessibilityLabel={tr('mapper.dashboard.visible')} onChange={(on: boolean) => {
        layer.visible = [on ? 1 : 0];
        send(`/layer/${props.layer}/visible`, [on ? 1 : 0]);
        touch();
      }} />
      <Text className="w-0 grow text-xs text-zinc-100" numberOfLines={1}>{word(layer, 'name')}</Text>
      <IconButton icon="square" onClick={() => stopLayer(props.layer)} />
    </View>
    <ValueSlider min={0} max={1} read={() => numbers(layer, 'opacity')[0]} write={(v: number) => {
      layer.opacity = [v];
      send(`/layer/${props.layer}/opacity`, [v]);
    }} />
  </View>;
}

function rowsTopFirst(): i32[] {
  const rows: i32[] = [];
  for (let layer: i32 = store.layers.length - 1; layer >= 0; layer--) rows.push(layer);
  return rows;
}

function Grid(): i32 {
  const rows = rowsTopFirst();
  const across = createNodeRef();
  let offScroll = (): void => {};
  onMount(() => { offScroll = dnd.autoScroll(across.node); });
  onCleanup(() => { offScroll(); });
  return <View className="flex-row gap-1">
    <View className="gap-1">
      <View className="h-[24]" />
      {rows.map((layer: i32) => <LayerHead layer={layer} />)}
    </View>
    <ScrollView ref={across} className="w-0 grow overflow-x-auto">
      <View className="gap-1">
        <View className="flex-row gap-1">
          {store.columns.map((column: Column, index: i32) => <View className={`w-[112] h-[24] rounded items-center justify-center cursor-pointer ${store.activeColumn === index ? 'bg-emerald-600' : 'bg-zinc-800'}`} onPress={() => pressColumn(index)}>
            <Text className="text-[11px] text-zinc-100">{column.name}</Text>
          </View>)}
        </View>
        {rows.map((layer: i32) => <View className="flex-row gap-1">
          {store.columns.map((column: Column, index: i32) => <CellBox column={index} layer={layer} rowSelected={layer === store.selected} />)}
        </View>)}
      </View>
    </ScrollView>
  </View>;
}

function addLayer(): void {
  send('/add', [], ['pattern', `Layer ${store.layers.length + 1}`]);
  store.selected = store.layers.length as i32;
  afterLayerChange();
}

function moveSelected(delta: i32): void {
  const to: i32 = store.selected + delta;
  if (to < 0 || to >= store.layers.length) return;
  send('/move', [store.selected, to]);
  store.selected = to;
  store.clipColumn = -1;
  afterLayerChange();
}

function removeSelected(): void {
  if (store.selected < 0) return;
  send('/remove', [store.selected]);
  store.selected--;
  store.clipColumn = -1;
  afterLayerChange();
}

function Toolbar(): i32 {
  return <View className="flex-row items-center gap-1">
    <Text className="text-[11px] text-zinc-500 mr-2">{tr('mapper.dashboard.layers')}</Text>
    <IconButton icon="plus" variant="secondary" label={tr('mapper.dashboard.add')} onClick={addLayer} />
    <IconButton icon="arrow-up" variant="secondary" label={tr('mapper.dashboard.up')} onClick={() => moveSelected(1)} />
    <IconButton icon="arrow-down" variant="secondary" label={tr('mapper.dashboard.down')} onClick={() => moveSelected(-1)} />
    <IconButton icon="trash" variant="secondary" label={tr('mapper.dashboard.delete')} onClick={removeSelected} />
    <View className="grow" />
    <Text className="text-[11px] text-zinc-500 mr-2">{tr('mapper.dashboard.hint')}</Text>
    <IconButton icon="square" variant="secondary" label={tr('mapper.dashboard.stopAll')} onClick={stopAll} />
  </View>;
}

export function Dashboard(): i32 {
  const [open, setOpen] = createSignal(true);
  const down = createNodeRef();
  let offScroll = (): void => {};
  onMount(() => { offScroll = dnd.autoScroll(down.node); });
  onCleanup(() => { offScroll(); });
  return <View className="bg-zinc-900">
    {open() && <ResizeHandle after size={() => panelSize(PANEL_GRID)} min={MIN_GRID} max={MAX_GRID} onResize={(px: number) => resizePanel(PANEL_GRID, px)} />}
    <View className="p-2 gap-2">
      <View className="flex-row items-center gap-2">
        <View className="w-0 grow"><Toolbar /></View>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open())}><View className="flex-row items-center gap-1">
          {open() ? <Icon name="chevron-down" size={14} color={() => X_ICON} /> : <Icon name="chevron-up" size={14} color={() => X_ICON} />}
          <Text className="text-xs text-zinc-200">{open() ? tr('mapper.dashboard.hideGrid') : tr('mapper.dashboard.showGrid')}</Text>
        </View></Button>
      </View>
      {open() && <ScrollView ref={down} style={{ height: panelSize(PANEL_GRID) }}><Rebuilt make={Grid} /></ScrollView>}
    </View>
  </View>;
}

/** The tile following the pointer during a drag. */
export function DragGhost(): i32 {
  return <View className="absolute left-0 top-0 right-0 bottom-0 pointer-events-none">
    {ghost().length === 2 && <Text className={`absolute left-[${Math.round(ghost()[0])}] top-[${Math.round(ghost()[1])}] px-2 py-1 rounded bg-orange-600 text-xs text-white pointer-events-none`}>{ghostLabel()}</Text>}
  </View>;
}
