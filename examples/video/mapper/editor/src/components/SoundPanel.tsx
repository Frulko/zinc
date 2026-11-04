// The mixer: the master volume of the mapper, and each layer's. The media of a layer goes on sounding when the layer is hidden.
import { Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { numbers, store, touch, word } from '../state';
import { Heading, Row, ValueSlider } from './Field';
import { Rebuilt } from './Rebuilt';
import { tr } from '../i18n';

const VOLUME_STEP = 0.01;

function Master(): i32 {
  return <View className="gap-1">
    <Row label={tr('mapper.sound.master')}>
      <ValueSlider min={0} max={1} step={VOLUME_STEP} read={() => store.masterVolume} write={(v: number) => {
        store.masterVolume = v;
        send('/volume', [v]);
      }} />
    </Row>
    <Row label={tr('mapper.sound.mute')}>
      <Switch checked={() => store.muted} onChange={(on: boolean) => {
        store.muted = on;
        send('/mute', [on ? 1 : 0]);
        touch();
      }} />
    </Row>
  </View>;
}

function LayerVolume(props: { index: i32 }): i32 {
  const layer = store.layers[props.index];
  const media = word(layer, 'media');
  return <View className="gap-1 mt-1">
    <Text className="text-xs text-zinc-300">{media === '' ? tr('mapper.sound.silent', ['index', `${props.index}`, 'name', word(layer, 'name')]) : tr('mapper.sound.layer', ['index', `${props.index}`, 'name', word(layer, 'name'), 'media', media])}</Text>
    <Row label={tr('mapper.sound.volume')}>
      <ValueSlider min={0} max={1} step={VOLUME_STEP} read={() => numbers(layer, 'volume')[0]} write={(v: number) => {
        layer.volume = [v];
        send(`/layer/${props.index}/volume`, [v]);
      }} />
    </Row>
  </View>;
}

function Mixer(): i32 {
  return <View className="max-w-[560]">
    {!store.playsMedia && <Text className="text-xs text-amber-400 mb-1">{tr('mapper.sound.noSound')}</Text>}
    <Heading text={tr('mapper.sound.masterHeading')} />
    <Master />
    <Heading text={tr('mapper.sound.layersHeading')} />
    {store.layers.map((layer: any, index: i32) => <LayerVolume index={index} />)}
    <Text className="text-[11px] text-zinc-500 mt-3">{tr('mapper.sound.hint')}</Text>
  </View>;
}

export function SoundPanel(): i32 {
  return <View className="p-3">
    <Rebuilt make={Mixer} />
  </View>;
}
