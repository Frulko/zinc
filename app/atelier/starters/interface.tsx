import { createSignal, render } from 'zinc:ui/solid';

const [count, setCount] = createSignal<i32>(0);

function App(): i32 {
  return <View className="flex-col w-full h-full items-center justify-center gap-6">
    <Text className="text-6xl font-bold text-white">{`${count()}`}</Text>
    <Button className="h-11 px-6 rounded-full bg-[#9388ff]" onClick={() => setCount(count() + 1)}>
      <Text className="text-base font-medium text-white">+1</Text>
    </Button>
  </View>;
}

render(App, 0x1c1b20, null);
