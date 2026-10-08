// gap-x-4 gap-y-2 on a wrapped row (ZN-252): 16 px between the boxes of a line, 8 px between the lines.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Box(props: { c: string }): i32 { return <View class={'w-16 h-8 ' + props.c} />; }
function Screen(): i32 {
  return <View class="flex-row flex-wrap gap-x-4 gap-y-2 p-2 bg-white w-full">
    <Box c="bg-red-500" /><Box c="bg-green-500" /><Box c="bg-blue-500" /><Box c="bg-yellow-500" /><Box c="bg-purple-500" /><Box c="bg-pink-500" />
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
