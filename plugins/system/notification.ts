// zinc:system/notification: system notifications (docs/reports/system-integration.md 4.2). show() never throws for a refused permission: it resolves with delivered false and the reason.
// The same id replaces; clicks, actions, replies and closes arrive as events and reach the Notification object of that id.
import { call, on, supports } from 'zinc:system';

export class Action {
  id: string; title: string;
  constructor(id: string, title: string) { this.id = id; this.title = title; }
}
export class Options {
  id: string = '';
  title: string = '';
  subtitle: string = '';
  body: string = '';
  icon: string = '';
  group: string = '';
  actions: Action[] = [];
  /** A text field to reply in (macOS): the placeholder, or '' for none. */
  replyPlaceholder: string = '';
  constructor(title: string) { this.title = title; }
}

export class Notification {
  id: string;
  /** false when the system did not show it: see `reason` ('permission denied', 'permission not requested'...). */
  delivered: boolean;
  reason: string;
  clickCbs: (() => void)[] = [];
  actionCbs: ((action: string) => void)[] = [];
  replyCbs: ((text: string) => void)[] = [];
  closeCbs: ((reason: string) => void)[] = [];
  constructor(id: string, delivered: boolean, reason: string) { this.id = id; this.delivered = delivered; this.reason = reason; }
  onClick(cb: () => void): Notification { this.clickCbs.push(cb); return this; }
  onAction(cb: (action: string) => void): Notification { this.actionCbs.push(cb); return this; }
  onReply(cb: (text: string) => void): Notification { this.replyCbs.push(cb); return this; }
  /** reason: 'user' | 'timeout' | 'app'. */
  onClose(cb: (reason: string) => void): Notification { this.closeCbs.push(cb); return this; }
}

const live: Notification[] = [];
let wired = false;
function find(id: string): Notification | null {
  for (let i = live.length - 1; i >= 0; i--) if (live[i].id === id) return live[i];
  return null;
}
function wire(): void {
  if (wired) return;
  wired = true;
  on('notification-click', (a: string[]) => { const n = find(a[0]); if (n !== null) for (const cb of n.clickCbs) cb(); });
  on('notification-action', (a: string[]) => { const n = find(a[0]); if (n !== null) for (const cb of n.actionCbs) cb(a[1]); });
  on('notification-reply', (a: string[]) => { const n = find(a[0]); if (n !== null) for (const cb of n.replyCbs) cb(a[1]); });
  on('notification-close', (a: string[]) => { const n = find(a[0]); if (n !== null) for (const cb of n.closeCbs) cb(a.length > 1 ? a[1] : 'user'); });
}

let counter = 0;

export function isSupported(): boolean { return supports('notification'); }
/** 'osascript' (macOS without a bundle: no actions, no click events), 'native', 'dbus', 'sim'. */
export function backend(): string { const r = call('notification.backend', {}) as { backend: string }; return r.backend; }

/** 'granted' | 'denied' | 'default' (not asked yet) | 'unsupported'. macOS shows the OS prompt the first time. */
export async function requestPermission(): Promise<string> {
  const r = call('notification.requestPermission', {}) as { state: string };
  return r.state;
}

export async function show(o: Options): Promise<Notification> {
  wire();
  const id = o.id.length > 0 ? o.id : 'zn-' + (++counter);
  const r = call('notification.notify', { id: id, title: o.title, subtitle: o.subtitle, body: o.body, icon: o.icon, group: o.group, actions: o.actions, reply: o.replyPlaceholder }) as { id: string; delivered: boolean; reason?: string };
  const n = new Notification(id, r.delivered, r.reason === undefined ? '' : r.reason);
  live.push(n);
  return n;
}
export function cancel(id: string): void { call('notification.cancel', { id: id }); }
/** What is still on screen: [{id, title, body}]. */
export async function delivered(): Promise<string[]> {
  const r = call('notification.delivered', {}) as { items: { id: string; title: string; body: string }[] };
  const ids: string[] = [];
  for (const it of r.items) ids.push(it.id + '|' + it.title + '|' + it.body);
  return ids;
}
