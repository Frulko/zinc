// Interface: zinc:ui describes the window as elements, like a web page. A signal holds a value; the text that reads
// it follows it by itself when a button changes it.
import { createSignal, render } from 'zinc:ui/solid';

const [count, setCount] = createSignal<i32>(0);

function change(by: i32): void {
  setCount(count() + by);
  console.log(`count is ${count()}`);
}

function App(): i32 {
  return <View className="flex-col w-full h-full items-center justify-center gap-6 bg-[#f3f1ec]">
    <Text className="text-6xl font-bold text-[#1d1b18]">{`${count()}`}</Text>
    <View className="flex-row gap-3">
      <Button className="py-1 h-11 px-5 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
        <Text className="text-base font-medium text-[#1d1b18]">Less</Text>
      </Button>
      <Button className="py-1 h-11 px-5 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
        <Text className="text-base font-medium text-white">More</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, (dt: number) => {});   // the last one runs every frame: nothing to do here
