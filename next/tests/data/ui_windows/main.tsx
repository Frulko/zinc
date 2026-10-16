// zinc:ui in two windows (ZN-663): the main window is an editor (a button adds a tile), the second one previews the tiles and has a button of
// its own; the trees share the program's signals, each window has its own layout, hover and presses. tests/t1/windows.sh scripts it.
import { createSignal, render, renderWindow } from 'zinc:ui/solid';

const [tiles, setTiles] = createSignal<i32>(0);
const [pings, setPings] = createSignal<i32>(0);

function Editor(): i32 {
  return <View className="flex-col gap-4 p-6 h-full">
    <Text className="text-xl text-white">Editor</Text>
    <Button className="w-40 h-12 items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-500" onClick={() => { setTiles(tiles() + 1); console.log(`editor: ${tiles()} tiles`); }}>
      <Text className="text-white">Add a tile</Text>
    </Button>
    <Text className="text-sm text-slate-300">{`pings from the preview: ${pings()}`}</Text>
  </View>;
}
function Preview(): i32 {
  return <View className="flex-col gap-3 p-4 h-full">
    <Text className="text-lg text-slate-900">{`Preview: ${tiles()} tiles`}</Text>
    <View className="flex-row gap-2 h-10">
      <View className={tiles() >= 1 ? 'w-10 h-10 rounded-md bg-emerald-500' : 'hidden'} />
      <View className={tiles() >= 2 ? 'w-10 h-10 rounded-md bg-emerald-500' : 'hidden'} />
      <View className={tiles() >= 3 ? 'w-10 h-10 rounded-md bg-emerald-500' : 'hidden'} />
    </View>
    <Button className="w-28 h-10 items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400" onClick={() => { setPings(pings() + 1); console.log(`preview: ${pings()} pings`); }}>
      <Text className="text-slate-900">Ping</Text>
    </Button>
  </View>;
}

render(Editor, 0x0f172a, null);
console.log(`preview window ${renderWindow('Preview', 240, 180, Preview, 0xfffbeb)}`);
