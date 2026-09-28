// Now playing: a procedurally painted cover, a spectrum, a seek slider and a play button whose triangle folds into
// the pause bars.
import { Slider } from 'zinc:ui/kit';
import { tk, rgb } from '../components/ui';
import { rrect } from 'zinc:gfx';
import { drawCover, drawPlayPause, drawSkip } from '../draw/widgets';
import { TRACKS, track, playing, position, morph, coverClock, energy, spectrum, BARS, toggle, skip, seek } from '../app/music';
import { clockText } from '../app/state';

function drawSpectrum(x: number, y: number, w: number, h: number, color: u32, idle: u32): void {
  const gap = 2, bw = (w - gap * (BARS - 1)) / BARS;
  for (let i = 0; i < BARS; i++) {
    const bh = Math.max(3, spectrum[i] * h);
    rrect(x + i * (bw + gap), y + h - bh, bw, bh, 1.5, spectrum[i] > 0.12 ? color : idle, 255);
  }
}

export function Music(): i32 {
  return <View class="flex-col grow p-3 gap-1.5">
    <View class="flex-row items-center gap-3">
      <Canvas class="w-[88] h-[88]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCover(x, y, w, h, TRACKS[track()].cover, coverClock(), energy.get())} />
      <View class="flex-col grow gap-0.5">
        <Text class={`text-[10px] font-semibold tracking-wider text-${playing() ? tk().accent : tk().mutedForeground}`}>{playing() ? 'NOW PLAYING' : 'PAUSED'}</Text>
        <Text class={`text-base font-bold text-${tk().foreground}`}>{TRACKS[track()].title}</Text>
        <Text class={`text-xs text-${tk().mutedForeground}`}>{TRACKS[track()].artist}</Text>
        <Text class={`text-[10px] text-${tk().mutedForeground}`}>{`Track ${track() + 1} of ${TRACKS.length}`}</Text>
      </View>
    </View>
    <Canvas class="h-6" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawSpectrum(x, y, w, h, rgb(tk().accent), rgb(tk().muted))} />
    <Slider value={() => position() * 100 / TRACKS[track()].seconds} onChange={(v: number) => seek(v / 100 * TRACKS[track()].seconds)} min={0} max={100} step={0} />
    <View class="flex-row justify-between">
      <Text class={`text-[10px] text-${tk().mutedForeground}`}>{clockText(position())}</Text>
      <Text class={`text-[10px] text-${tk().mutedForeground}`}>{`-${clockText(TRACKS[track()].seconds - position())}`}</Text>
    </View>
    <View class="flex-row items-center justify-center gap-6">
      <Canvas class={`w-10 h-10 focus:bg-${tk().background}`} onClick={() => skip(-1)} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawSkip(x, y, w, h, -1, rgb(tk().foreground))} />
      <Canvas class={`w-12 h-12 focus:bg-${tk().background}`} onClick={() => toggle()} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawPlayPause(x, y, w, h, morph.get(), rgb(tk().accent), 0xffffff)} />
      <Canvas class={`w-10 h-10 focus:bg-${tk().background}`} onClick={() => skip(1)} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawSkip(x, y, w, h, 1, rgb(tk().foreground))} />
    </View>
  </View>;
}
