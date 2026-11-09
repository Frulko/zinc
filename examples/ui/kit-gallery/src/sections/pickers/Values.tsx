import { createSignal } from 'zinc:ui/solid';
import { RulerSlider, HistogramSlider, Knob, Fader, heading, theme } from 'zinc:ui/kit';
const [ruler, setRuler] = createSignal(42);
const [low, setLow] = createSignal(20);
const [high, setHigh] = createSignal(80);
const [pan, setPan] = createSignal(0);
const [gain, setGain] = createSignal(1);
const [volume, setVolume] = createSignal(-12);
const [balance, setBalance] = createSignal(60);
export function PickerValues(): i32 {
  return <View className="flex-col gap-6">
    <Text className={heading(3)}>Fine control</Text>
    <View className="flex-row flex-wrap gap-8 items-start">
      <View className="flex-col gap-5 w-[320px]">
        <Text className={`text-[13px] text-${theme().foreground}`}>Crop position</Text><RulerSlider accessibilityLabel="Crop position" value={ruler} onChange={setRuler} min={0} max={100} step={1} majorEvery={10} unit=" mm" width={320} />
        <Text className={`text-[13px] text-${theme().foreground}`}>Luminance range</Text><HistogramSlider accessibilityLabel="Luminance" bins={[2, 3, 5, 9, 15, 21, 25, 31, 42, 48, 51, 55, 62, 69, 75, 67, 60, 56, 50, 44, 32, 28, 18, 14, 9, 7, 5, 2]} low={low} high={high} onChange={(first: number, last: number) => { setLow(first); setHigh(last); }} min={0} max={100} />
      </View>
      <Knob label="Pan" value={pan} onChange={setPan} min={-100} max={100} step={1} bipolar={true} reset={0} />
      <Knob label="Gain" value={gain} onChange={setGain} min={0.1} max={10} step={0.1} logarithmic={true} reset={1} unit="×" />
      <Fader label="Monitor" value={volume} onChange={setVolume} min={-60} max={6} step={1} reset={-12} unit=" dB" ticks={[-60, -24, -12, 0, 6]} meter={() => [0.64, 0.48]} length={200} />
      <View className="flex-col gap-5"><Fader label="Mix" value={balance} onChange={setBalance} min={0} max={100} step={1} horizontal={true} unit=" %" length={180} /><Knob label="Locked" value={() => 30} onChange={(value: number) => {}} disabled={true} /></View>
    </View>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Arrows change value · Shift for large key steps or fine knob drags · Home/End reach bounds · Delete resets.</Text>
  </View>;
}
