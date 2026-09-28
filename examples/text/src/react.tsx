// The text screen in the React model: the component re-renders as a whole when its state changes, and the
// reconciler reuses the host nodes, so the result is the same tree as the Solid screen.
import { useState, useEffect } from 'zinc:ui/react';
import { heading, mutedText, smallText, captionText } from 'zinc:ui/kit';
import { TITLE, SUBTITLE, BODY, PAGE, CARD } from './content';

// The frame loop lives outside React: it reaches the component through the state setter captured on mount.
let frameCount: i32 = 0;
let setFramesFromLoop: ((v: i32) => void) | null = null;

export function Screen(): i32 {
  const [frames, setFrames] = useState<i32>(0);
  useEffect(() => { setFramesFromLoop = setFrames; }, []);
  return <View class={PAGE}>
    <Text class={`${heading(3)} text-center`}>{TITLE}</Text>
    <Text class={`${mutedText()} text-center`}>{SUBTITLE}</Text>
    <View class={CARD}>
      <Text class={smallText()}>{BODY}</Text>
      <Text class={`${captionText()} text-right`}>right aligned</Text>
    </View>
    <Text class={`${captionText()} text-center`}>frame {frames}</Text>
  </View>;
}

/** Called every frame by main-react.tsx. */
export function tickFrames(): void {
  frameCount++;
  const setFrames = setFramesFromLoop;
  if (setFrames !== null) setFrames(frameCount);
}
