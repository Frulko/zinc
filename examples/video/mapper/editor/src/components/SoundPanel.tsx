// The mixer: the master volume of the mapper, and each layer's. The media of a layer goes on sounding when the layer is hidden.
import { Slider, Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { numbers, store, touch, word } from '../state';
import { Heading, Row } from './Field';
import { Rebuilt } from './Rebuilt';

const VOLUME_STEP = 0.01;

function Master(): i32 {
  return <View className="gap-1">
    <Row label="master">
      <Slider min={0} max={1} step={VOLUME_STEP} value={() => store.masterVolume} onChange={(v: number) => {
        store.masterVolume = v;
        send('/volume', [v]);
      }} />
    </Row>
    <Row label="mute">
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
    <Text className="text-xs text-zinc-300">{`${props.index}. ${word(layer, 'name')}: ${media === '' ? 'no media, no sound' : media}`}</Text>
    <Row label="volume">
      <Slider min={0} max={1} step={VOLUME_STEP} value={() => numbers(layer, 'volume')[0]} onChange={(v: number) => {
        layer.volume = [v];
        send(`/layer/${props.index}/volume`, [v]);
      }} />
    </Row>
  </View>;
}

function Mixer(): i32 {
  return <View className="max-w-[560]">
    {!store.playsMedia && <Text className="text-xs text-amber-400 mb-1">This mapper's layers have no sound yet: only Android plays it.</Text>}
    <Heading text="Master" />
    <Master />
    <Heading text="Layers" />
    {store.layers.map((layer: any, index: i32) => <LayerVolume index={index} />)}
    <Text className="text-[11px] text-zinc-500 mt-3">The sound leaves by the device's own output: its speaker, or what is plugged into it. The device's volume keys set the level above this mixer.</Text>
  </View>;
}

export function SoundPanel(): i32 {
  return <View className="p-3">
    <Rebuilt make={Mixer} />
  </View>;
}
