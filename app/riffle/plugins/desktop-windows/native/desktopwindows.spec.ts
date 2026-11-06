// zinc:desktop-windows native side. Lists are JSON (index.ts parses them). Everything is called on the program's thread; the slow work (AX, the event tap) runs on threads of its own.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** True when the fixed fake windows stand in for the machine's (RIFFLE_FAKE_WINDOWS=1 or a deterministic run). */
  fake(): boolean;
  /** Whether this process has the Accessibility permission; `prompt` opens the system's dialog. */
  trusted(prompt: boolean): boolean;
  /** Receives every event on the program's thread: see the EVENT_ constants of index.ts. */
  listen(handler: (kind: f64, value: f64) => void): void;
  /** Installs the event tap and the focus observers once; false while the permission is missing. `withHotkey` false leaves the keyboard alone: a diagnostic run next to another switcher. */
  start(withHotkey: boolean): boolean;
  /** The chord that opens the picker: a virtual key code and a mask of MOD_ constants. */
  setHotkey(keyCode: i32, modifiers: i32): void;
  /** The next chord pressed is reported as EVENT_RECORDED instead of doing anything; false stops listening. */
  recordHotkey(on: boolean): void;
  /** Ends a hold from the program's side: the tap stops swallowing keys. */
  disarm(): void;
  /** Sweeps the windows on a worker; EVENT_WINDOWS says the result is ready. */
  refresh(): void;
  /** The last sweep, a JSON array of windows, front to back. */
  windows(): string;
  /** A JSON array of [id, pid] of every window the server has right now, listed or not: asked at the moment of use, never stale. */
  existing(): string;
  frontmostPid(): i32;
  /** A PNG of the app's icon, empty when the app is gone. */
  appIcon(pid: i32): u8[];
  /** The window a release goes to. The tap raises it itself, on its own thread, so going to a window never waits for a frame; -1: none, EVENT_COMMIT then says 0 and the program decides. */
  setTarget(id: i32, pid: i32): void;
  /** Raises this exact window, across Spaces, restoring it when minimized or hidden. */
  focus(id: i32, pid: i32): void;
  /** Shows the window over everything on the screen under the pointer, on every Space, without taking the focus from the app in front. */
  /** Puts the window in place, still unseen; revealOverlay shows it. */
  showOverlay(width: i32, height: i32): void;
  revealOverlay(): void;
  resizeOverlay(width: i32, height: i32): void;
  /** Takes the window off the screen and gives it its ordinary level back: zinc:system/window only knows windows at an ordinary level. */
  hideOverlay(): void;
  /** The blur behind the window follows the app's theme rather than the system's. */
  setDarkAppearance(dark: boolean): void;
  /** Back to an ordinary window, for the settings. */
  endOverlay(): void;
}
export default requireNative<Spec>('DesktopWindows');
