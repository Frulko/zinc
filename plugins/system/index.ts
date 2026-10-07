// zinc:system: desktop integration (docs/reports/system-integration.md). This module is the core every target has: which backend answers, whether a feature is supported, the typed
// event stream, and `call`, the one door to the native side. The feature modules (zinc:system/tray, ...) are thin typed wrappers over `call`; ops.json lists every op with the
// permission it needs, the native side refuses an op whose permission was not compiled in.
import S from './native/system.spec';
import { GRANTED } from 'zinc:system/permissions';
import { APP } from 'zinc:system/app';
import * as sys from 'zinc:sys';

S.setPermissions(GRANTED);
S.setApp(APP);

export class SystemError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'SystemError'; this.code = code; }
}

/** 'sim' (recording simulator), 'macos' or 'linux'. */
export const backend: string = S.backend();

/** Whether the backend can do `feature` (notification, tray, menu, dialog, ...). Never throws. */
export function supports(feature: string): boolean { return S.supports(feature); }

/** Runs one op; the arguments and the result are JSON values. Throws SystemError('denied' | 'unsupported' | 'failed'). */
export function call(op: string, args: unknown): unknown {
  const text = S.call(op, JSON.stringify(args));
  const r = JSON.parse(text);
  const err = r.error;
  if (err !== undefined) throw new SystemError(err.code, err.message);
  return r;
}

let closePrevented = false;
/** Inside a 'window' close-requested handler: keeps the window open (close to tray). Without it the close goes ahead after the handlers. */
export function preventClose(): void { closePrevented = true; }

const handlers: ((args: string[]) => void)[][] = [];
const names: string[] = [];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  S.onEvent((json: string) => {
    const e = JSON.parse(json);
    const closing = e.type === 'window' && e.args[0] === 'close-requested';
    if (closing) closePrevented = false;
    const i = names.indexOf(e.type);
    if (i >= 0) {
      const list = handlers[i];
      for (let k = 0; k < list.length; k++) list[k](e.args);
    }
    // the HAL kept the window open while the handlers ran: unless one of them vetoed, the close goes through now
    if (closing && !closePrevented) call('window.confirmClose', {});
  });
}
/** Subscribes to an event: 'menu-click', 'tray-click', 'notification-click', 'shortcut', 'drop', 'open-url', 'second-instance', 'power', 'appearance', 'window'... `args` are the event's words. */
export function on(type: string, handler: (args: string[]) => void): void {
  listen();
  let i = names.indexOf(type);
  if (i < 0) { i = names.length; names.push(type); handlers.push([]); }
  handlers[i].push(handler);
}

/** Ends the program with `code`. */
export function quit(code: i32 = 0): void { sys.exit(code); }
