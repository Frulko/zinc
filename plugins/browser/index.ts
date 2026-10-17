// zinc:browser (docs/targets/web.md, "Capabilities and limits"): what the page of a web export can do. Outside a browser (a desktop, a board) there is no
// page: isBrowser() is false, supports() answers false and requireFeature() throws, so a program can ask without caring where it runs.
// The browser version is plugins/browser/web/index.ts, selected by `zinc export --target web`.

/** Thrown by a part of Zinc, or by requireFeature(), when the browser (or the web target) cannot give what the call needs. `feature` names it. */
export class ZnUnsupported extends Error {
  readonly code: string = 'ZN_UNSUPPORTED';
  readonly feature: string;
  constructor(feature: string, why: string = '') {
    super(`${feature} is not available${why === '' ? '' : ': ' + why}`);
    this.name = 'ZnUnsupported';
    this.feature = feature;
  }
}
export interface BrowserInfo { name: string; version: number; engine: string; mobile: boolean; secureContext: boolean; crossOriginIsolated: boolean }

/** True when the program runs in a web page. */
export function isBrowser(): boolean { return false; }
/** The browser: its name ('chrome', 'edge', 'firefox', 'safari', 'other'), major version, engine and whether it is a phone. */
export function browserInfo(): BrowserInfo { return { name: 'none', version: 0, engine: 'none', mobile: false, secureContext: false, crossOriginIsolated: false }; }
/** Every feature the web target knows and whether this browser has it: canvas2d, webgl2, webgpu, getUserMedia, audio, audioWorklet, webrtc, websocket, webusb,
 *  webserial, webbluetooth, webhid, fileSystemAccess, clipboard, notifications, gamepad, vibrate, wakeLock, share, serviceWorker, indexedDB, wasm,
 *  sharedArrayBuffer, speechRecognition, speechSynthesis, screenCapture... (the keys of targets/web/browsers.json). */
export function browserFeatures(): { [feature: string]: boolean } { return {}; }
/** Whether the browser has one feature. */
export function supports(feature: string): boolean { return false; }
/** Throws ZnUnsupported naming the feature (and the browsers that have it) when it is missing. */
export function requireFeature(feature: string): void { throw new ZnUnsupported(feature, 'the program does not run in a browser'); }
/** The browsers that ship a feature, as 'chrome 61, edge 79' (empty for a feature the table does not know): the text of a message to the person. */
export function shippedBy(feature: string): string { return ''; }
/** A bar at the bottom of the page with `text` (a short sentence): the plain way to say that a part of the app is off in this browser. */
export function banner(text: string): void { console.warn(text); }
