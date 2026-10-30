// zinc:web on the web target (docs/targets/web.md): the page already has the WinterTC / Web APIs that web.ts writes in Zinc, so this module hands the
// browser's own out under the same names. A program (or a plugin) that imports `URL`, `Event`, `MediaStream`, `navigator`... from 'zinc:web' gets the
// real ones, native speed and every browser feature, and the globals are never replaced by the Zinc versions (no import is added for them).
// The `zinc export --target web` build selects this file instead of web.ts (src/frontend/modules.cpp stdModuleFile).
const g: any = globalThis;

export const DOMException = g.DOMException, TextEncoder = g.TextEncoder, TextDecoder = g.TextDecoder, URIError = g.URIError;
export const btoa = g.btoa.bind(g), atob = g.atob.bind(g), encodeURIComponent = g.encodeURIComponent, encodeURI = g.encodeURI, decodeURIComponent = g.decodeURIComponent, decodeURI = g.decodeURI;
export const URLSearchParams = g.URLSearchParams, URL = g.URL;
export const Event = g.Event, CustomEvent = g.CustomEvent, ErrorEvent = g.ErrorEvent, MessageEvent = g.MessageEvent, PromiseRejectionEvent = g.PromiseRejectionEvent, EventTarget = g.EventTarget;
export const AbortSignal = g.AbortSignal, AbortController = g.AbortController, MessagePort = g.MessagePort, MessageChannel = g.MessageChannel;
export const Blob = g.Blob, File = g.File, FormData = g.FormData, structuredClone = g.structuredClone.bind(g);
export const globalEvents = g;
export const addEventListener = g.addEventListener.bind(g), removeEventListener = g.removeEventListener.bind(g), dispatchEvent = g.dispatchEvent.bind(g);
export function reportError(e: unknown): void { if (typeof g.reportError === 'function') g.reportError(e); else console.error(e); }
export const BatteryManager = g.BatteryManager, NetworkInformation = g.NetworkInformation, WakeLockSentinel = g.WakeLockSentinel, WakeLock = g.WakeLock, MediaMetadata = g.MediaMetadata, MediaSession = g.MediaSession;
export const KeyboardEvent = g.KeyboardEvent, Notification = g.Notification, MediaDeviceInfo = g.MediaDeviceInfo, MediaTrackSettings = undefined, MediaStreamTrack = g.MediaStreamTrack, MediaStream = g.MediaStream, MediaDevices = g.MediaDevices;
export const VirtualKeyboard = g.VirtualKeyboard, Navigator = g.Navigator, navigator = g.navigator, Document = g.Document, document = g.document, ScreenOrientation = g.ScreenOrientation, Screen = g.Screen, screen = g.screen;
export const SensorErrorEvent = g.SensorErrorEvent, Sensor = g.Sensor, Accelerometer = g.Accelerometer, AbsoluteOrientationSensor = g.AbsoluteOrientationSensor, Gyroscope = g.Gyroscope, AmbientLightSensor = g.AmbientLightSensor;
export const DeviceMotionEvent = g.DeviceMotionEvent, DeviceOrientationEvent = g.DeviceOrientationEvent, CryptoKey = g.CryptoKey, SubtleCrypto = g.SubtleCrypto, Crypto = g.Crypto, crypto = g.crypto;
// types of web.ts: erased, but a program may name them in an import
export const EncodeIntoResult = undefined, TextDecoderOptions = undefined, TextDecodeOptions = undefined, EventInit = undefined, CustomEventInit = undefined, ErrorEventInit = undefined,
  MessageEventInit = undefined, PromiseRejectionEventInit = undefined, EventListener = undefined, EventListenerOptions = undefined, AddEventListenerOptions = undefined, BlobPropertyBag = undefined,
  FilePropertyBag = undefined, MediaTrackConstraints = undefined, MediaTrackAudioConstraints = undefined, MediaStreamConstraints = undefined, CameraBridge = undefined, MicrophoneBridge = undefined;
// the camera and microphone plugins of the web target open getUserMedia themselves: the bridges of the Zinc polyfill have nothing to connect
export function setCameraBridge(_b: unknown): void {}
export function setMicrophoneBridge(_b: unknown): void {}
// byte helpers web.ts exports for the rest of the standard library (programs rarely call them)
export function base64Encode(b: number[] | Uint8Array): string { let s = ''; for (const v of b) s += String.fromCharCode(v); return g.btoa(s); }
export function base64Decode(s: string): number[] { const r = g.atob(s), o: number[] = []; for (let i = 0; i < r.length; i++) o.push(r.charCodeAt(i)); return o; }
export function toHex(b: number[] | Uint8Array): string { let s = ''; for (const v of b) s += (v & 255).toString(16).padStart(2, '0'); return s; }
// (sha1, sha384 and sha512 of Zinc are synchronous; the browser's crypto.subtle is not: use it)
function noSync(name: string): never { throw new g.ZnUnsupported(name + '()', 'synchronous hashing has no browser equivalent: use await crypto.subtle.digest()'); }
export function sha1(_d: number[]): number[] { return noSync('sha1'); }
// sha256 is synchronous in the page too (zinc:3d/scene names its files by it): the engine's own third_party/sha256 (B-Con's crypto-algorithms, public domain), ported line for line
const K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
  0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c,
  0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
export function sha256(d: number[] | Uint8Array): number[] {
  const n = d.length, len = ((n + 9 + 63) >> 6) << 6, b = new Uint8Array(len);
  b.set(d); b[n] = 0x80;
  const bits = n * 8;   // the length in bits, big-endian in the last 8 bytes
  for (let i = 0; i < 8; i++) b[len - 1 - i] = Math.floor(bits / 2 ** (8 * i)) & 255;
  const st = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], m = new Array<number>(64);
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) m[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const x = m[i - 2], y = m[i - 15];
      m[i] = ((rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) + m[i - 7] + (rotr(y, 7) ^ rotr(y, 18) ^ (y >>> 3)) + m[i - 16]) | 0;
    }
    let [a, bb, c, dd, e, f, gg, h] = st;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & gg)) + K256[i] + m[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = gg; gg = f; f = e; e = (dd + t1) | 0; dd = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    st[0] = (st[0] + a) | 0; st[1] = (st[1] + bb) | 0; st[2] = (st[2] + c) | 0; st[3] = (st[3] + dd) | 0;
    st[4] = (st[4] + e) | 0; st[5] = (st[5] + f) | 0; st[6] = (st[6] + gg) | 0; st[7] = (st[7] + h) | 0;
  }
  const out: number[] = [];
  for (const w of st) out.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
  return out;
}
export function sha384(_d: number[]): number[] { return noSync('sha384'); }
export function sha512(_d: number[]): number[] { return noSync('sha512'); }
