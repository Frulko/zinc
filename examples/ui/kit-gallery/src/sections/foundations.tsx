import { createSignal } from 'zinc:ui/solid';
import { CallStats, ResizeHandle, heading, captionText, theme } from 'zinc:ui/kit';
import { FormExample } from '../foundations/FormExample';
import { KeyboardExample } from '../foundations/KeyboardExample';
import { ZoomExample } from '../foundations/ZoomExample';

export function FoundationsSection(): i32 {
  const [height, setHeight] = createSignal(96);
  const unavailable = { quality: 'unknown', mos: 0, lossPct: 0, rttMs: -1, jitterMs: 0, sendKbps: 0, recvKbps: 0 };
  return <View className="flex-col gap-8 min-w-0">
    <Text className={heading(3)}>Foundations</Text>
    <FormExample />
    <View className="flex-col gap-3 w-full max-w-[420px]">
      <Text className={heading(4)}>Resizable panes</Text>
      <Text className={captionText()}>Drag the divider, or focus it and use arrows, Home or End.</Text>
      <View className={`border border-${theme().border} rounded-[18px] overflow-hidden flex-col h-[240px]`}>
        <View className={`h-[${height()}px] shrink-0 p-4 bg-${theme().card}`}><Text className={captionText()}>Notes · {height()} px</Text></View>
        <ResizeHandle size={height} onResize={setHeight} min={48} max={180} />
        <View className="flex-1 p-4"><Text className={captionText()}>Preview</Text></View>
      </View>
    </View>
    <View className="flex-col gap-3 w-full max-w-[420px]">
      <Text className={heading(4)}>Call statistics</Text>
      <Text className={captionText()}>Unavailable: no call is connected. Counters below have no samples.</Text>
      <CallStats sample={() => unavailable} history={() => []} />
    </View>
    <KeyboardExample />
    <ZoomExample />
  </View>;
}
