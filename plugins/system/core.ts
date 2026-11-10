// zinc:system: desktop integration (docs/reports/system-integration.md). This module is the core every target has: which backend answers, whether a feature is supported, the typed
// event stream, and `call`, the one door to the native side. The feature modules (zinc:system/tray, ...) are thin typed wrappers over `call`; ops.json lists every op with the
// permission it needs, the native side refuses an op whose permission was not compiled in.
import createSystem, { Spec } from './native/system.spec';
import { GRANTED } from 'zinc:system/permissions';
import { APP, SCOPES } from 'zinc:system/app';
import * as sys from 'zinc:sys';

let native:Spec|null=null;
function system():Spec {
  if(native===null)native=createSystem();
  return native;
}

enum Configuration { Cold, Configuring, Ready }
let configuration = Configuration.Cold;
function configure(): void {
  if (configuration === Configuration.Ready) return;
  if (configuration === Configuration.Configuring) throw new Error('Recursive System configuration');
  configuration = Configuration.Configuring;
  try {
    const S=system();
    S.setPermissions(GRANTED);
    S.setApp(APP);
    S.setScopes(SCOPES);
    configuration = Configuration.Ready;
  } finally { if (configuration === Configuration.Configuring) configuration = Configuration.Cold; }
}

export class SystemError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'SystemError'; this.code = code; }
}

/** 'sim' (recording simulator), 'macos' or 'linux'. */
export function backendName(): string { configure(); return system().backend(); }

/** Whether the backend can do `feature` (notification, tray, menu, dialog, ...). Never throws. */
export function supports(feature: string): boolean { configure(); return system().supports(feature); }

/** Runs one op; the arguments and the result are JSON values. Throws SystemError('denied' | 'unsupported' | 'failed'). */
export function call(op: string, args: unknown): unknown {
  configure();
  const text = system().call(op, JSON.stringify(args));
  const r = JSON.parse(text);
  const err = r.error;
  if (err !== undefined) throw new SystemError(err.code, err.message);
  return r;
}

let closePrevented = false;
/** Inside a 'window' close-requested handler: keeps the window open (close to tray). Without it the close goes ahead after the handlers. */
export function preventClose(): void { closePrevented = true; }

/** Like `call`, with the arguments already encoded as JSON text (the menu model is encoded by hand: roles expanded, ids and accelerators checked). */
export function callRaw(op: string, json: string): unknown {
  configure();
  const r = JSON.parse(system().call(op, json));
  const err = r.error;
  if (err !== undefined) throw new SystemError(err.code, err.message);
  return r;
}

import { EventSubscriptions } from './subscriptions';
let subscriptions:EventSubscriptions|null=null;
function eventSubscriptions():EventSubscriptions {
  if(subscriptions===null)subscriptions=new EventSubscriptions();
  return subscriptions;
}
enum Listening { Cold, Active }
let listening = Listening.Cold;
function listen(): void {
  if (listening === Listening.Active) return;
  configure();
  system().onEvent((json: string) => {
    const e = JSON.parse(json);
    const closing = e.type === 'window' && e.args[0] === 'close-requested';
    if (closing) closePrevented = false;
    eventSubscriptions().dispatch(e.type, e.args);
    if (closing && !closePrevented) call('window.confirmClose', {});
  });
  listening = Listening.Active;
}
/** Runs the 'window' close-requested handlers as the close button would; true when none vetoed (preventClose). Quit of the app menu goes
 *  through it, as Cmd+Q without a menu of the program's own does (the HAL's quit event): the program saves or asks before it ends. */
export function requestClose(): boolean {
  closePrevented = false;
  eventSubscriptions().dispatch('window', ['close-requested']);
  return !closePrevented;
}
/** Subscribes to an event: 'menu-click', 'tray-click', 'notification-click', 'shortcut', 'drop', 'open-url', 'second-instance', 'power', 'appearance', 'window'... `args` are the event's words. */
export function on(type: string, handler: (args: string[]) => void): () => void {
  listen();
  return eventSubscriptions().on(type, handler);
}

/** Ends the program with `code`. */
export function quit(code: i32 = 0): void { sys.exit(code); }

/** The live state of what the program has set up (application menu, tray items, dock badge, window), as JSON text: the selftest of the real backends (tests/t2/desktop.sh). Parts the program
 *  has no permission for are left out. */
export function selftest(): string {
  const parts: string[] = [];
  const grab = (name: string, op: string, field: string): void => {
    try { const r = call(op, {}) as { text?: string }; parts.push('"' + name + '":' + JSON.stringify(r)); } catch (e) { /* not permitted or not set up */ }
  };
  grab('menu', 'menu.dump', 'text'); grab('tray', 'tray.dump', 'trays'); grab('dock', 'dock.getBadge', 'text'); grab('window', 'window.dump', 'text');
  return '{' + parts.join(',') + '}';
}
