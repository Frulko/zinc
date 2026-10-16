// Navigation: five tabs and a stack above them, like a React Navigation bottom-tab navigator with a native stack. The App component owns the state
// and hands its setters here, so any screen can call `go('media')` or `back()`. A screen that starts timers or sockets registers their teardown
// with `onLeave`: it runs when the route changes (zinc:ui/react has no effect cleanup yet).
import { env } from 'zinc:sys';

/** SHOWCASE_LOG=1: one line per event the tests check (route, form, feed, notes, camera). */
const tracing = env('SHOWCASE_LOG') === '1';
export function trace(s: string): void { if (tracing) console.log(s); }

export const TABS: string[] = ['home', 'components', 'forms', 'network', 'more'];
export const TAB_ICONS: string[] = ['house', 'shapes', 'clipboard-list', 'wifi', 'layout-grid'];
export const TAB_TITLES: string[] = ['Home', 'Components', 'Forms', 'Network', 'More'];
// stack screens and their titles
export const SCREENS: string[] = ['media', 'camera', 'motion', 'data', 'platform', 'about', 'post'];
export const SCREEN_TITLES: string[] = ['Media', 'Camera', 'Motion', 'Data', 'Platform', 'About', 'Post'];

class Nav {
  goTab: (t: string) => void = (t: string): void => {};
  push: (s: string) => void = (s: string): void => {};
  pop: () => void = (): void => {};
  relabel: () => void = (): void => {};   // re-render after a language change
  param: number = 0;   // the argument of the pushed screen (the post id)
}
export const nav = new Nav();
export function go(screen: string): void { if (TABS.indexOf(screen) >= 0) nav.goTab(screen); else nav.push(screen); }
export function goWith(screen: string, param: number): void { nav.param = param; nav.push(screen); }
export function back(): void { nav.pop(); }

const leaving: (() => void)[] = [];
export function onLeave(f: () => void): void { leaving.push(f); }
export function leaveScreen(): void {
  trace('leave'); const fs = leaving.splice(0, leaving.length); for (const f of fs) f(); }
