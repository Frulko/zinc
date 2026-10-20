import { render, createSignal } from 'zinc:ui/solid';
import { simulate } from './scene';

const [status, setStatus] = createSignal<string>('idle');

function run(): void {
  try { setStatus(simulate()); } catch (e) { setStatus('error ' + (e as Error).message); }
}

function App(): i32 {
  return <View className="p-6 flex-col gap-3 bg-white w-full h-full">
    <Button className="bg-sky-600 rounded-md px-3 py-2 cursor-pointer" onClick={run}><Text className="text-white">Run</Text></Button>
    <Text>{status()}</Text>
  </View>;
}

render(App, 0xffffff, null);
