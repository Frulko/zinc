// zinc:react-native/linking (ZN-367.04): React Native's Linking over zinc:system's opener and deep links. A module of its own because it needs the
// "opener" and "deep-link" permissions in zinc.json (zinc:system denies by default); the 'react-native' import alias sends Linking here (ZN-367.05).
import * as system from 'zinc:system';
import * as opener from 'zinc:system/opener';
import * as deeplink from 'zinc:system/deeplink';

export class LinkingEvent { url: string = ''; }
export class LinkingSubscription { private f: () => void; constructor(f: () => void) { this.f = f; } remove(): void { this.f(); } }
const urlFns: ((e: LinkingEvent) => void)[] = [];
let listening = false;
export class Linking {
  /** Opens the URL with the system's default app; rejects when zinc.json's "scopes": {"opener": {"allow": [...]}} does not allow it. */
  static async openURL(url: string): Promise<void> { await opener.openUrl(url); }
  /** Whether this target can open URLs at all (the scope is checked by openURL). */
  static async canOpenURL(url: string): Promise<boolean> { return system.supports('opener'); }
  /** The URL the app was opened with, or '' (React Native: null). */
  static async getInitialURL(): Promise<string> { const c = deeplink.current(); return c.length > 0 ? c[0] : ''; }
  /** 'url': a deep link that reaches the running app. */
  static addEventListener(type: string, f: (e: LinkingEvent) => void): LinkingSubscription {
    urlFns.push(f);
    if (!listening) { listening = true; deeplink.onOpen((url: string): void => { const e = new LinkingEvent(); e.url = url; for (const g of urlFns.slice()) g(e); }); }
    return new LinkingSubscription((): void => { const i = urlFns.indexOf(f); if (i >= 0) urlFns.splice(i, 1); });
  }
  static async openSettings(): Promise<void> { await opener.openUrl('app-settings:'); }
}
