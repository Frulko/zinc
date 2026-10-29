// A newline in a <Text> starts a line, as in React Native: a plain text, one wrapped at the box's width, and one with style runs
// (ui.setTextRuns: a bold first word, the second line in the text's own style).
import { render, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
const ref = createNodeRef();
onMount(() => ui.setTextRuns(ref.node, [4, ui.RUN_BOLD, -1]));
render(() => <View className="flex-row gap-2 p-2 bg-white">
  <Text className="w-[60] text-[12px] text-black">{'one\ntwo\n\nfour'}</Text>
  <Text className="w-[60] text-[12px] text-black">{'a long first line\nend'}</Text>
  <Text ref={ref} className="w-[60] text-[12px] text-black">{'bold\nnext'}</Text>
</View>, 0xffffff, null);
