// zinc:browser in the browser: the answers of targets/web/runtime.js (detect()) and the table of browsers.json that the export embeds. See ../index.ts.
const g: any = globalThis;
const Z = g.__zincWeb;

export const ZnUnsupported = g.ZnUnsupported;
export interface BrowserInfo { name: string; version: number; engine: string; mobile: boolean; secureContext: boolean; crossOriginIsolated: boolean }

export function isBrowser(): boolean { return true; }
export function browserInfo(): BrowserInfo {
  const ua: string = g.navigator.userAgent;
  let name = 'other', version = 0, m: RegExpExecArray | null;
  if ((m = /Edg\/(\d+)/.exec(ua))) { name = 'edge'; version = +m[1]; }
  else if ((m = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua))) { name = 'firefox'; version = +m[1]; }
  else if ((m = /(?:Chrome|CriOS|Chromium)\/(\d+)/.exec(ua))) { name = 'chrome'; version = +m[1]; }
  else if ((m = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua))) { name = 'safari'; version = parseFloat(m[1]); }
  const iOS = /iPhone|iPad|iPod/.test(ua);
  return { name: iOS && name !== 'safari' ? 'safari' : name, version, engine: name === 'firefox' ? 'gecko' : name === 'safari' || iOS ? 'webkit' : name === 'other' ? 'unknown' : 'blink',
    mobile: /Mobi|Android|iPhone|iPad/.test(ua), secureContext: !!g.isSecureContext, crossOriginIsolated: !!g.crossOriginIsolated };
}
export function browserFeatures(): any { return Object.assign({}, Z.features); }
export function supports(feature: string): boolean { return !!Z.features[feature]; }
export function requireFeature(feature: string): void { if (!Z.features[feature]) throw new ZnUnsupported(feature, 'this browser does not have it' + (shippedBy(feature) ? ' (shipped by ' + shippedBy(feature) + ')' : '')); }
export function shippedBy(feature: string): string {
  const row = Z.config.browsers && Z.config.browsers.features ? Z.config.browsers.features[feature] : null;
  if (!row) return '';
  const out: string[] = [];
  for (const b of ['chrome', 'edge', 'firefox', 'safari']) if (row[b] != null) out.push(`${b} ${row[b]}`);
  return out.join(', ');
}
let bar: HTMLElement | null = null;
export function banner(text: string): void {
  if (bar === null) {
    bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9;padding:10px 16px;background:#1f2937;color:#fff;font:14px/1.4 system-ui,sans-serif';
    document.body.appendChild(bar);
  }
  bar.textContent = text;
}
