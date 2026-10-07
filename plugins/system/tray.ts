// zinc:system/tray: an icon in the menu bar (macOS) or the notification area (Linux, where a StatusNotifier host exists) with a menu and click events
// (docs/reports/system-integration.md 4.4). Items of the tray menu report through menu.onClick(id) with source 'tray'.
import { call, callRaw, on, supports } from 'zinc:system';
import { Item, encodeItems, onClick } from './menu';

export class Options {
  id: string;
  /** A PNG path, relative to where the program runs; '' draws a plain dot. macOS: a name ending in Template.png is a template image. */
  icon: string = '';
  /** macOS: monochrome image the system tints for light and dark menu bars. */
  template: boolean = true;
  tooltip: string = '';
  /** Text next to the icon (macOS). */
  title: string = '';
  menu: Item[] = [];
  hasMenu: boolean = false;
  /** true: the menu opens on a left click (and the click is not an event); false: a left click is an event, the menu opens on a right click. */
  menuOnLeftClick: boolean = true;
  constructor(id: string) { this.id = id; }
}

export class Tray {
  id: string;
  clickCbs: ((button: string, double: boolean) => void)[] = [];
  constructor(id: string) { this.id = id; }
  /** button: 'left' | 'right' | 'middle'. */
  onClick(cb: (button: string, double: boolean) => void): Tray { this.clickCbs.push(cb); return this; }
  setTitle(title: string): void { call('tray.update', { id: this.id, props: { title: title } }); }
  setTooltip(tooltip: string): void { call('tray.update', { id: this.id, props: { tooltip: tooltip } }); }
  setIcon(path: string, template: boolean = true): void { call('tray.update', { id: this.id, props: { icon: path, template: template } }); }
  setMenu(items: Item[]): void { callRaw('tray.update', '{"id":"' + this.id + '","props":{"menu":' + encodeItems(items) + '}}'); }
  destroy(): void { call('tray.remove', { id: this.id }); const i = live.indexOf(this); if (i >= 0) live.splice(i, 1); }
}

const live: Tray[] = [];
let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  // args: [button, double ('1' | '0'), tray id]; a scripted `tray-click left` has only the button and means the first tray
  on('tray-click', (a: string[]) => {
    const id = a.length > 2 ? a[2] : (live.length > 0 ? live[0].id : '');
    const double = a.length > 1 && a[1] === '1';
    for (const t of live) if (t.id === id) for (const cb of t.clickCbs) cb(a[0], double);
  });
  on('tray-double', (a: string[]) => { for (const t of live) if (live.length > 0 && t === live[0]) for (const cb of t.clickCbs) cb('left', true); });
}

export function isSupported(): boolean { return supports('tray'); }
/** Whether a tray can be shown now (Linux: a StatusNotifier host is running). */
export function isAvailable(): boolean { const r = call('tray.available', {}) as { available: boolean }; return r.available; }

export async function create(o: Options): Promise<Tray> {
  wire();
  const head = JSON.stringify({ id: o.id, icon: o.icon, template: o.template, tooltip: o.tooltip, title: o.title, menuOnLeftClick: o.menuOnLeftClick });
  callRaw('tray.create', o.hasMenu ? head.slice(0, head.length - 1) + ',"menu":' + encodeItems(o.menu) + '}' : head);
  const t = new Tray(o.id);
  live.push(t);
  return t;
}
export { onClick };
