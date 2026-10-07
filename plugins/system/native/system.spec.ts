// zinc:system native side: three calls carry every operation as JSON text, so the ABI never changes when a feature is added (docs/reports/system-integration.md section 3).
// The backend is the recording simulator (ZINC_DETERMINISTIC, ZINC_HEADLESS or ZINC_SYSTEM=sim); the macOS and Linux backends join it in their own tasks.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The permission ids compiled into the program (zinc.json "permissions"), comma separated: an op whose id is not in the list is refused here, not only by the compiler. */
  setPermissions(csv: string): void;
  /** The `app` object of zinc.json as JSON text (id, name, window...): the backend logs the window request it was created with. */
  setApp(json: string): void;
  /** Whether this backend can do `feature` (notification, tray, ...). */
  supports(feature: string): boolean;
  /** Runs `op` with a JSON object of arguments; returns JSON: the result, or {"error":{"code":"denied"|"unsupported"|"failed","message":"..."}}. */
  call(op: string, json: string): string;
  /** Which backend answers: 'sim', 'macos' or 'linux'. */
  backend(): string;
  /** Events as JSON {"type": "...", "args": [...]}: menu clicks, tray clicks, notification actions, shortcuts, drops, deep links, power and appearance changes. */
  onEvent(cb: (event: string) => void): void;
}
export default requireNative<Spec>('System');
