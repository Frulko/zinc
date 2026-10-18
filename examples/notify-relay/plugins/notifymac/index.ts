// zinc:notifymac: Zinc Relay's window on macOS (native/notifymac.spec.ts says what each call does).
import N from './native/notifymac.spec';

/** A property list's root value, parsed (null when the bytes are not a property list). Data is {$data: base64}, a nested plist {$plist}. */
export function plist(data: u8[]): any {
  const t = N.plistJson(data);
  if (t === '') return null;
  const a = JSON.parse(t);
  return a[0];
}
export class AppInfo {
  id: string; name: string; path: string;
  constructor(id: string, name: string, path: string) { this.id = id; this.name = name; this.path = path; }
}
/** The app with this bundle id (or of the bundle at this path); null when it is not installed. */
export function appInfo(idOrPath: string): AppInfo | null {
  const t = N.appInfo(idOrPath);
  if (t === '') return null;
  const o = JSON.parse(t);
  return new AppInfo(o.id as string, o.name as string, o.path as string);
}
export function appIcon(idOrPath: string, px: i32): u8[] { return N.appIcon(idOrPath, px); }
export function imagePng(source: string, px: i32): u8[] { return N.imagePng(source, px); }
export function monogram(text: string, top: i32, bottom: i32, px: i32): u8[] { return N.monogram(text, top, bottom, px); }
export function dbPath(): string { return N.dbPath(); }
export function openError(path: string): i32 { return N.openError(path); }
export function bundlePath(): string { return N.bundlePath(); }
export function contactsStatus(): string { return N.contactsStatus(); }
export function requestContacts(): void { N.requestContacts(); }
export function contactImage(handle: string, name: string, px: i32): u8[] { return N.contactImage(handle, name, px); }
export function notifyStatus(): string { return N.notifyStatus(); }
export function requestNotify(): void { N.requestNotify(); }
export function postNotification(title: string, body: string): string { return N.postNotification(title, body); }
export function open(bundleId: string, url: string): boolean { return N.open(bundleId, url); }
export function loginStatus(): string { return N.loginStatus(); }
export function setLogin(on: boolean): string { return N.setLogin(on); }
export function localNetwork(): string { return N.localNetwork(); }
export function emojiPng(text: string, px: i32): u8[] { return N.emojiPng(text, px); }
export function watchDb(path: string): void { N.watchDb(path); }
export function dbChanged(): boolean { return N.dbChanged(); }
