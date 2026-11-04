// The selected layer's settings: what it shows, how a media fits, its sound and its colour.
import { Button, ResizeHandle, Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { Clip, isEmptyClip } from '../model/clips';
import { PANEL_PROPERTIES, panelSize, resizePanel, changeClip, currentLayer, fireCell, loadState, numbers, removeClip, saveShow, selectedClip, setLayer, setWord, setWordQuietly, store, touch, word } from '../state';
import { FrameEditor } from './FrameEditor';
import { Heading, Row, ValueSlider } from './Field';
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
  if (isEmptyClip(clip)) return <Text className="text-[11px] text-zinc-500">Click a clip in the grid: it plays, and its settings show here.</Text>;
  const column = store.clipColumn, layer = store.clipLayer;
  return <View className="gap-1">
    <Row label="name"><Text className="text-xs text-zinc-100" numberOfLines={1}>{clip.label}</Text></Row>
    {clip.media !== '' && <Row label="fit">
      <View className="flex-row flex-wrap gap-1">
        {FITS.map((fit: string) => <Button size="sm" variant={clip.fit === fit ? 'default' : 'ghost'} label={fit} onClick={() => changeClip((c: Clip) => { c.fit = fit; })} />)}
      </View>
    </Row>}
    {clip.media !== '' && <FrameEditor clip={clip} layer={store.layers[layer]} />}
    {clip.media !== '' && <Row label="loop"><Switch checked={() => clip.loop} onChange={(on: boolean) => changeClip((c: Clip) => { c.loop = on; })} /></Row>}
    <View className="flex-row gap-1 mt-1">
      <Button size="sm" variant="secondary" label="Play" onClick={() => fireCell(column, layer)} />
      <Button size="sm" variant="ghost" label="Remove from the grid" onClick={() => removeClip(column, layer)} />
    </View>
  </View>;
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
    <Heading text="Clip" />
    <ClipProps />
    <Heading text="Layer" />
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
    <View className="mt-3"><Button size="sm" variant="secondary" label="Reset layer" onClick={() => {
      send(`/layer/${store.selected}/reset`, []);
      loadState();
    }} /></View>
  </View>;
}

function Content(): i32 {
  const layer = currentLayer();
  return layer === null ? <Text className="text-xs text-zinc-500">No layer yet: add one.</Text> : <LayerProps layer={layer} />;
}

export function PropsPanel(): i32 {
  return <View className="flex-row">
    <ResizeHandle vertical after size={() => panelSize(PANEL_PROPERTIES)} min={MIN_WIDTH} max={MAX_WIDTH} onResize={(px: number) => resizePanel(PANEL_PROPERTIES, px)} />
    <ScrollView className="p-3 bg-zinc-900" style={{ width: panelSize(PANEL_PROPERTIES) }}>
      <Rebuilt make={Content} />
    </ScrollView>
  </View>;
}
