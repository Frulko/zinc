// zinc:mapping — GPU video-mapping compositor driven by OSC (docs/plugins/mapping.md). Needs `"display": "gl"`.
import Native from './native/mapping.spec';
import { listen as oscListen, send as oscSend, type OscMessage } from 'zinc:osc';
import { readText, writeText } from 'zinc:fs';

/** Applies one command of the address space: /layer/<n>/<key> args, /add, /remove, /clear, /move, /select,
 *  /save [path], /load [path], /sync host port. False when unknown or malformed. */
export function command(address: string, numbers: number[], strings: string[]): boolean {
  if (address === '/save') return save(strings.length > 0 ? strings[0] : 'mapping.json');
  if (address === '/load') return load(strings.length > 0 ? strings[0] : 'mapping.json');
  if (address === '/sync') {
    if (strings.length < 1 || numbers.length < 1) return false;
    sync(strings[0], numbers[0]);
    return true;
  }
  return Native.command(address, numbers, strings);
}

/** Appends a layer: source "pattern" | "solid" | "gradient" | "image". Returns its index, -1 when full. */
export function addLayer(source: string, name: string): i32 {
  if (!Native.command('/add', [], [source, name])) return -1;
  return Native.layerCount() - 1;
}

/** Shorthand for command(`/layer/<layer>/<key>`, numbers, []). */
export function set(layer: i32, key: string, numbers: number[]): boolean {
  return Native.command(`/layer/${layer}/${key}`, numbers, []);
}

/** Shows any runtime image (video frame, camera, gfx.createImage) or baked image id on a layer. */
export function setImage(layer: i32, image: i32): boolean {
  return Native.command(`/layer/${layer}/source`, [image], ['image']);
}

export function layerCount(): i32 { return Native.layerCount(); }
export function toJson(): string { return Native.toJson(); }
export function fromJson(json: string): boolean { return Native.fromJson(json); }

export function save(path: string): boolean {
  try {
    writeText(path, Native.toJson());
    return true;
  } catch (e) {
    console.error(`mapping: cannot save ${path}`);
    return false;
  }
}

export function load(path: string): boolean {
  try {
    return Native.fromJson(readText(path));
  } catch (e) {
    return false;
  }
}

/** OSC server on `port`: every message goes through command(). */
export function listen(port: i32): void {
  oscListen(port, (m: OscMessage) => {
    if (!command(m.address, m.numbers, m.strings)) console.warn(`mapping: ignored ${m.address}`);
  });
}

// State for a controller: /state/info {"layers","selected","aspect"}, then /state/layer i {json} per layer
// (one datagram per layer keeps each message small).
function sync(host: string, port: number): void {
  const p: i32 = Math.trunc(port);
  oscSend(host, p, '/state/info', [], [Native.info()]);
  for (let i = 0; i < Native.layerCount(); i++) oscSend(host, p, '/state/layer', [i], [Native.layerJson(i)]);
}
