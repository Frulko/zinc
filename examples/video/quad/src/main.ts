// quad: four videos at once in a 2x2 grid, each looping on its own decoder thread.
// Usage: quad [folder | file1 file2 file3 file4]   (default: the media folder of this example)
// Keys: Space pause / resume, Right next file on every tile, Tab labels, Esc quit.
import * as gfx from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { Player } from 'zinc:video';
import { mediaFiles } from './media';
import { drawLabel } from './label';

const W = gfx.width(), H = gfx.height();
const TILE_W = Math.floor(W / 2), TILE_H = Math.floor(H / 2);

/** Four players decoded at tile size (drawing is a row copy); tile i plays files i, i+4, i+8... as its playlist. */
function createTiles(files: string[]): Player[] {
  const tiles: Player[] = [];
  for (let i = 0; i < 4; i++) {
    const player = new Player(TILE_W, TILE_H);
    for (let k = i; k < files.length || k === i; k += 4) player.add(files[k % files.length]);
    player.play();
    tiles.push(player);
  }
  return tiles;
}

const files = mediaFiles();
if (files.length === 0) { console.error('quad: no video files (usage: quad [folder | files...])'); sys.exit(1); }
const tiles = createTiles(files);
let showLabels = true, paused = false;

function handleKeys(): void {
  if (gfx.wasPressed(gfx.Btn.A)) { paused = !paused; for (const p of tiles) p.pause(paused); }
  if (gfx.wasPressed(gfx.Btn.Right)) for (const p of tiles) p.next();
  if (gfx.wasPressed(gfx.Btn.Select)) showLabels = !showLabels;
}

gfx.onFrame(() => {
  handleKeys();
  gfx.clear(0x000000);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * TILE_W, y = Math.floor(i / 2) * TILE_H;
    const p = tiles[i];
    p.draw(x, y, TILE_W, TILE_H);
    if (showLabels) drawLabel(x + 8, y + 8, p.decoder, `${p.position.toFixed(2)} s · loop ${p.loops}`);
  }
});
