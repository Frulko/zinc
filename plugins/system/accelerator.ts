// Accelerators ("CmdOrCtrl+Shift+N"): one parser shared by menus, global shortcuts and the UI kit's in-window handling (docs/reports/system-integration.md 4.3).
// Grammar: `Mod+Mod+Key`; modifiers CmdOrCtrl (CommandOrControl), Cmd (Command), Ctrl (Control), Alt (Option), Shift, Super (Meta); keys A-Z, 0-9, F1-F24 and the names below.
// `+` itself is written `Plus`. Parsing never throws: it returns an Accelerator with `ok` false and `error` saying why.

export class Accelerator {
  ok: boolean = false;
  error: string = '';
  ctrl: boolean = false;
  alt: boolean = false;
  shift: boolean = false;
  meta: boolean = false;   // Cmd on macOS, the Windows/Super key elsewhere
  /** The key in canonical form: 'A', '7', 'F5', 'Space', 'Plus', 'Left'... */
  key: string = '';
}

const NAMED: string[] = ['Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
  'Plus', 'Minus', 'Equal', 'Comma', 'Period', 'Slash', 'Backslash', 'Semicolon', 'Quote', 'Backquote', 'BracketLeft', 'BracketRight'];
const ALIASES: string[][] = [['return', 'Enter'], ['esc', 'Escape'], ['del', 'Delete'], ['ins', 'Insert'], ['pgup', 'PageUp'], ['pgdn', 'PageDown'], ['pageup', 'PageUp'], ['pagedown', 'PageDown'],
  ['arrowup', 'Up'], ['arrowdown', 'Down'], ['arrowleft', 'Left'], ['arrowright', 'Right']];

function fail(a: Accelerator, why: string): Accelerator { a.ok = false; a.error = why; return a; }

/** Reads the key part of a token: the canonical key name or '' when it is not a key. */
function keyOf(token: string): string {
  const lower = token.toLowerCase();
  if (token.length === 1) {
    const c = token.charCodeAt(0);
    if (c >= 97 && c <= 122) return String.fromCharCode(c - 32);   // a-z
    if (c >= 65 && c <= 90) return token;                          // A-Z
    if (c >= 48 && c <= 57) return token;                          // 0-9
    return '';
  }
  if (lower.length >= 2 && lower.charCodeAt(0) === 102) {          // f1..f24
    const n = parseInt(lower.slice(1));
    if (n >= 1 && n <= 24 && ('f' + n) === lower) return 'F' + n;
  }
  for (const name of NAMED) if (name.toLowerCase() === lower) return name;
  for (const pair of ALIASES) if (pair[0] === lower) return pair[1];
  return '';
}

/** Parses an accelerator. `mac` decides what CmdOrCtrl means (Cmd on macOS, Ctrl elsewhere). */
export function parseAccelerator(text: string, mac: boolean): Accelerator {
  const a = new Accelerator();
  if (text.length === 0) return fail(a, 'empty accelerator');
  const parts = text.split('+');
  let keyAt: i32 = -1;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].trim();
    if (t.length === 0) return fail(a, "empty part in '" + text + "' (write the plus key as Plus)");
    const lower = t.toLowerCase();
    let mod = '';
    if (lower === 'cmdorctrl' || lower === 'commandorcontrol') mod = mac ? 'meta' : 'ctrl';
    else if (lower === 'cmd' || lower === 'command' || lower === 'super' || lower === 'meta') mod = 'meta';
    else if (lower === 'ctrl' || lower === 'control') mod = 'ctrl';
    else if (lower === 'alt' || lower === 'option') mod = 'alt';
    else if (lower === 'shift') mod = 'shift';
    if (mod.length > 0) {
      if (mod === 'meta') { if (a.meta) return fail(a, "modifier repeated in '" + text + "'"); a.meta = true; }
      else if (mod === 'ctrl') { if (a.ctrl) return fail(a, "modifier repeated in '" + text + "'"); a.ctrl = true; }
      else if (mod === 'alt') { if (a.alt) return fail(a, "modifier repeated in '" + text + "'"); a.alt = true; }
      else { if (a.shift) return fail(a, "modifier repeated in '" + text + "'"); a.shift = true; }
      continue;
    }
    const k = keyOf(t);
    if (k.length === 0) return fail(a, "unknown key '" + t + "' in '" + text + "'");
    if (a.key.length > 0) return fail(a, "two keys in '" + text + "'");
    a.key = k;
    keyAt = i;
  }
  if (a.key.length === 0) return fail(a, "no key in '" + text + "'");
  if (keyAt !== parts.length - 1) return fail(a, "the key must come last in '" + text + "'");
  a.ok = true;
  return a;
}

/** The canonical text of an accelerator: modifiers in the order Ctrl, Alt, Shift, Cmd then the key ('Ctrl+Alt+Shift+Cmd+K'). */
export function formatAccelerator(a: Accelerator): string {
  let s = '';
  if (a.ctrl) s += 'Ctrl+';
  if (a.alt) s += 'Alt+';
  if (a.shift) s += 'Shift+';
  if (a.meta) s += 'Cmd+';
  return s + a.key;
}

/** NSEventModifierFlags of the modifiers: Shift 1<<17, Ctrl 1<<18, Alt 1<<19, Cmd 1<<20. */
export function macModifiers(a: Accelerator): i32 {
  let m: i32 = 0;
  if (a.shift) m |= 131072;
  if (a.ctrl) m |= 262144;
  if (a.alt) m |= 524288;
  if (a.meta) m |= 1048576;
  return m;
}
