/** @jsxHelpers zinc:ui/kit/host */
import { HexViewer, LevelMeter, Button, heading, theme } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
export function BinaryExample(): i32 {
  const initial: number[] = [];
  for (let i = 0; i < 256; i++) initial.push(i);
  const [bytes, setBytes] = componentSignal(initial),
    [peaks, setPeaks] = componentSignal<number[]>([0.6, 0.25]),
    [sampleId, setSampleId] = componentSignal(0);
  const sample = (values: number[]): void => {
    setPeaks(values);
    setSampleId(sampleId() + 1);
  };
  return (
    <View className="flex-col gap-6 min-w-0">
      <Text className={heading(3)}>Hex viewer</Text>
      <HexViewer label="Editable sample bytes" bytes={bytes} onChange={setBytes} height={220} />
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>
        Arrows and Shift select; hex digits replace nibbles. Cmd/Ctrl+C copies hex; Shift copies ASCII.
      </Text>
      <Text className={heading(3)}>Audio level meter</Text>
      <View className="flex-row flex-wrap gap-6">
        <LevelMeter label="Stereo output" peaks={peaks} sampleId={sampleId} />
        <LevelMeter label="Horizontal output" peaks={peaks} sampleId={sampleId} horizontal={true} segmented={true} />
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Send audio peaks" onClick={() => sample([0.6, 0.25])} />
        <Button label="Send clipping peak" variant="outline" onClick={() => sample([1.2, 0.8])} />
        <Button label="Silence" variant="ghost" onClick={() => sample([0, 0])} />
      </View>
    </View>
  );
}
