// Two clips played as a playlist (ZN-109): the player moves from the first to the second and wraps to the first again with the output never going blank in between ("gapless").
import { onFrame, clear, drawImage, quit } from 'zinc:gfx';
import { Player } from 'zinc:video';
import * as sys from 'zinc:sys';

const p = new Player(0, 0);
p.add(sys.env('VIDEO_A'));
p.add(sys.env('VIDEO_B'));
p.repeat = 1;
p.play();
let last = -1, blank = 0, started = false, changes = 0;
const seen: i32[] = [];
onFrame((dt: number) => {
  clear(0x000000);
  if (p.image < 0) return;
  drawImage(p.image, 0, 0, p.width, p.height, 255, 0);
  if (p.frames > 0) started = true;
  if (started && !p.playing) blank++;
  if (p.index !== last) { last = p.index; seen.push(last); changes++; }
  if (changes >= 3 || p.loops >= 2) { console.log('index sequence', seen.join(','), 'blank frames', blank, 'playing', p.playing); quit(); }
});
