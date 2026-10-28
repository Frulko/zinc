import * as ui from 'zinc:ui';

/** Explicit ownership: captured navigation never falls through to Zinc focus traversal. */
export class KeyboardCapture {
  active: boolean = true;
  constructor(private send: (key: string) => void, private changed: (active: boolean) => void) {}
  set(active: boolean): void { this.active = active; if (active) ui.focusNode(-1); this.changed(active); }
  key(key: string, shift: boolean, primary: boolean, alt: boolean): boolean {
    if (key === 'F6') { this.set(!this.active); return true; }
    if (!this.active || primary || alt) return false;
    this.send(key === 'Tab' ? (shift ? 'ArrowLeft' : 'ArrowRight') : key === ' ' ? 'Enter' : key);
    return true;
  }
}

/** Root handler runs before field editing; focus guard also prevents captured Tab traversal. */
export function installKeyboardCapture(capture: KeyboardCapture, toggleTrackpad: () => void): (e: ui.KeyEvent) => void {
  const handle = (e: ui.KeyEvent): void => {
    if (e.key === 'F7') { toggleTrackpad(); e.preventDefault(); return; }
    if (capture.key(e.key, e.shift, e.primary, e.alt)) e.preventDefault();
  };
  ui.onKey(handle);
  ui.onFocusChange((node: i32) => { if (capture.active && node >= 0) ui.focusNode(-1); });
  return handle;
}
