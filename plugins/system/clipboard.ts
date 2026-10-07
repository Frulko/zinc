// zinc:system/clipboard: what the plain text path (zinc:gfx clipboard, used by the UI kit) cannot do: html, an image, a file list (docs/reports/system-integration.md 4.7).
// Images travel as base64 PNG text.
import { call, supports } from 'zinc:system';

export function isSupported(): boolean { return supports('clipboard'); }
export function writeHtml(html: string, text: string): void { call('clipboard.writeRich', { text: text, html: html }); }
export function readHtml(): string { const r = call('clipboard.readRich', {}) as { html: string }; return r.html; }
export function writeImage(pngBase64: string): void { call('clipboard.writeImage', { png: pngBase64 }); }
/** The image on the clipboard as base64 PNG, '' when there is none. */
export function readImage(): string { const r = call('clipboard.readImage', {}) as { png: string }; return r.png; }
export function writeFiles(paths: string[]): void { call('clipboard.writeFiles', { paths: paths }); }
export function readFiles(): string[] { const r = call('clipboard.readFiles', {}) as { paths: string[] }; return r.paths; }
