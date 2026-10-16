// zinc:system/dialog: open, save and message dialogs (docs/reports/system-integration.md 4.6). Without a user (the simulator, a test) a dialog resolves as cancelled unless the script queued an
// answer. The paths the user picks join the fs scope of the session: an app limited to "fs": "user-picked" can read exactly those.
import { call, callRaw, on, supports } from 'zinc:system';

export class Filter {
  name: string; extensions: string[];
  constructor(name: string, extensions: string[]) { this.name = name; this.extensions = extensions; }
}
export class OpenOptions {
  title: string = '';
  defaultPath: string = '';
  multiple: boolean = false;
  directory: boolean = false;
  filters: Filter[] = [];
  /** Test hook: end the dialog by itself after this many ms (NSApp abortModal); 0 = wait for the user. */
  abortMs: number = 0;
}
export class SaveOptions {
  title: string = '';
  defaultPath: string = '';
  filters: Filter[] = [];
  abortMs: number = 0;
}
export class MessageOptions {
  title: string = '';
  message: string;
  detail: string = '';
  /** 'info' | 'warning' | 'error'. */
  kind: string = 'info';
  buttons: string[] = ['OK'];
  abortMs: number = 0;
  constructor(message: string) { this.message = message; }
}

export function isSupported(): boolean { return supports('dialogs'); }

/** The chosen paths, or null when the user cancelled. */
export async function open(o: OpenOptions): Promise<string[] | null> {
  const r = call('dialog.open', { title: o.title, defaultPath: o.defaultPath, multiple: o.multiple, directory: o.directory, filters: o.filters, abortMs: o.abortMs }) as { paths: string[] | null; pending?: string };
  if (r.pending !== undefined) return await picked(r.pending);
  return r.paths;
}

// A phone's picker (Android's document picker, iOS's document or photo picker) answers later, with the event dialog-result [token, paths as
// JSON]: the paths are copies in the app's cache, readable with zinc:fs.
const waiting: string[] = [];
const resolvers: ((paths: string[] | null) => void)[] = [];
let answering = false;
function picked(token: string): Promise<string[] | null> {
  if (!answering) {
    answering = true;
    on('dialog-result', (args: string[]) => {
      const i = waiting.indexOf(args[0]);
      if (i < 0) return;
      const done = resolvers[i];
      waiting.splice(i, 1);
      resolvers.splice(i, 1);
      done(JSON.parse(args[1]) as string[] | null);
    });
  }
  return new Promise<string[] | null>((resolve) => { waiting.push(token); resolvers.push(resolve); });
}
/** The chosen path, or null when the user cancelled. */
export async function save(o: SaveOptions): Promise<string | null> {
  const r = call('dialog.save', { title: o.title, defaultPath: o.defaultPath, filters: o.filters, abortMs: o.abortMs }) as { path: string | null };
  return r.path;
}
/** The index of the button pressed, -1 when the dialog was dismissed. */
export async function message(o: MessageOptions): Promise<number> {
  const r = call('dialog.message', { title: o.title, message: o.message, detail: o.detail, kind: o.kind, buttons: o.buttons, abortMs: o.abortMs }) as { button: number };
  return r.button;
}
/** Yes / no: true when the first button was pressed. */
export async function confirm(question: string): Promise<boolean> {
  const o = new MessageOptions(question);
  o.buttons = ['OK', 'Cancel'];
  return (await message(o)) === 0;
}
