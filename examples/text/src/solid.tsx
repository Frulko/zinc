// The text screen in the Solid model: built once, then only the frame counter's text node updates each frame.
import { createSignal } from 'zinc:ui/solid';
import { heading, mutedText, smallText, captionText } from 'zinc:ui/kit';
import { TITLE, SUBTITLE, BODY, PAGE, CARD } from './content';

const [frames, setFrames] = createSignal<i32>(0);

export function Screen(): i32 {
  return <View className={PAGE}>
    <Text className={`${heading(3)} text-center`}>{TITLE}</Text>
    <Text className={`${mutedText()} text-center`}>{SUBTITLE}</Text>
    <View className={CARD}>
      <Text className={smallText()}>{BODY}</Text>
      <Text className={`${captionText()} text-right`}>right aligned</Text>
    </View>
    <Text className={`${captionText()} text-center`}>frame {frames()}</Text>
  </View>;
}

/** Called every frame by main-solid.tsx. */
export function tickFrames(): void {
  setFrames(frames() + 1);
}
