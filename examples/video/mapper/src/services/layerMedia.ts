// Plays the media file a layer asks for, where the compositor does not do it itself (Android does, through the system's decoder and with sound).
// Here a layer's video is a zinc:video player, its image file a runtime image. ponytail: no sound on these targets, zinc:video only decodes pictures.
// A mapper led by another keeps its videos at the master's place: a small error by the speed, a large one by a seek ahead and a wait for that moment.
import * as fs from 'zinc:fs';
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import { Player, LOOP, EXTENSIONS, isVideo } from 'zinc:video';
import { fleetNow } from './fleet';

const SEEK_OVER_S = 0.2;           // further off than this, the speed would take too long
const FIRST_MARGIN_S = 0.25;       // how far ahead a seek lands, to have its picture before that moment; doubled when it does not
const MAX_MARGIN_S = 4;
const SPEED_PER_S = 2;             // 10 ms off: 2% faster for a moment
const MAX_SPEED_CHANGE = 0.1;

interface Playing { media: string; player: Player | null; bound: boolean; holding: boolean; margin: number; aimedAt: number; errorMs: number }

/** A video's place on the shared time: the moment its start would have played. */
export interface VideoTime { layer: i32; media: string; at: number }

let mediaDir = '';
const playing: Playing[] = [];
let led: VideoTime[] = [];

export function useMediaFolder(dir: string): void { mediaDir = dir; }

function stop(entry: Playing): void {
  if (entry.player !== null) (entry.player as Player).close();
  entry.player = null;
  entry.bound = false;
  entry.media = '';
  entry.holding = false;
  entry.margin = FIRST_MARGIN_S;
  entry.errorMs = 0;
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
    if (layer >= playing.length) playing.push({ media: '', player: null, bound: false, holding: false, margin: FIRST_MARGIN_S, aimedAt: 0, errorMs: 0 });
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

/** A file came: the layers that asked for it start it. */
export function mediaArrived(name: string): void {
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) {
    if ((JSON.parse(mapping.layerJson(layer)).media as string[])[0] !== name) continue;
    if (mapping.playsMedia()) {
      mapping.command(`/layer/${layer}/media`, [], ['']);
      mapping.command(`/layer/${layer}/media`, [], [name]);
    } else if (layer < playing.length) {
      stop(playing[layer]);
      start(playing[layer], layer, name);
    }
  }
}

/** Where this machine's videos are, for those that follow it. */
export function videoTimes(): VideoTime[] {
  const times: VideoTime[] = [];
  playing.forEach((entry: Playing, layer: i32) => {
    if (entry.player === null) return;
    const player = entry.player as Player;
    if (player.frames > 0 && !player.seeking) times.push({ layer, media: entry.media, at: fleetNow() - player.playhead * 1000 });
  });
  return times;
}

/** What the master says; [] when none leads this machine, and the videos go on as they are. */
export function followVideoTimes(times: VideoTime[]): void {
  if (times.length === 0) for (const entry of playing) if (entry.player !== null) (entry.player as Player).rate = 1;
  led = times;
}

/** The furthest a followed video is from the master, in ms. */
export function videoErrorMs(): number {
  let most = 0;
  for (const entry of playing) most = Math.max(most, Math.abs(entry.errorMs));
  return most;
}

/** The shortest way round the loop from `from` to `to`. */
function ahead(to: number, from: number, period: number): number {
  const way = (to - from) % period;
  const up = way < 0 ? way + period : way;
  return up > period / 2 ? up - period : up;
}

function seekAhead(entry: Playing, player: Player, wanted: number, period: number): void {
  entry.aimedAt = (wanted + entry.margin) % period;
  entry.holding = true;
  player.rate = 1;
  player.pause(true);
  player.seek(entry.aimedAt);
}

function keepOnTime(entry: Playing, time: VideoTime): void {
  const player = entry.player as Player;
  const period = player.duration;
  if (period <= 0) return;
  const wanted = (fleetNow() - time.at) / 1000 % period;
  const off = ahead(wanted, player.playhead, period);
  entry.errorMs = off * 1000;
  if (entry.holding) {
    if (player.seeking) {
      if (ahead(wanted, entry.aimedAt, period) <= 0) return;
      entry.margin = Math.min(entry.margin * 2, MAX_MARGIN_S);
      seekAhead(entry, player, wanted, period);
    } else if (off >= 0) {
      entry.holding = false;
      player.pause(false);
    } else if (off < -entry.margin - SEEK_OVER_S) seekAhead(entry, player, wanted, period);   // the master moved while this one waited
    return;
  }
  if (Math.abs(off) > SEEK_OVER_S) seekAhead(entry, player, wanted, period);
  else player.rate = 1 + Math.min(MAX_SPEED_CHANGE, Math.max(-MAX_SPEED_CHANGE, off * SPEED_PER_S));
}

/** Each frame. */
export function keepVideosOnTime(): void {
  for (const time of led) {
    if (time.layer >= playing.length) continue;
    const entry = playing[time.layer];
    if (entry.player !== null && entry.media === time.media) keepOnTime(entry, time);
  }
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
