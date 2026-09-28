// Four videos at once in a 2x2 grid, each looping on its own decoder thread.
// Usage: quad [folder | file1 file2 file3 file4]   (default: the media folder next to this example)
// Keys: Space pause/resume, Right next file on every tile, Tab info overlay, Esc quit.
import * as gfx from 'zinc:gfx';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { Player, EXTENSIONS, isVideo } from 'zinc:video';

const W = gfx.width(), H = gfx.height();
const TW = Math.floor(W / 2), TH = Math.floor(H / 2);

function mediaFiles(): string[] {
  const args = sys.args();
  if (args.length > 1) return args;
  const cands = args.length === 1 ? [args[0]] : ['media', '../../media', 'examples/video/quad/media'];
  for (const d of cands) {
    if (!fs.exists(d)) continue;
    if (isVideo(d, EXTENSIONS)) return [d];
    return fs.list(d).filter(f => isVideo(f, EXTENSIONS)).map(f => d + '/' + f);
  }
  return [];
}

const files = mediaFiles();
if (files.length === 0) { console.error('quad: no video files (usage: quad [folder | files...])'); sys.exit(1); }
const tiles: Player[] = [];
for (let i = 0; i < 4; i++) {
  const p = new Player(TW, TH);  // decoded straight at tile size: drawing is a row copy
  for (let k = i; k < files.length || k === i; k += 4) p.add(files[k % files.length]);
  p.play();
  tiles.push(p);
}
let info = true, paused = false;
const font = gfx.font('sans', 16);

gfx.onFrame(() => {
  if (gfx.wasPressed(gfx.Btn.A)) { paused = !paused; for (const p of tiles) p.pause(paused); }
  if (gfx.wasPressed(gfx.Btn.Right)) for (const p of tiles) p.next();
  if (gfx.wasPressed(gfx.Btn.Select)) info = !info;
  gfx.clear(0x000000);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * TW, y = Math.floor(i / 2) * TH;
    tiles[i].draw(x, y, TW, TH);
    if (info) gfx.drawText(font, x + 6, y + 18, `${tiles[i].decoder} ${tiles[i].position.toFixed(2)}s x${tiles[i].loops}`, 0xFFFFFF, 200, 0);
  }
});
