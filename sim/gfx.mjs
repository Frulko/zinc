// zinc:gfx for the sim target: headless (draw calls are no-ops), 320x240, no input.
import { $z } from './zinc.mjs';

export const onFrame = cb => { $z.state.frameCb = cb; };
export const width = () => globalThis.$zScreen?.[0] ?? 320;
export const height = () => globalThis.$zScreen?.[1] ?? 240;
export const clear = () => {};
export const rect = () => {};
export const line = () => {};
export const text = () => {};
// metrics come from the baked resources (resources.json next to run.mjs), so layouts match native builds
const R = () => globalThis.$zRes ?? { fonts: [], images: [] };
export const rrect = () => {}, gradient = () => {}, border = () => {}, shadow = () => {}, polygon = () => {}, path = () => {};
export const drawText = () => {}, drawImage = () => {}, clip = () => {}, unclip = () => {}, translate = () => {}, keep = () => {};
export function font(name, px) {
  let best = -1, bd = 1 << 30;
  R().fonts.forEach((f, i) => { if (f.name === name && Math.abs(f.px - px) < bd) { bd = Math.abs(f.px - px); best = i; } });
  return best;
}
export const fontAscent = f => R().fonts[f]?.ascent ?? 0;
export const lineHeight = f => { const x = R().fonts[f]; return x ? x.ascent + x.descent + x.lineGap : 0; };
export function textWidth(f, s, tracking) {
  const x = R().fonts[f];
  if (!x) return 0;
  let pen = 0;
  for (const ch of s) { const a = x.adv[ch.codePointAt(0)] ?? x.adv[63]; if (a !== undefined) pen += a + Math.trunc(tracking * 64); }
  return pen / 64;
}
export const image = name => R().images.findIndex(i => i.name === name);
export const imageWidth = i => dynSize.get(i)?.[0] ?? R().images[i]?.w ?? 0;
export const imageHeight = i => dynSize.get(i)?.[1] ?? R().images[i]?.h ?? 0;
let dynImg = 1 << 20;
const dynSize = new Map();
export const stroke = () => {}, beginImage = () => {}, endImage = () => {}, destroyImage = i => { dynSize.delete(i); };
export const createImage = (w, h) => { const i = dynImg++; dynSize.set(i, [w, h]); return i; };
export const wheel = () => 0, pinch = () => 1, touchCount = () => 0, touchX = () => 0, touchY = () => 0, touchId = () => -1;
export const penCount = () => 0, penX = () => 0, penY = () => 0, penPressure = () => 0, penTiltX = () => 0, penTiltY = () => 0, penFlags = () => 0;
export const isDown = () => false;
export const wasPressed = () => false;
export const pointerX = () => 0;
export const pointerY = () => 0;
export const pointerDown = () => false;
export const frame = () => $z.state.frame;
// desktop input: headless, nothing typed or clicked; the clipboard is process-local (like native test runs)
let clipboard = '';
export const wheelX = () => 0, pointerButtons = () => 0, modifiers = () => 0;
export const keyCount = () => 0, keyKind = () => -1, keyMods = () => 0, keyName = () => '';
export const buttonEventCount = () => 0, buttonEventX = () => 0, buttonEventY = () => 0, buttonEventButton = () => 0, buttonEventDown = () => false;
export const startTextInput = () => {}, stopTextInput = () => {}, setCursor = () => {};
export const clipboardText = () => clipboard, setClipboardText = s => { clipboard = s; };
export const quit = () => { $z.state.quit = true; };
export const escapeByApp = () => {}, escapeDefault = () => {};
export const scrollDX = () => 0, scrollDY = () => 0, scrollPhase = () => 0;
export const profiling = () => false, profMark = () => {};
// headless sim: nothing is rasterized, so there is no frame to save
export const capture = () => false;
