// hero: an animated title screen in the Solid model. The hero sits on a drawn canvas; a status bar below
// shows the last choice. Arrow keys / Tab move the focus, Space / Enter or a click picks an entry.
import { render } from 'zinc:ui/solid';
import { Separator, mutedText } from 'zinc:ui/kit';
import { selected, pulse, tick } from './state';
import { drawBackdrop } from './components/backdrop';
import { Hero } from './components/hero';

function StatusBar(): i32 {
  return <View class="flex-row items-center justify-between h-12 px-6 bg-white">
    <Text class={mutedText()}>{selected() === '' ? 'Pick an entry' : `Selected: ${selected()}`}</Text>
    <Text class="text-sm font-semibold text-indigo-600" style={{ opacity: pulse() }}>Updated</Text>
  </View>;
}

function App(): i32 {
  return <View class="flex-col h-full bg-zinc-50">
    <Canvas class="grow" onDraw={drawBackdrop}>
      <Hero />
    </Canvas>
    <Separator />
    <StatusBar />
  </View>;
}

render(App, 0xfafafa, tick);
