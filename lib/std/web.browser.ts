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
// (sha1, sha256, sha384 and sha512 of Zinc are synchronous; the browser's crypto.subtle is not: use it)
function noSync(name: string): never { throw new g.ZnUnsupported(name + '()', 'synchronous hashing has no browser equivalent: use await crypto.subtle.digest()'); }
export function sha1(_d: number[]): number[] { return noSync('sha1'); }
export function sha256(_d: number[]): number[] { return noSync('sha256'); }
export function sha384(_d: number[]): number[] { return noSync('sha384'); }
export function sha512(_d: number[]): number[] { return noSync('sha512'); }
