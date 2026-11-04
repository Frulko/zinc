// The soft edge of one side of a layer, for light that spills past a real edge: a gradient from the edge inward, outward or both, and a cut: inward it hides the start, outward it brings the far end back. It follows the warp.
import { Tabs } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { currentLayer, numbers, setLayer, touch } from '../state';
import { IconButton, Row, ValueSlider } from './Field';
import { MODE_EDGES, currentEdge, outputMode } from './OutputCanvas';

const SIDE_NAMES: string[] = ['left', 'right', 'top', 'bottom'];
const DIRECTIONS: string[] = ['Inside', 'Outside', 'Both'];
const CURVE_INDEX: i32 = 4;
const MAX_CUT = 0.25, MAX_GRADIENT = 0.5, MIN_CURVE = 0.4, MAX_CURVE = 3;
const MAX_OFFSET = 0.1, OFFSET_STEP = 0.001;

function percent(value: number): string {
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} %`;
}

export function EdgeControls(): i32 {
  const layer = currentLayer();
  const side = currentEdge();
  if (outputMode() !== MODE_EDGES || layer === null || side < 0) return <View />;
  const edge = numbers(layer, 'edge'), inset = numbers(layer, 'inset'), direction = numbers(layer, 'edgedir'), offset = numbers(layer, 'edgeoffset');
  const [shift, setShift] = createSignal<number>(offset[side]);
  const [fade, setFade] = createSignal<i32>(direction[side] as i32);
  return <View className="max-w-[560] gap-1">
    <Text className="text-xs text-zinc-300">{`Soft edge, ${SIDE_NAMES[side]} side. Blue: where the gradient ends. Red: where the cut puts its end, or hides up to.`}</Text>
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
    <Row label="offset">
      <View className="flex-row items-center gap-2">
        <View className="w-0 grow"><ValueSlider min={-MAX_OFFSET} max={MAX_OFFSET} step={OFFSET_STEP} read={() => offset[side]} write={(v: number) => {
          offset[side] = v;
          setShift(v);
          setLayer('edgeoffset', offset);
        }} /></View>
        <Text className="text-xs text-zinc-300 w-[52]">{percent(shift())}</Text>
        <IconButton icon="rotate-ccw" onClick={() => {
          offset[side] = 0;
          setLayer('edgeoffset', offset);
          touch();
        }} />
      </View>
    </Row>
    <Row label="curve">
      <ValueSlider min={MIN_CURVE} max={MAX_CURVE} read={() => edge[CURVE_INDEX]} write={(v: number) => {
        edge[CURVE_INDEX] = v;
        setLayer('edge', edge);
      }} />
    </Row>
  </View>;
}
