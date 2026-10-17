import { render, createSignal } from 'zinc:ui/solid';
import { tone, backend, stream, fromSamples } from 'zinc:audio';

const [status, setStatus] = createSignal<string>('idle');

function play(): void {
  const t = tone(440, 0.25);
  const s = stream(1, 48000);
  const pcm = fromSamples([0, 0.5, 0, -0.5], 1, 8000);
  t.play();
  s.write([0.1, 0.2, 0.3]);
  setStatus(`backend ${backend()}, tone ${t.duration.toFixed(2)} s, playing ${t.playing}, stream ${s.ok}, pcm ${pcm.sampleRate} Hz ${pcm.samples(0).length} frames`);
}

function App(): i32 {
  return <View className="p-6 flex-col gap-3 bg-white w-full h-full">
    <Button className="bg-sky-600 rounded-md px-3 py-2 cursor-pointer" onClick={play}><Text className="text-white">Play</Text></Button>
    <Text>{status()}</Text>
  </View>;
}

render(App, 0xffffff, null);
