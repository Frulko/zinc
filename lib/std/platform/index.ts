// zinc:ui/platform — the platform look (ZN-748, docs/ui.md "Platform look"): which of the token tables of ./tokens the kits draw with.
//
// Two layers, as Flutter splits them: the *behaviour* (scroll physics, page transitions, selection handles, long-press menus, haptics) follows
// the platform the program runs on (zinc:ui platformStyle(), ZINC_PLATFORM) and is not themeable; the *look* (sizes, radii, type scale, font,
// control colours) is this module's, adaptive by default and forced per app:
//   zinc.json "ui": {"platformLook": "auto" | "ios" | "android" | "macos" | "neutral"}, ZINC_PLATFORM_LOOK for one run,
//   setPlatformLook() or <ThemeProvider look="ios"> at the root of the app.
// "auto" is the platform's look: iOS on iOS, Material 3 on Android, macOS on a Mac, neutral (the kits' own) elsewhere. A deterministic run
// (tests, goldens) on a Mac without ZINC_PLATFORM takes neutral, so its frames are the ones a Linux machine draws.
import * as ui from 'zinc:ui';
import { platform, env, device } from 'zinc:sys';
import { UI_PLATFORM_LOOK } from 'zinc:platform';
import { font } from 'zinc:gfx';
import { Haptics } from '../haptics';
import { Look, IOS, ANDROID, MACOS, NEUTRAL } from './tokens';
export { Look, IOS, ANDROID, MACOS, NEUTRAL } from './tokens';

const LOOKS: Look[] = [IOS, ANDROID, MACOS, NEUTRAL];
function byName(name: string): Look { for (const l of LOOKS) if (l.name === name) return l; return NEUTRAL; }

/** The look "auto" stands for on this platform. */
export function autoLook(): string {
  const p = platform();
  if (p === 'ios' || p === 'android') return p;
  if (p === 'macos') return env('ZINC_DETERMINISTIC') !== '' && env('ZINC_PLATFORM') === '' ? 'neutral' : 'macos';
  return 'neutral';
}
function resolve(name: string): Look { return byName(name === 'auto' || name === '' ? autoLook() : name); }

const VARS: string[] = ['pfTint', 'pfOnTint', 'pfTintPressed', 'pfSwitchOn', 'pfSwitchOff', 'pfThumb', 'pfThumbDim', 'pfFill', 'pfRaised', 'pfBorder', 'pfLabel', 'pfLabel2', 'pfSeparator'];
let current: Look = resolve(env('ZINC_PLATFORM_LOOK') !== '' ? env('ZINC_PLATFORM_LOOK') : UI_PLATFORM_LOOK);
let accent: i32 = -1;   // the OS's accent (macOS), or setAccent's: replaces the tint of the look
function pick(l: Look, k: i32): i32[] {
  const a = accent >= 0 && l.name !== 'neutral';
  return [a ? accent : l.tint[k], l.onTint[k], a ? shade(accent, k === 0 ? -0.2 : 0.25) : l.tintPressed[k], a && l.switchOn[0] === l.tint[0] ? accent : l.switchOn[k], l.switchOff[k], l.thumb[k],
          l.thumbDim[k], l.fill[k], l.raised[k], l.border[k], l.label[k], l.label2[k], l.separator[k]];
}
/** A colour made darker (k < 0) or lighter (k > 0) by |k|. */
function shade(c: i32, k: number): i32 {
  const f = (v: i32): i32 => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}
// The look's colours as scheme variables (`bg-[var(--pfTint)]`): they follow the light and dark schemes and a new accent without re-rendering.
function defineVars(): void { ui.defineScheme('light', VARS, pick(current, 0)); ui.defineScheme('dark', VARS, pick(current, 1)); }

/** The current look's tokens. */
export function look(): Look { return current; }
/** 'ios', 'android', 'macos' or 'neutral'. */
export function lookName(): string { return current.name; }
/** Forces one look ('auto' gives the platform's back). Components read it when they render: call it before the first render, or use ThemeProvider at the root. */
export function setPlatformLook(name: string): void {
  const l = resolve(name);
  if (l === current) return;
  current = l;
  readAccent();
  defineVars();
  applyFont();
  ui.refreshScheme();
}
/** The OS's accent colour (0xRRGGBB) in place of the look's tint; -1 gives the look's own back. On a Mac the user's System Settings choice is read at the start. */
export function setAccent(rgb: i32): void { accent = rgb; defineVars(); ui.refreshScheme(); }
/** One of the look's [light, dark] colours in the current scheme; under the neutral look always the light one (what React Native drew before looks). */
export function color(pair: i32[]): i32 { return pair[ui.currentScheme() === 'dark' && current.name !== 'neutral' ? 1 : 0]; }
/** The tint in the current scheme, the OS's accent when it gave one. */
export function tint(): i32 { return accent >= 0 && current.name !== 'neutral' ? accent : color(current.tint); }

/** Sets the look of the app below it: `<ThemeProvider look="ios">...</ThemeProvider>` (React and Solid models), at the root. */
export function ThemeProvider(p: { look?: string; children?: () => i32 }): i32 {
  setPlatformLook(p.look ?? 'auto');
  return p.children !== undefined ? p.children() : ui.createNode(ui.FRAGMENT);
}

/** The feedback a platform's own switch gives when it flips (iOS: a light impact, as UISwitch; elsewhere none). Behaviour: follows the platform, not the look. */
export function toggleFeedback(): void { if (ui.platformStyle() === 'ios') Haptics.impact('light'); }
/** A long press opened something (a context menu): Android's LONG_PRESS feedback, iOS's context-menu impact; a desktop has none. */
export function longPressFeedback(): void { const s = ui.platformStyle(); if (s === 'android') Haptics.impact('heavy'); else if (s === 'ios') Haptics.impact('medium'); }
/** A segmented control's or a picker's selection moved (iOS: the selection tick). */
export function selectionFeedback(): void { if (ui.platformStyle() === 'ios') Haptics.selection(); }

/** The look's UI font: the first of its families the program has (an app's assets/Roboto*.ttf...), else the built-in Inter. ponytail: the OS's own
 *  font files (SF Pro through CoreText, Android's /system/fonts) are variable fonts, which the rasterizer cannot instance yet (later.md). */
let fontSet = false;
function applyFont(): void {
  for (const fam of current.fonts.split(',')) if (fam !== '' && font(fam, 16) >= 0) { ui.setFontSans(fam); fontSet = true; return; }
  if (fontSet) { ui.setFontSans(''); fontSet = false; }
}

/** On a Mac, the accent colour the user chose (zinc:sys device('accent'): System Settings' AppleAccentColor); a deterministic run keeps systemBlue. */
function readAccent(): void {
  if (current.name !== 'macos' || accent >= 0 || env('ZINC_DETERMINISTIC') !== '') return;
  const a = device('accent', '');
  if (a.length === 6) accent = parseInt(a, 16);
}
readAccent();
if (current.name !== 'neutral') defineVars();   // the neutral look reads none of them (setPlatformLook defines them when it leaves it)
applyFont();
