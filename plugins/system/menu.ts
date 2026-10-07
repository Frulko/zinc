// zinc:system/menu: the application menu and context menus (docs/reports/system-integration.md 4.3). One serializable model: items carry ids, handlers register by id here and the native
// side only ever sends ids back. Roles expand here (labels, accelerators), so the simulator, the macOS menu bar and the UI kit's menu bar all show the same menus.
import { callRaw, on, supports } from 'zinc:system';
import { APP } from 'zinc:system/app';
import { parseAccelerator, formatAccelerator, macModifiers } from './accelerator';
import { roleInfo, menuRoles, menuTitle, isNativeRole } from './menu-roles';

export class Item {
  /** Reported with the click; items with a role get 'role:<name>' when they have none. */
  id: string = '';
  label: string = '';
  /** A leaf role (quit, copy, minimize...) or a menu role (appMenu, editMenu, viewMenu, windowMenu, fileMenu, help) that expands to its standard items. */
  role: string = '';
  /** 'normal' | 'separator' | 'checkbox' | 'radio'. */
  type: string = 'normal';
  accelerator: string = '';
  enabled: boolean = true;
  checked: boolean = false;
  visible: boolean = true;
  submenu: Item[] = [];
  hasSubmenu: boolean = false;
  constructor(label: string) { this.label = label; }
}
/** A role item: `role('quit')`, `role('editMenu')`. */
export function role(name: string): Item { const i = new Item(''); i.role = name; return i; }
export function separator(): Item { const i = new Item(''); i.type = 'separator'; return i; }
export function item(id: string, label: string, accelerator: string = ''): Item { const i = new Item(label); i.id = id; i.accelerator = accelerator; return i; }
export function submenu(label: string, items: Item[]): Item { const i = new Item(label); i.submenu = items; i.hasSubmenu = true; return i; }

/** Whether the system draws the menu (macOS: the menu bar; elsewhere the UI kit draws it from the stored model). */
export const native: boolean = supports('menubar');

function appName(): string {
  const at = APP.indexOf('"name":"');
  if (at < 0) return 'App';
  const from = at + 8;
  return APP.slice(from, APP.indexOf('"', from));
}
const MAC: boolean = true;   // ponytail: the accelerator text is resolved for macOS here; the kit's menu bar resolves CmdOrCtrl itself

function esc(s: string): string {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) o += '\\"'; else if (c === 92) o += '\\\\'; else if (c === 10) o += '\\n'; else o += s.charAt(i);
  }
  return o + '"';
}

/** One item as JSON, roles expanded; an invalid accelerator is an error naming it. */
function encode(it: Item, app: string): string {
  if (it.type === 'separator') return '{"type":"separator"}';
  let label = it.label, accel = it.accelerator, id = it.id;
  if (it.role.length > 0 && menuRoles(it.role).length > 0 || it.role === 'fileMenu' || it.role === 'help') {   // a standard menu
    let inner = '';
    const roles = menuRoles(it.role);
    for (let i = 0; i < roles.length; i++) inner += (i > 0 ? ',' : '') + (roles[i].length === 0 ? '{"type":"separator"}' : encode(role(roles[i]), app));
    return '{"label":' + esc(it.label.length > 0 ? it.label : menuTitle(it.role, app)) + ',"menuRole":' + esc(it.role) + ',"submenu":[' + inner + ']}';
  }
  let native = false;
  if (it.role.length > 0) {
    const info = roleInfo(it.role, app);
    if (info === null) throw new Error("menu: unknown role '" + it.role + "'");
    if (label.length === 0) label = info.label;
    if (accel.length === 0) accel = info.accelerator;
    if (id.length === 0) id = 'role:' + it.role;
    native = isNativeRole(it.role);
  }
  let json = '{"label":' + esc(label) + ',"id":' + esc(id) + ',"type":' + esc(it.type);
  if (it.role.length > 0) json += ',"role":' + esc(it.role) + ',"native":' + (native ? 'true' : 'false');
  if (accel.length > 0) {
    const a = parseAccelerator(accel, MAC);
    if (!a.ok) throw new Error('menu item ' + esc(label) + ': ' + a.error);
    json += ',"accelerator":' + esc(formatAccelerator(a)) + ',"key":' + esc(a.key) + ',"mods":' + macModifiers(a);
  }
  if (!it.enabled) json += ',"enabled":false';
  if (!it.visible) json += ',"visible":false';
  if (it.checked) json += ',"checked":true';
  if (it.hasSubmenu) {
    json += ',"submenu":[';
    for (let i = 0; i < it.submenu.length; i++) json += (i > 0 ? ',' : '') + encode(it.submenu[i], app);
    json += ']';
  }
  return json + '}';
}
function encodeAll(items: Item[]): string {
  const app = appName();
  let json = '[';
  for (let i = 0; i < items.length; i++) json += (i > 0 ? ',' : '') + encode(items[i], app);
  return json + ']';
}

const ids: string[] = [];
const cbs: ((source: string) => void)[][] = [];
let wired = false;
let hasApp = false;
function wire(): void {
  if (wired) return;
  wired = true;
  on('menu-click', (a: string[]) => {
    const i = ids.indexOf(a[0]);
    if (i < 0) return;
    const source = a.length > 1 ? a[1] : 'app';
    for (const cb of cbs[i]) cb(source);
  });
}
/** Runs `cb` when the item `id` is chosen (from the menu bar, a context menu, the tray or the dock: `source`). Role items report 'role:<name>'. */
export function onClick(id: string, cb: (source: string) => void): void {
  wire();
  let i = ids.indexOf(id);
  if (i < 0) { i = ids.length; ids.push(id); cbs.push([]); }
  cbs[i].push(cb);
}

/** Replaces the application menu. */
export function setApp(template: Item[]): void {
  wire();
  hasApp = true;
  callRaw('menu.setApp', '{"template":' + encodeAll(template) + '}');
}
/** Changes one item by id without rebuilding the menu: a new label, enabled, checked. */
export function updateItem(id: string, label: string, enabled: boolean, checked: boolean): void {
  callRaw('menu.update', '{"id":' + esc(id) + ',"props":{"label":' + esc(label) + ',"enabled":' + (enabled ? 'true' : 'false') + ',"checked":' + (checked ? 'true' : 'false') + '}}');
}
/** The standard menus (app, edit, view, window) from the app name; what an app without its own menu gets. */
export function defaultMenu(): void { setApp([role('appMenu'), role('editMenu'), role('viewMenu'), role('windowMenu')]); }
/** Whether the application menu was set by the program (when not, the host applies defaultMenu). */
export function isCustomized(): boolean { return hasApp; }

/** A context menu at (x, y): resolves with the chosen id, or '' when dismissed. */
export async function popup(items: Item[], x: number, y: number): Promise<string> {
  wire();
  const r = callRaw('menu.popup', '{"template":' + encodeAll(items) + ',"x":' + x + ',"y":' + y + '}') as { id: string | null };
  return r.id === null ? '' : r.id;
}

// an app that imports this module and sets no menu of its own gets the standard one, with the name from zinc.json: applied once the program's own setup has run
setTimeout(() => { if (!hasApp) defaultMenu(); }, 0);
