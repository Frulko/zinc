// zinc:monitors native side. A display is its CGDirectDisplayID. Lists are JSON (index.ts parses them into its interfaces). A call that
// fails returns false, -1 or an empty array, and error() says why.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** True when the tests' two fake displays stand in for the machine's (ZINC_FAKE_DISPLAYS=1 or a deterministic run). */
  fake(): boolean;
  /** A JSON array of the online displays and of those this process disconnected. */
  displays(): string;
  /** Goes up each time the system reconfigures its displays. */
  revision(): i32;
  /** A JSON array of the display's modes, the scaled and low resolution ones included. */
  modes(id: i32): string;
  setMode(id: i32, modeId: i32): boolean;
  /** Builtin and Apple displays: 0..1, -1 when the display has no native brightness. */
  nativeBrightness(id: i32): f64;
  setNativeBrightness(id: i32, value: f64): boolean;
  /** A DDC VCP code, -1 when the monitor does not answer: about 50 ms, seconds from a monitor that hangs, so never on the program's thread. */
  ddcRead(id: i32, code: i32, done: (current: f64, maximum: f64) => void): void;
  /** Queued: a monitor is slow, the newest value of a code replaces one not sent yet. */
  ddcWrite(id: i32, code: i32, value: i32): boolean;
  /** Software dimming and warmth through the gamma table, both 0..1; dim 1 and warmth 0 restore the colour profile. */
  setGamma(id: i32, dim: f64, warmth: f64): boolean;
  /** How far above SDR white the display can go (1: not at all). */
  boostMax(id: i32): f64;
  /** Extra brightness through an HDR overlay; 1 removes it. */
  setBoost(id: i32, level: f64): boolean;
  setOrigin(id: i32, x: i32, y: i32): boolean;
  setMain(id: i32): boolean;
  /** Makes `id` show `masterId`; 0 stops mirroring. */
  setMirror(id: i32, masterId: i32): boolean;
  setRotation(id: i32, degrees: i32): boolean;
  /** Connects or disconnects a display; refuses to disconnect the last one. */
  setConnected(id: i32, on: boolean): boolean;
  /** A virtual display, alive until destroyed or until this process ends; its id, or 0. */
  createVirtual(name: string, width: i32, height: i32, refresh: f64, hidpi: boolean): i32;
  destroyVirtual(id: i32): boolean;
  error(): string;
}
export default requireNative<Spec>('Monitors');
