// What a finger does differently from a mouse (tests/t1/touch_finger.sh): it reaches a small control it lands beside, it gives a text field
// the focus when it lifts and not when it lands (a drag that starts on a field scrolls the page), and a scroll area covered by something
// else does not take its drags (ZINC_DEMO=cover).
import { createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';

const cover = env('ZINC_DEMO') === 'cover';
let moves = 0;
const field = createNodeRef();
ui.onFocusChange((h: i32) => console.log(h === field.node ? 'focus: the field' : h >= 0 ? 'focus: the box' : 'focus: none'));
function App(): i32 {
  return <View class="h-full bg-white">
    <ScrollView class="h-full">
      <View class="flex-col gap-4 p-4">
        <View class="w-5 h-5 border" onClick={() => console.log('check')} />
        <Input ref={field} class="h-10 w-60 border rounded" placeholder="name" />
        {['1', '2', '3', '4', '5', '6', '7', '8'].map((t: string) => <View class="h-16 border"><Text class="text-base">{t}</Text></View>)}
      </View>
    </ScrollView>
    {cover ? <View class="absolute inset-0 bg-white" onPointerMove={(e: ui.PointerEvent) => { moves++; console.log(`move ${moves} at ${Math.round(e.x)} ${Math.round(e.y)}`); }} /> : <View />}
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
