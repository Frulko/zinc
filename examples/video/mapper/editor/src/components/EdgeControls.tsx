// The soft edge of one side of a layer, for light that spills past a real edge: a hard cut, then a gradient inside, outside or across it. It follows the warp.
import { Tabs } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { currentLayer, numbers, setLayer } from '../state';
import { Row, ValueSlider } from './Field';
import { MODE_EDGES, currentEdge, outputMode } from './OutputCanvas';

const SIDE_NAMES: string[] = ['left', 'right', 'top', 'bottom'];
const DIRECTIONS: string[] = ['Inside', 'Outside', 'Both'];
const CURVE_INDEX: i32 = 4;
const MAX_CUT = 0.25, MAX_GRADIENT = 0.5, MIN_CURVE = 0.4, MAX_CURVE = 3;

export function EdgeControls(): i32 {
  const layer = currentLayer();
  const side = currentEdge();
  if (outputMode() !== MODE_EDGES || layer === null || side < 0) return <View />;
  const edge = numbers(layer, 'edge'), inset = numbers(layer, 'inset'), direction = numbers(layer, 'edgedir');
  const [fade, setFade] = createSignal<i32>(direction[side] as i32);
  return <View className="max-w-[560] gap-1">
    <Text className="text-xs text-zinc-300">{`Soft edge, ${SIDE_NAMES[side]} side. Red: where the cut ends. Blue: where the gradient ends.`}</Text>
    <Tabs items={DIRECTIONS} selected={fade} onSelect={(i: i32) => {
      setFade(i);
      direction[side] = i;
      setLayer('edgedir', direction);
    }} />
    <Row label="cut">
      <ValueSlider min={0} max={MAX_CUT} read={() => inset[side]} write={(v: number) => {
        inset[side] = v;
        setLayer('inset', inset);
      }} />
    </Row>
    <Row label="gradient">
      <ValueSlider min={0} max={MAX_GRADIENT} read={() => edge[side]} write={(v: number) => {
        edge[side] = v;
        setLayer('edge', edge);
      }} />
    </Row>
    <Row label="curve">
      <ValueSlider min={MIN_CURVE} max={MAX_CURVE} read={() => edge[CURVE_INDEX]} write={(v: number) => {
        edge[CURVE_INDEX] = v;
        setLayer('edge', edge);
      }} />
    </Row>
  </View>;
}
