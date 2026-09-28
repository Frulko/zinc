// The text screen in the Solid model: built once, then only the frame counter's text node updates each frame.
import { createSignal } from 'zinc:ui/solid';
import { heading, mutedText, smallText, captionText } from 'zinc:ui/kit';
import { TITLE, SUBTITLE, BODY, PAGE, CARD } from './content';

const [frames, setFrames] = createSignal<i32>(0);

export function Screen(): i32 {
  return <View class={PAGE}>
    <Text class={`${heading(3)} text-center`}>{TITLE}</Text>
    <Text class={`${mutedText()} text-center`}>{SUBTITLE}</Text>
    <View class={CARD}>
      <Text class={smallText()}>{BODY}</Text>
      <Text class={`${captionText()} text-right`}>right aligned</Text>
    </View>
    <Text class={`${captionText()} text-center`}>frame {frames()}</Text>
  </View>;
}

/** Called every frame by main-solid.tsx. */
export function tickFrames(): void {
  setFrames(frames() + 1);
}
