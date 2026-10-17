import { render } from 'zinc:ui/solid';
import { count, setCount } from './state';
import { Label } from './Label';

function App(): i32 {
  return <View className="p-6 flex-col gap-3 bg-white w-full h-full">
    <Label />
    <Button className="bg-sky-600 rounded-md px-3 py-2 cursor-pointer" onClick={() => setCount(count() + 1)}><Text className="text-white">Add one</Text></Button>
  </View>;
}

render(App, 0xffffff, null);
