// The inspector speaks of one thing at a time: a clip (how its picture fills the layer, how it plays) or a layer (its place, colour, crop, edges).
import { Button, ResizeHandle, Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { Clip, isEmptyClip } from '../model/clips';
import { INSPECT_CLIP, PANEL_PROPERTIES, clipAt, isPlaying, panelSize, resizePanel, showClip, stopLayer, changeClip, currentLayer, fireCell, loadState, numbers, removeClip, saveShow, selectedClip, setLayer, setWord, setWordQuietly, store, touch, word } from '../state';
import { FrameEditor } from './FrameEditor';
import { Heading, IconButton, IconTabs, Row, ValueSlider } from './Field';
import { Rebuilt } from './Rebuilt';

const MIN_WIDTH = 200, MAX_WIDTH = 620;
const BLENDS: string[] = ['normal', 'add', 'multiply', 'screen'];
const FITS: string[] = ['stretch', 'contain', 'cover', 'width', 'height'];

interface SliderDef { key: string; index: i32; min: number; max: number; label: string }
function s(key: string, index: i32, min: number, max: number, label: string): SliderDef { return { key, index, min, max, label }; }

const GROUPS: [string, SliderDef[]][] = [
  ['Colour', [s('brightness', 0, -1, 1, 'brightness'), s('contrast', 0, 0, 3, 'contrast'), s('saturation', 0, 0, 3, 'saturation'), s('hue', 0, -180, 180, 'hue'), s('gamma', 0, 0.2, 3, 'gamma'), s('opacity', 0, 0, 1, 'opacity')]],
  ['Transform', [s('position', 0, -1, 1, 'x'), s('position', 1, -1, 1, 'y'), s('scale', 0, 0.1, 3, 'scale'), s('rotation', 0, -180, 180, 'rotation')]],
  ['Crop', [s('crop', 0, 0, 1, 'x0'), s('crop', 1, 0, 1, 'y0'), s('crop', 2, 0, 1, 'x1'), s('crop', 3, 0, 1, 'y1'), s('crop', 4, 0, 0.3, 'feather')]],
  ['Edge blend', [s('edge', 0, 0, 0.5, 'left'), s('edge', 1, 0, 0.5, 'right'), s('edge', 2, 0, 0.5, 'top'), s('edge', 3, 0, 0.5, 'bottom'), s('edge', 4, 1, 3, 'gamma')]],
];

function PropSlider(props: { layer: any; def: SliderDef }): i32 {
  const values = numbers(props.layer, props.def.key);
  return <Row label={props.def.label}>
    <ValueSlider min={props.def.min} max={props.def.max} read={() => values[props.def.index]} write={(v: number) => {
      values[props.def.index] = v;
      send(`/layer/${store.selected}/${props.def.key}`, values);
    }} />
  </Row>;
}

function Choice(props: { label: string; options: string[]; layer: any; property: string }): i32 {
  return <Row label={props.label}>
    <View className="flex-row flex-wrap gap-1">
      {props.options.map((option: string) => <Button size="sm" variant={word(props.layer, props.property) === option ? 'default' : 'ghost'} label={option} onClick={() => setWord(props.property, option)} />)}
    </View>
  </Row>;
}

function ClipProps(): i32 {
  const clip = selectedClip();
  if (isEmptyClip(clip)) return <Text className="text-xs text-zinc-500">No clip chosen on this layer: click one in its row of the grid.</Text>;
  const column = store.clipColumn, layer = store.clipLayer;
  const playing = isPlaying(column, layer);
  return <View className="gap-1">
    <Text className="text-sm text-zinc-100" numberOfLines={1}>{clip.label}</Text>
    <Text className="text-[11px] text-zinc-400" numberOfLines={1}>{`Layer ${word(store.layers[layer], 'name')}, ${store.columns[column].name}: ${playing ? 'playing' : 'stopped'}`}</Text>
    {clip.media !== '' && <Heading text="How it fills the layer" />}
    {clip.media !== '' && <View className="flex-row flex-wrap gap-1">
      {FITS.map((fit: string) => <Button size="sm" variant={clip.fit === fit ? 'default' : 'ghost'} label={fit} onClick={() => changeClip((c: Clip) => { c.fit = fit; })} />)}
    </View>}
    {clip.media !== '' && <FrameEditor clip={clip} layer={store.layers[layer]} />}
    {clip.media !== '' && <Heading text="Playback" />}
    {clip.media !== '' && <Row label="loop"><Switch checked={() => clip.loop} onChange={(on: boolean) => changeClip((c: Clip) => { c.loop = on; })} /></Row>}
    <View className="flex-row flex-wrap gap-1 mt-2">
      <IconButton icon={playing ? 'square' : 'play'} variant="secondary" label={playing ? 'Stop' : 'Play'} onClick={() => { if (playing) stopLayer(layer); else fireCell(column, layer); }} />
      <IconButton icon="trash" label="Remove from the grid" onClick={() => removeClip(column, layer)} />
    </View>
  </View>;
}

function playsNow(index: i32): string {
  const column = index < store.playing.length ? store.playing[index] : -1;
  return column < 0 ? 'Plays nothing from the grid.' : `Plays ${clipAt(column, index).label}, ${store.columns[column].name}.`;
}

function renameLayer(layer: any, name: string): void {
  const old = word(layer, 'name');
  for (const link of store.links) {
    if (link.a === old) link.a = name;
    if (link.b === old) link.b = name;
  }
  if (store.surfaces[old] !== undefined) {
    store.surfaces[name] = store.surfaces[old];
    store.surfaces[old] = null;
  }
  setWordQuietly('name', name);
  saveShow();
}

function LayerProps(props: { layer: any }): i32 {
  const layer = props.layer;
  return <View>
    <Text className="text-[11px] text-zinc-400 mb-1" numberOfLines={1}>{playsNow(store.selected)}</Text>
    <Row label="name"><Input className="h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label="layer name" value={word(layer, 'name')} onChange={(text: string) => {
      if (text !== '') renameLayer(layer, text);
    }} /></Row>
    <PropSlider layer={layer} def={s('volume', 0, 0, 1, 'volume')} />
    <Choice label="blend" options={BLENDS} layer={layer} property="blend" />
    <Row label="grid"><Switch checked={() => numbers(layer, 'grid')[0] > 0} onChange={(on: boolean) => { setLayer('grid', [on ? 1 : 0]); touch(); }} /></Row>
    {GROUPS.map((group: [string, SliderDef[]]) => <View>
      <Heading text={group[0]} />
      {group[1].map((def: SliderDef) => <PropSlider layer={layer} def={def} />)}
    </View>)}
    <View className="mt-3"><IconButton icon="rotate-ccw" variant="secondary" label="Reset layer" onClick={() => {
      send(`/layer/${store.selected}/reset`, []);
      loadState();
    }} /></View>
  </View>;
}

/** A clip shown while its layer plays one: the tab goes to what plays there. */
function inspect(tab: i32): void {
  store.inspecting = tab;
  const column = store.selected < store.playing.length ? store.playing[store.selected] : -1;
  if (tab === INSPECT_CLIP && store.clipColumn < 0 && column >= 0) showClip(column, store.selected);
  touch();
}

function Content(): i32 {
  const layer = currentLayer();
  if (layer === null) return <Text className="text-xs text-zinc-500">No layer yet: add one.</Text>;
  return <View className="gap-3">
    <IconTabs items={['Clip', `Layer ${word(layer, 'name')}`]} icons={['film', 'layers']} selected={() => store.inspecting} onSelect={inspect} />
    {store.inspecting === INSPECT_CLIP ? <ClipProps /> : <LayerProps layer={layer} />}
  </View>;
}

export function PropsPanel(): i32 {
  return <View className="flex-row">
    <ResizeHandle vertical after size={() => panelSize(PANEL_PROPERTIES)} min={MIN_WIDTH} max={MAX_WIDTH} onResize={(px: number) => resizePanel(PANEL_PROPERTIES, px)} />
    <ScrollView className="p-3 bg-zinc-900" style={{ width: panelSize(PANEL_PROPERTIES) }}>
      <Rebuilt make={Content} />
    </ScrollView>
  </View>;
}
