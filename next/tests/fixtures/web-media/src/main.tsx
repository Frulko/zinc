import { render, createSignal } from 'zinc:ui/solid';
import { devices, Camera, requestPermission as askCamera } from 'zinc:camera';
import { Microphone, requestPermission as askMic } from 'zinc:microphone';

const [status, setStatus] = createSignal<string>('idle');

async function run(): Promise<void> {
  try {
    const cam = await askCamera(), mic = await askMic();
    const list = await devices();
    const c = await Camera.open('', { width: 320, height: 240, fps: 30 });
    const m = await Microphone.open('', {});
    let blocks = 0;
    m.onData(() => { blocks++; });
    await new Promise<void>((resolve: () => void) => { setTimeout(resolve, 1500); });
    const snap = c.snapshot();
    setStatus(`permission ${cam}/${mic}, cameras ${list.length}, camera ${c.width}x${c.height} frames ${c.frameIndex > 2 ? 'flowing' : 'stuck'}, snapshot ${snap.length === c.width * c.height * 4 ? 'ok' : 'wrong'}, microphone ${m.sampleRate > 0 ? 'open' : 'closed'} blocks ${blocks > 5 ? 'flowing' : 'stuck'}`);
    c.close(); m.close();
  } catch (e) { setStatus('error ' + (e as Error).message); }
}

function App(): i32 {
  return <View className="p-6 flex-col gap-3 bg-white w-full h-full">
    <Button className="bg-sky-600 rounded-md px-3 py-2 cursor-pointer" onClick={() => { run(); }}><Text className="text-white">Open</Text></Button>
    <Text>{status()}</Text>
  </View>;
}

render(App, 0xffffff, null);
