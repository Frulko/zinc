// zinc:system/dock: the macOS dock tile (badge, bounce, progress, dock menu); on Linux a launcher entry where the desktop has one (docs/reports/system-integration.md 4.7).
import { call, callRaw, supports } from 'zinc:system';
import { Item, encodeItems, onClick } from './menu';

export function isSupported(): boolean { return supports('dock'); }
/** The badge text ('' clears it). */
export function setBadge(text: string): void { call('dock.setBadge', { text: text }); }
export function getBadge(): string { const r = call('dock.getBadge', {}) as { text: string }; return r.text; }
/** Asks for attention: 'informational' bounces once, 'critical' until the app is activated. macOS ignores it while the app is in front. */
export function bounce(kind: string = 'informational'): void { call('dock.bounce', { kind: kind }); }
/** Progress on the dock icon, 0..1; a negative value removes the bar. */
export function setProgress(value: number): void { call('dock.setProgress', { value: value }); }
/** The menu of the dock icon; choosing an item reports onClick(id) with source 'dock'. */
export function setMenu(items: Item[]): void { callRaw('dock.setMenu', '{"template":' + encodeItems(items) + '}'); }
export { onClick };
