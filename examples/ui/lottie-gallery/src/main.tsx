// lottie-gallery: Lottie animations from assets/ in a grid of cards (zinc:ui + zinc:lottie), with a fps readout.
// Other entries: src/view.ts (one animation, full window) and src/bench.ts (per-frame costs).
import { createSignal, render } from 'zinc:ui/solid';
import { drawMs } from 'zinc:lottie';
import { heading, mutedText } from 'zinc:ui/kit';
import { FILES } from './files';
import { AnimationCard } from './components/AnimationCard';

const [stats, setStats] = createSignal<string>('measuring…');

function App(): i32 {
  return <View class="flex-col h-full p-4 gap-4 bg-zinc-50">
    <View class="flex-row items-center justify-between">
      <View class="flex-row items-end gap-3">
        <Text class={heading(3)}>zinc:lottie</Text>
        <Text class={mutedText()}>click a card to pause it</Text>
      </View>
      {/* a Badge's label is fixed at creation: a live readout needs its own Text */}
      <View class="px-2 py-0.5 rounded-md bg-white border border-zinc-200">
        <Text class="text-xs font-semibold text-zinc-700">{stats()}</Text>
      </View>
    </View>
    <View class="flex-row flex-wrap gap-3 justify-center">
      {FILES.map((file: string) => <AnimationCard file={file} />)}
    </View>
  </View>;
}

// fps and the mean time spent evaluating animations, averaged over half a second
let elapsed = 0, frames = 0, lottieMs = 0;
function measure(dt: number): void {
  elapsed += dt;
  frames++;
  lottieMs += drawMs();
  if (elapsed < 0.5) return;
  setStats(`${Math.round(frames / elapsed)} fps · ${(lottieMs / frames).toFixed(2)} ms lottie`);
  elapsed = 0;
  frames = 0;
  lottieMs = 0;
}

render(App, 0xfafafa, measure);
