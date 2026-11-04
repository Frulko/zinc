// The selected layer's settings: what it shows, how a media fits, its sound and its colour.
import { Button, Slider, Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { currentLayer, loadState, numbers, revision, setLayer, setWord, store, touch, word } from '../state';
import { Heading, Row } from './Field';

const SOURCES: string[] = ['pattern', 'solid', 'gradient', 'image'];
const BLENDS: string[] = ['normal', 'add', 'multiply', 'screen'];
const FITS: string[] = ['stretch', 'contain', 'cover'];

interface SliderDef { key: string; index: i32; min: number; max: number; label: string }
function s(key: string, index: i32, min: number, max: number, label: string): SliderDef { return { key, index, min, max, label }; }

const GROUPS: [string, SliderDef[]][] = [
  ['Colour', [s('brightness', 0, -1, 1, 'brightness'), s('contrast', 0, 0, 3, 'contrast'), s('saturation', 0, 0, 3, 'saturation'), s('hue', 0, -180, 180, 'hue'), s('gamma', 0, 0.2, 3, 'gamma'), s('opacity', 0, 0, 1, 'opacity')]],
  ['Transform', [s('position', 0, -1, 1, 'x'), s('position', 1, -1, 1, 'y'), s('scale', 0, 0.1, 3, 'scale'), s('rotation', 0, -180, 180, 'rotation')]],
  ['Crop', [s('crop', 0, 0, 1, 'x0'), s('crop', 1, 0, 1, 'y0'), s('crop', 2, 0, 1, 'x1'), s('crop', 3, 0, 1, 'y1'), s('crop', 4, 0, 0.3, 'feather')]],
  ['Edge blend', [s('edge', 0, 0, 0.5, 'left'), s('edge', 1, 0, 0.5, 'right'), s('edge', 2, 0, 0.5, 'top'), s('edge', 3, 0, 0.5, 'bottom'), s('edge', 4, 1, 3, 'gamma')]],
];

function ValueSlider(props: { layer: any; def: SliderDef }): i32 {
  const values = numbers(props.layer, props.def.key);
  return <Row label={props.def.label}>
    <Slider min={props.def.min} max={props.def.max} step={(props.def.max - props.def.min) / 200} value={() => values[props.def.index]} onChange={(v: number) => {
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

function LayerProps(props: { layer: any }): i32 {
  const layer = props.layer;
  return <View>
    <Heading text="Media" />
    <Row label="file"><Text className="text-xs text-zinc-100">{word(layer, 'media') === '' ? '(none)' : word(layer, 'media')}</Text></Row>
    <Choice label="fit" options={FITS} layer={layer} property="fit" />
    <ValueSlider layer={layer} def={s('volume', 0, 0, 1, 'volume')} />
    <Row label="loop"><Switch checked={() => numbers(layer, 'loop')[0] > 0} onChange={(on: boolean) => { setLayer('loop', [on ? 1 : 0]); touch(); }} /></Row>
    <Heading text="Without a media" />
    <Choice label="source" options={SOURCES} layer={layer} property="source" />
    <Choice label="blend" options={BLENDS} layer={layer} property="blend" />
    <Row label="grid"><Switch checked={() => numbers(layer, 'grid')[0] > 0} onChange={(on: boolean) => { setLayer('grid', [on ? 1 : 0]); touch(); }} /></Row>
    {GROUPS.map((group: [string, SliderDef[]]) => <View>
      <Heading text={group[0]} />
      {group[1].map((def: SliderDef) => <ValueSlider layer={layer} def={def} />)}
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
  return <ScrollView className="w-[300] p-3 bg-zinc-900">
    {revision() >= 0 && <Content />}
  </ScrollView>;
}
