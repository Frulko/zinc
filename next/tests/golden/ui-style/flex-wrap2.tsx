// Column wrap and align-content (ZN-254): items break into columns when the column is full; wrapped rows spread with content-between.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function B(props: { c: string }): i32 { return <View class={'w-8 h-6 ' + props.c} />; }
function Screen(): i32 {
  return <View class="flex-col gap-2 p-2 bg-slate-100 w-full">
    <View class="flex-col flex-wrap gap-1 h-16 w-full bg-white">
      <B c="bg-red-500" /><B c="bg-green-500" /><B c="bg-blue-500" /><B c="bg-yellow-500" /><B c="bg-purple-500" />
    </View>
    <View class="flex-row flex-wrap gap-1 h-28 w-24 bg-white content-between">
      <B c="bg-red-500" /><B c="bg-green-500" /><B c="bg-blue-500" /><B c="bg-yellow-500" /><B c="bg-purple-500" />
    </View>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
