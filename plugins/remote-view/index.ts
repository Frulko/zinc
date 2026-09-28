// zinc:remote — watch and drive a Zinc app that runs with the remote display (plugins/display-remote), on this
// machine or on a device: its screen is a runtime image (gfx.drawImage), input goes back over the same connection.
// docs/plugins/remote.md.
import { drawImage, rect, pointerX, pointerY, pointerDown, wheel, isDown, Btn } from 'zinc:gfx';
import R from './native/remote.spec';

/** An app announcing itself on the network (display-remote beacon). */
export class App {
  name: string = ''; target: string = ''; host: string = '';
  port: i32 = 0; pid: i32 = 0; width: i32 = 0; height: i32 = 0;
  /** Date.now() of the last beacon. */
  seen: number = 0;
  get key(): string { return `${this.host}:${this.port}`; }
}

const openCbs: ((s: i32) => void)[] = [];
const closeCbs: ((s: i32) => void)[] = [];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  R.onEvent((s: i32, kind: string) => {
    if (kind === 'open') { for (const f of openCbs) f(s); } else { for (const f of closeCbs) f(s); }
  });
}

/** Button index (zinc:gfx Btn) for a key name: DOM names ('ArrowLeft', ' ', 'Enter', 'KeyA'...) or Btn names. */
export function buttonOf(key: string): i32 {
  switch (key) {
    case 'ArrowUp': case 'Up': case 'w': case 'KeyW': return Btn.Up;
    case 'ArrowDown': case 'Down': case 's': case 'KeyS': return Btn.Down;
    case 'ArrowLeft': case 'Left': case 'a': case 'KeyA': return Btn.Left;
    case 'ArrowRight': case 'Right': case 'd': case 'KeyD': return Btn.Right;
    case ' ': case 'Space': case 'A': case 'z': return Btn.A;
    case 'B': case 'x': return Btn.B;
    case 'X': case 'c': return Btn.X;
    case 'Y': case 'v': return Btn.Y;
    case 'L': case 'q': return Btn.L;
    case 'R': case 'e': return Btn.R;
    case 'Enter': case 'Start': return Btn.Start;
    case 'Tab': case 'Select': return Btn.Select;
  }
  return -1;
}

export class Session {
  readonly id: i32;
  private held: i32 = 0;
  private lastX: number = -1;
  private lastY: number = -1;
  private lastDown: boolean = false;
  private dragging: boolean = false;
  constructor(id: i32) { this.id = id; }

  /** Runtime image with the remote screen (-1 until the first frame); draw it with gfx.drawImage or view(). */
  get image(): i32 { return R.image(this.id); }
  get width(): i32 { return R.width(this.id); }
  get height(): i32 { return R.height(this.id); }
  get name(): string { return R.name(this.id); }
  get connected(): boolean { return R.connected(this.id); }
  /** Frames received per second, ping round trip in ms (queued behind frames: the input-to-screen delay), KiB/s. */
  get fps(): number { return R.fps(this.id); }
  get latency(): number { return R.rtt(this.id); }
  get kbps(): number { return R.kbps(this.id); }
  get frames(): i32 { return R.frames(this.id); }
  /** Reconnect every second when the connection drops (default true). */
  set reconnect(on: boolean) { R.setReconnect(this.id, on); }

  /** Pointer in the remote app's logical pixels. */
  sendPointer(x: number, y: number, down: boolean, button: i32): void { R.pointer(this.id, x, y, down, button); }
  sendWheel(dy: number): void { R.wheel(this.id, dy); }
  /** Holds or releases a key; the remote sees zinc:gfx buttons (arrows/WASD, Space=A, Enter=Start...). */
  sendKey(key: string, down: boolean): void {
    const b = buttonOf(key);
    if (b < 0) return;
    this.sendButtons(down ? this.held | (1 << b) : this.held & ~(1 << b));
  }
  /** Every held button at once (bit i = Btn i). */
  sendButtons(mask: i32): void { if (mask !== this.held) { this.held = mask; R.buttons(this.id, mask); } }

  onOpen(cb: () => void): void { listen(); const id = this.id; openCbs.push((s: i32) => { if (s === id) cb(); }); }
  onClose(cb: () => void): void { listen(); const id = this.id; closeCbs.push((s: i32) => { if (s === id) cb(); }); }
  close(): void { R.close(this.id); }

  /** Draws the remote screen fitted in the box (aspect kept, centered) and forwards the local pointer, wheel and
   *  buttons while the pointer is over it. Use as a zinc:ui canvas: onDraw={(x, y, w, h) => s.view(x, y, w, h)}. */
  view(x: number, y: number, w: number, h: number): void {
    const rw = this.width, rh = this.height, img = this.image;
    if (rw <= 0 || rh <= 0 || img < 0) return;
    const k = Math.min(w / rw, h / rh);
    const dw = rw * k, dh = rh * k, ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
    rect(x, y, w, h, 0x000000);
    drawImage(img, ox, oy, dw, dh, 255, 0);
    const px = pointerX(), py = pointerY(), down = pointerDown();
    const inside = px >= ox && py >= oy && px < ox + dw && py < oy + dh;
    if (down && !this.lastDown) this.dragging = inside;
    if (inside || this.dragging || (this.lastDown && !down)) {
      const rx = Math.max(0, Math.min(rw - 1, (px - ox) / k)), ry = Math.max(0, Math.min(rh - 1, (py - oy) / k));
      const d = down && this.dragging;
      if (rx !== this.lastX || ry !== this.lastY || d !== this.lastDown) this.sendPointer(rx, ry, d, 0);
      this.lastX = rx; this.lastY = ry;
      const wh = wheel();
      if (wh !== 0) this.sendWheel(wh);
    }
    this.lastDown = down;
    if (!down) this.dragging = false;
    let mask = 0;
    if (inside) for (let b = 0; b < 12; b++) if (isDown(b as Btn)) mask |= 1 << b;
    this.sendButtons(mask);
  }
}

/** Connects to an app (host, port of its display-remote); resolves on its first message. Rejects when unreachable.
 *  token: the app's display-remote token, if it has one (default: the ZINC_REMOTE_TOKEN environment variable). */
export async function connect(host: string, port: i32, token: string = ''): Promise<Session> {
  const id = await R.connect(host, port, token);
  return new Session(parseInt(id));
}

const apps: App[] = [];
let discoverCb: ((apps: App[]) => void) | null = null;
let pruneTimer: i32 = -1;
/** Lists the apps announcing themselves (this machine and the LAN); cb gets the whole list whenever it changes.
 *  An app disappears 3 s after its last beacon. */
export function discover(cb: (apps: App[]) => void): void {
  discoverCb = cb;
  R.discover(true, (beacon: string, host: string) => {
    const f = beacon.split('\t');
    if (f.length < 7) return;
    const port = parseInt(f[3]);
    let a: App | null = null;
    for (const x of apps) if (x.host === host && x.port === port) a = x;
    const fresh = a === null;
    const app = a === null ? new App() : a;
    const changed = fresh || app.name !== f[1] || app.pid !== parseInt(f[4]);
    app.name = f[1]; app.target = f[2]; app.host = host; app.port = port;
    app.pid = parseInt(f[4]); app.width = parseInt(f[5]); app.height = parseInt(f[6]);
    app.seen = Date.now();
    if (fresh) apps.push(app);
    if (changed) notify();
  });
  if (pruneTimer < 0) pruneTimer = setInterval(() => {
    const now = Date.now();
    const n = apps.length;
    for (let i = apps.length - 1; i >= 0; i--) if (now - apps[i].seen > 3000) apps.splice(i, 1);
    if (apps.length !== n) notify();
  }, 1000);
}
function notify(): void {
  const cb = discoverCb;
  if (cb !== null) cb(apps.slice());
}
export function stopDiscovery(): void {
  R.discover(false, (_b: string, _h: string) => {});
  discoverCb = null;
  if (pruneTimer >= 0) { clearInterval(pruneTimer); pruneTimer = -1; }
  apps.length = 0;
}
