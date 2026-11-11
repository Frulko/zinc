// Shared browser plugin registry, capability checks and user-gesture unlock. No UI runtime.
const G = globalThis;
/** Thrown by a part of Zinc this browser (or the web target) cannot give: code, what is needed and which browsers have it. */
export class ZnUnsupported extends Error {
  constructor(feature, why) {
    super(`${feature} is not available in this browser${why ? ': ' + why : ''}`);
    this.name = 'ZnUnsupported';
    this.code = 'ZN_UNSUPPORTED';
    this.feature = feature;
  }
}
const has = (f) => { try { return !!f(); } catch { return false; } };
/** What this browser offers, by the names of docs/targets/web.md (the `web` capability row refined at run time). */
export function detect() {
  const n = typeof navigator === 'undefined' ? {} : navigator;
  const md = n.mediaDevices;
  return {
    canvas2d: has(() => document.createElement('canvas').getContext('2d')),
    webgl2: has(() => document.createElement('canvas').getContext('webgl2')),
    webgpu: has(() => 'gpu' in n),
    offscreenCanvas: has(() => typeof OffscreenCanvas === 'function'),
    getUserMedia: has(() => md && md.getUserMedia),
    audio: has(() => G.AudioContext || G.webkitAudioContext),
    audioWorklet: has(() => G.AudioWorkletNode),
    webrtc: has(() => G.RTCPeerConnection),
    websocket: has(() => G.WebSocket),
    webusb: has(() => 'usb' in n),
    webserial: has(() => 'serial' in n),
    webmidi: has(() => n.requestMIDIAccess),
    webbluetooth: has(() => 'bluetooth' in n),
    webhid: has(() => 'hid' in n),
    fileSystemAccess: has(() => G.showOpenFilePicker),
    clipboard: has(() => n.clipboard && n.clipboard.writeText),
    notifications: has(() => G.Notification),
    gamepad: has(() => n.getGamepads),
    vibrate: has(() => n.vibrate),
    wakeLock: has(() => 'wakeLock' in n),
    share: has(() => n.share),
    serviceWorker: has(() => 'serviceWorker' in n),
    indexedDB: has(() => G.indexedDB),
    wasm: has(() => G.WebAssembly),
    sharedArrayBuffer: has(() => G.SharedArrayBuffer && G.crossOriginIsolated),
    crossOriginIsolated: !!G.crossOriginIsolated,
    secureContext: !!G.isSecureContext,
    touch: has(() => n.maxTouchPoints > 0),
    pen: has(() => G.PointerEvent),
    imageBitmap: has(() => G.createImageBitmap),
    compressionStreams: has(() => G.DecompressionStream),
    fontFaceSet: has(() => document.fonts && G.FontFace),
    batteryStatus: has(() => n.getBattery),
    speechRecognition: has(() => G.SpeechRecognition || G.webkitSpeechRecognition),
    speechSynthesis: has(() => G.speechSynthesis),
    screenCapture: has(() => md && md.getDisplayMedia),
  };
}

export function nativeServices(CFG = {}, FEATURES = detect()) {
  const registry = Object.create(null);   // the browser backends of the plugins' native sides: name -> object of functions
  const Z = (G.__zincWeb = {
    config: CFG, features: FEATURES, detect, ZnUnsupported,
    /** A plugin's browser backend: `registerNative('Camera', { permission(ask) {...}, ... })`, the functions of its native spec. `needs` names features(). */
    registerNative(name, impl, needs = []) {
      registry[name] = { impl, needs };
    },
    /** Throws ZnUnsupported when a feature of features() is missing; plugins call it first. */
    require(feature, why) { if (!FEATURES[feature]) throw new ZnUnsupported(feature, why); },
    nativeOf(name) { return registry[name]; },
    bridge: null,
    invalidate() { /* set below */ },
  });

  const audioWaiters = [];
  function unlockAudio() { for (const f of audioWaiters.splice(0)) f(); }
  // (the page's first click, tap or key, in canvas and DOM mode alike; a waiter that arrives after one already happened runs at once: the browser's autoplay rule is then met)
  Z.onUserGesture = (f) => { if (navigator.userActivation && navigator.userActivation.hasBeenActive) { try { f(); } catch (e) { console.warn('zinc:', e); } } else audioWaiters.push(f); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { capture: true, passive: true });

  return Z;
}
