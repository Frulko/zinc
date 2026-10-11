// A loader screen of the project's own (zinc.json loading.screen: a module whose default export draws one frame): it prints the progress.
import { clear, rect, width, height } from 'zinc:gfx';

export default function screen(progress: number, dt: number): void {
  console.log(`progress ${progress}`);
  clear(0x101418);
  rect(0, height() - 4, width() * progress, 4, 0xf0f0f0);
}
