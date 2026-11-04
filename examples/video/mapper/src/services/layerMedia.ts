// Plays the media file a layer asks for, where the compositor does not do it itself (Android does, through the system's decoder and with sound).
// Here a layer's video is a zinc:video player, its image file a runtime image. ponytail: no sound on these targets, zinc:video only decodes pictures.
import * as fs from 'zinc:fs';
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import { Player, LOOP, EXTENSIONS, isVideo } from 'zinc:video';

interface Playing { media: string; player: Player | null; bound: boolean }

let mediaDir = '';
const playing: Playing[] = [];

export function useMediaFolder(dir: string): void { mediaDir = dir; }

function stop(entry: Playing): void {
  if (entry.player !== null) (entry.player as Player).close();
  entry.player = null;
  entry.bound = false;
  entry.media = '';
}

function start(entry: Playing, layer: i32, media: string): void {
  entry.media = media;
  const path = `${mediaDir}/${media}`;
  if (!fs.exists(path)) { console.warn(`mapper: no media ${media}`); return; }
  if (isVideo(media, EXTENSIONS)) {
    const player = new Player(0, 0);   // decoded at its own size: the layer fits it
    player.repeat = LOOP;
    player.add(path);
    player.play();
    entry.player = player;
    return;
  }
  mapping.setImage(layer, gfx.imageFromBytes(fs.readBytes(path)));
  entry.bound = true;
}

/** Brings the players in line with what the layers ask for: after a command or a load. */
export function followLayerMedia(): void {
  if (mapping.playsMedia()) return;
  const count = mapping.layerCount();
  for (let layer: i32 = 0; layer < count; layer++) {
    if (layer >= playing.length) playing.push({ media: '', player: null, bound: false });
    const asked = (JSON.parse(mapping.layerJson(layer)).media as string[])[0];
    const entry = playing[layer];
    if (asked === entry.media) continue;
    const hadMedia = entry.media !== '';
    stop(entry);
    if (asked !== '') start(entry, layer, asked);
    else if (hadMedia) mapping.command(`/layer/${layer}/source`, [], ['pattern']);
  }
  for (let layer: i32 = count; layer < playing.length; layer++) stop(playing[layer]);
}

/** A player knows its image once its first frame is decoded: hands it to the layer then. */
export function bindDecodedVideos(): void {
  for (let layer: i32 = 0; layer < playing.length; layer++) {
    const entry = playing[layer];
    if (entry.bound || entry.player === null) continue;
    const image = (entry.player as Player).image;
    if (image < 0) continue;
    mapping.setImage(layer, image);
    entry.bound = true;
  }
}
