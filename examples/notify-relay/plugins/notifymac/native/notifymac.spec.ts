// zinc:notifymac native side (notifymac.mm): what Zinc Relay needs from macOS and nothing more. The property lists of Notification
// Center's records decoded by the system's own parser, the apps' names and icons, avatars (an image of a record, a contact's photo, a
// monogram), the permissions the relay asks for (Full Disk Access, Contacts, local network, notifications, login item) and opening the
// app a notification came from. Every private or version-dependent call is guarded: a later macOS degrades to the next source.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** A property list (binary or XML) as JSON text: a dictionary lists its keys in "$keys", dates are seconds since 1970, data is {"$data": base64} (or {"$plist": value} when
   *  the data is itself a property list, a keyed archive included). '' when the bytes are not one. */
  plistJson(data: u8[]): string;
  /** The app with this bundle id, or of the bundle at this path (starting with '/'): JSON {id, name, path}; '' when none is installed. */
  appInfo(idOrPath: string): string;
  /** The app's icon as a px x px PNG (the generic app icon when the app is not installed); [] when it cannot be drawn. */
  appIcon(idOrPath: string, px: i32): u8[];
  /** An image (a file path, a file:// URL, or base64 bytes) as a px x px PNG, cropped to a square from its centre; [] when unreadable. */
  imagePng(source: string, px: i32): u8[];
  /** A monogram as iOS draws one: `text` (one or two letters) in white on a vertical gradient from `top` to `bottom` (0xRRGGBB). */
  monogram(text: string, top: i32, bottom: i32, px: i32): u8[];
  /** Notification Center's database on this system: the group container's on macOS 15 and later, the per-user directory's before. */
  dbPath(): string;
  /** 0 when this process can open `path` for reading, else the errno (1, EPERM: Full Disk Access is not granted; 2: no such file). */
  openError(path: string): i32;
  /** The .app this process runs from ('' outside a bundle): what the person adds to Full Disk Access. */
  bundlePath(): string;
  /** Contacts: 'granted', 'limited', 'denied', 'restricted' or 'undetermined'. */
  contactsStatus(): string;
  /** Shows the system's question for Contacts (once); contactsStatus() says the answer. */
  requestContacts(): void;
  /** The photo of the contact with this phone number or email (`handle`), else the one whose full name is `name` (exactly, else the only
   *  one that matches), as a px x px PNG; [] when none (or Contacts is not granted). */
  contactImage(handle: string, name: string, px: i32): u8[];
  /** Notifications of this app: 'granted', 'provisional', 'denied', 'undetermined', or 'unavailable' outside an app bundle. */
  notifyStatus(): string;
  /** Asks for notifications (the system's question, once). */
  requestNotify(): void;
  /** Posts a notification of this app (UNUserNotificationCenter; osascript's when this app may not); '' when posted, else why not. */
  postNotification(title: string, body: string): string;
  /** Opens what a notification leads to: `url` with the app `bundleId` (or its default app), else the app itself. */
  open(bundleId: string, url: string): boolean;
  /** The login item (SMAppService.mainApp, macOS 13+): 'enabled', 'requires approval', 'not registered', 'not found' or 'unavailable'. */
  loginStatus(): string;
  /** Registers or removes the login item; '' when done, else the system's reason. */
  setLogin(on: boolean): string;
  /** Local network access (macOS 15 asks before an app reaches the LAN): 'ok', 'blocked' (a send to the LAN fails with no route) or
   *  'offline' (no LAN address). The first call may show the system's question. */
  localNetwork(): string;
  /** Renders a single emoji (or sequence) as a px x px PNG using the system's colour-emoji font; [] when it cannot. */
  emojiPng(text: string, px: i32): u8[];
  /** An image (as imagePng's sources) fitted in maxPx x maxPx, its aspect kept, as a JPEG; [] when it cannot. */
  imageFit(source: string, maxPx: i32): u8[];
  /** Watches the usernoted database file (and its WAL) for writes; sets a flag a later dbChanged() reads. Call once. */
  watchDb(path: string): void;
  /** True (and clears) when the watched database has been written since the last call. */
  dbChanged(): boolean;
}
export default requireNative<Spec>('NotifyMac');
