// A small Chrome DevTools Protocol client: headless Chrome started with zinc:process, driven over its WebSocket (zinc:socket), one tab.
// The same protocol as tools/cdp.py (which uses a pipe); here a port, since a Zinc child has no extra file descriptors.
import * as proc from 'zinc:process';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { WebSocket, MessageEvent } from 'zinc:socket';

const CHROME_PATHS: string[] = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

/** The Chrome to run: --chrome or $CHROME, else the usual places; '' when none. */
export function findChrome(given: string): string {
  if (given !== '') return fs.exists(given) ? given : '';
  if (sys.env('CHROME') !== '' && fs.exists(sys.env('CHROME'))) return sys.env('CHROME');
  for (const p of CHROME_PATHS) if (fs.exists(p)) return p;
  return '';
}

class Call {
  id: i32;
  resolve: (r: any) => void;
  reject: (e: Error) => void;
  constructor(id: i32, resolve: (r: any) => void, reject: (e: Error) => void) { this.id = id; this.resolve = resolve; this.reject = reject; }
}
class Waiter {
  method: string;
  resolve: (ok: boolean) => void;
  constructor(method: string, resolve: (ok: boolean) => void) { this.method = method; this.resolve = resolve; }
}

export function sleep(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }

export class Chrome {
  child: proc.Process | null = null;
  ws: WebSocket | null = null;
  session: string = '';
  next: i32 = 1;
  calls: Call[] = [];
  waiters: Waiter[] = [];
  alive: boolean = false;

  /** Starts Chrome headless with its own profile in `profile` and opens one tab. */
  async start(chrome: string, profile: string): Promise<void> {
    fs.mkdir(profile, true);
    const p = proc.spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--disable-background-networking', 'about:blank'], {});
    this.child = p;
    const url = await new Promise<string>((resolve, reject) => {
      let done = false;
      p.onStderr((line: string) => {
        const at = line.indexOf('ws://');
        if (!done && line.indexOf('DevTools listening on') >= 0 && at >= 0) { done = true; resolve(line.slice(at).trim()); }
      });
      p.onExit((code: i32) => { this.alive = false; if (!done) { done = true; reject(new Error('Chrome exited (' + code.toString() + ') before it listened')); } });
      setTimeout(() => { if (!done) { done = true; reject(new Error('Chrome did not start in 20 s')); } }, 20000);
    });
    const ws = new WebSocket(url);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => { resolve(); };
      ws.onerror = (e) => { reject(new Error('cannot reach Chrome: ' + e.message)); };
    });
    ws.onmessage = (e: MessageEvent) => { this.receive(e.data); };
    ws.onclose = () => { this.alive = false; for (const c of this.calls) c.reject(new Error('Chrome closed the connection')); this.calls = []; };
    this.alive = true;
    const target = await this.call('Target.createTarget', '{"url":"about:blank"}', false);
    const attached = await this.call('Target.attachToTarget', '{"targetId":' + JSON.stringify('' + target.targetId) + ',"flatten":true}', false);
    this.session = '' + attached.sessionId;
    await this.call('Page.enable', '{}', true);
  }

  receive(text: string): void {
    const m = JSON.parse(text);
    if (m.id !== undefined) {
      const id: i32 = m.id as i32;
      for (let i: i32 = 0; i < this.calls.length; i++) {
        const c = this.calls[i];
        if (c.id !== id) continue;
        this.calls.splice(i, 1);
        if (m.error !== undefined) c.reject(new Error('' + m.error.message)); else c.resolve(m.result);
        return;
      }
      return;
    }
    if (m.method === undefined) return;
    const method = '' + m.method;
    const keep: Waiter[] = [];
    for (const w of this.waiters) { if (w.method === method) w.resolve(true); else keep.push(w); }
    this.waiters = keep;
  }

  /** One CDP command; `params` is its JSON text. Rejects with Chrome's error message. */
  call(method: string, params: string, onPage: boolean = true): Promise<any> {
    const id = this.next++;
    const ws = this.ws;
    return new Promise<any>((resolve, reject) => {
      if (ws === null || !this.alive) { reject(new Error('Chrome is not running')); return; }
      const c = new Call(id, resolve, reject);
      this.calls.push(c);
      // a command Chrome never answers must not hold the relay's one tab forever (and the HTTP server answers 408 after 10 s anyway)
      setTimeout(() => { const i = this.calls.indexOf(c); if (i >= 0) { this.calls.splice(i, 1); reject(new Error(method + ': no answer from Chrome in 9 s')); } }, 9000);
      const s = onPage && this.session !== '' ? ',"sessionId":' + JSON.stringify(this.session) : '';
      (ws as WebSocket).send('{"id":' + id.toString() + ',"method":' + JSON.stringify(method) + ',"params":' + params + s + '}');
    });
  }

  /** Resolves true at the next event `method`, false after `ms`. Register it before the command that causes the event. */
  event(method: string, ms: i32): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const w = new Waiter(method, resolve);
      this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); resolve(false); } }, ms);
    });
  }

  /** Runs `expression` in the page and returns its value as a string (the expression should give a string, e.g. JSON.stringify(...)). */
  async evaluate(expression: string): Promise<string> {
    const r = await this.call('Runtime.evaluate', '{"expression":' + JSON.stringify(expression) + ',"returnByValue":true,"awaitPromise":true}');
    if (r.exceptionDetails !== undefined) throw new Error('page script failed: ' + ('' + r.exceptionDetails.text));
    return r.result.value === undefined ? '' : '' + r.result.value;
  }

  stop(): void {
    const p = this.child;
    if (p !== null) p.kill(15);
    this.alive = false;
  }
}
