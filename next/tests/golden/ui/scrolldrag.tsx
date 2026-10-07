// Drag-to-scroll belongs to fingers: a pointer drag over a ScrollView scrolls it when the pointer is a touch (ZINC_POINTER=touch, or a Pi panel) and leaves it
// alone for a mouse on a desktop (ZINC_POINTER=mouse). tests/t1/pointer_kind.sh feeds scrolldrag.input and compares the frames.
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <ScrollView class="h-full bg-white">
    <View class="flex-col gap-2 p-3">
      {['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5', 'Row 6', 'Row 7', 'Row 8', 'Row 9', 'Row 10', 'Row 11', 'Row 12', 'Row 13', 'Row 14', 'Row 15', 'Row 16'].map((t: string) =>
        <View class="h-12 px-3 items-center flex-row border rounded"><Text class="text-base text-slate-900">{t}</Text></View>)}
    </View>
  </ScrollView>;
}
render(App, 0xffffff, (dt: number) => {});
