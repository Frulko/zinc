// zinc:video in a phone app (ZN-751): two clips of assets/ (quad's 160x90 test pattern and bars, 3 s each) as a looping playlist, then a
// jump to an entry and a step back, as hero's Restart and the looper's keys do. One line per event; "video ok" at the end, then it quits.
import { onFrame, clear, drawImage, width, height, quit } from 'zinc:gfx';
import { Player } from 'zinc:video';

const p = new Player(320, 180);
const added = p.add('assets/a.mp4') && p.add('assets/b.mp4');
console.log(`video added ${added} count ${p.count}`);
p.play();
let last = -1, step = 0, frames = 0;
const seen: string[] = [];
onFrame((dt: number) => {
  frames++;
  clear(0x202020);
  const s = Math.min(width() / 320, height() / 180);
  if (p.image >= 0) drawImage(p.image, (width() - 320 * s) / 2, (height() - 180 * s) / 2, 320 * s, 180 * s, 255, 0);
  if (p.index !== last && p.frames > 0) {
    last = p.index;
    seen.push(`${last}`);
    console.log(`entry ${last} loops ${p.loops} duration ${p.duration.toFixed(2)} decoder ${p.decoder}`);
  }
  if (step === 0 && p.loops >= 1 && p.index === 0 && p.position > 0.5) { step = 1; console.log(`looped: entries ${seen.join(',')}`); p.jump(1); }
  else if (step === 1 && p.index === 1 && p.position < 1) { step = 2; console.log('jumped to 1'); }
  else if (step === 2 && p.position > 1) { step = 3; p.previous(); }
  else if (step === 3 && p.index === 0 && p.position < 1) { step = 4; console.log('back to 0'); }
  else if (step === 4 && p.position > 1) {
    console.log(`video ok: ${p.frames} pictures shown, ${p.dropped} dropped, ${frames} frames, playing ${p.playing}`);
    p.close();
    quit();
  }
});
