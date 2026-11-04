// quill-lab: every demo of Quill (github.com/MaximeRivest/quill, MIT) in one app. RemarkableBar and its Quitter stay on top, the selector
// under them, the running demo below; in Quill each demo was its own program that took the whole panel and left with five fingers.
import { render, createSignal, For } from 'zinc:ui/solid';
import { repaint } from 'zinc:ui';
import { refreshRect, penCount } from 'zinc:gfx';
import { RemarkableBar, RemarkableApp, setPenMode, autoWaveform } from 'zinc:remarkable';
import { env } from 'zinc:sys';
import { Demo } from './demos/demo';
import { scribble, trail } from './demos/ink';
import { map, fade, movie } from './demos/animation';
import { blackWhite, colourImage, bars, modes, patches, blends } from './demos/colour';

const DEMOS: Demo[] = [scribble, trail, map, fade, movie, blackWhite, colourImage, bars, modes, patches, blends];
const USES_PEN_WAVEFORM: Demo[] = [scribble, trail, map, fade, movie];

const [current, setCurrent] = createSignal<i32>(0);
let needsDraw = true;

/** Opens a demo: clean waveform state, the demo's first state, and a full refresh to clear what the last one left. */
function open(index: i32): void {
  setCurrent(index);
  const demo = DEMOS[index];
  autoWaveform();
  refreshRect(0, 0, 1620, 2160, 'full');   // first: under the ink session it also sets the driver's fast flag, which the next line decides
  setPenMode(USES_PEN_WAVEFORM.indexOf(demo) >= 0);
  demo.start();
  needsDraw = true;
}

const CHIP = 'px-5 h-[76px] items-center justify-center rounded-lg border-2 border-black';

function Selector(): i32 {
  return <View className="flex-row flex-wrap gap-3 px-6 py-3 bg-white">
    <For each={DEMOS}>{(demo: Demo, i: i32) =>
      <Button className={`${CHIP} ${current() === i ? 'bg-black focus:bg-black' : 'bg-white focus:bg-white'}`} onClick={() => { open(i); }}>
        <Text className={`text-[30px] font-bold ${current() === i ? 'text-white' : 'text-black'}`}>{demo.title}</Text>
      </Button>}
    </For>
  </View>;
}

function App(): i32 {
  return <View className="flex-col h-full bg-white">
    <RemarkableBar title="Quill Lab" />
    <Selector />
    <View className="flex-row items-center gap-6 px-6 pb-3 bg-white border-b-2 border-black">
      <Text className="w-0 grow text-[30px] text-black">{DEMOS[current()].about}</Text>
      <Button className={`${CHIP} bg-white focus:bg-white`} onClick={() => { open(current()); }}>
        <Text className="text-[30px] font-bold text-black">Recommencer</Text>
      </Button>
    </View>
    <Canvas className="grow" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { if (opened) DEMOS[current()].draw(x, y, w, h); }} />
  </View>;
}

const firstDemo = parseInt(env('QUILL_LAB_DEMO') || '0');   // QUILL_LAB_DEMO=<index>: opens on that demo (captures, tests)
let opened = false;

function step(dt: number): void {
  // on the first frame, not at load: the driver has chosen its layer by then, so setWaveform and refreshRect are answered
  if (!opened) { opened = true; open(firstDemo); }
  if (DEMOS[current()].tick(dt) || needsDraw || penCount() > 0) { repaint(); needsDraw = false; }
}

render(() => <RemarkableApp app={App} />, 0xffffff, step);
