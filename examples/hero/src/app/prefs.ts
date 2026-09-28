// User preferences (Settings screen): name, dark mode, accent colour and motion options.
// The kit theme is rebuilt from them, so every kit component and every node using theme tokens follows.
import { createSignal } from 'zinc:ui/solid';
import { Theme, LIGHT, DARK, setTheme } from 'zinc:ui/kit';
import { setMotion } from './motion';

/** Accent choices: the Tailwind hue used for the brand colour and its tints. */
export const ACCENTS: string[] = ['indigo', 'emerald', 'rose', 'amber', 'sky'];

export const [name, setName] = createSignal<string>('Ada Lovelace');
export const [dark, setDarkSignal] = createSignal<boolean>(false);
export const [accent, setAccentSignal] = createSignal<string>('indigo');
export const [speed, setSpeedSignal] = createSignal<number>(1);
export const [reduceMotion, setReduceSignal] = createSignal<boolean>(false);

/** `base` with another accent hue (the kit roles that carry the brand colour). */
function withAccent(base: Theme, hue: string): Theme {
  const d = base.name === 'dark';
  return {
    name: base.name, background: base.background, foreground: base.foreground, card: base.card, muted: base.muted,
    mutedForeground: base.mutedForeground, border: base.border, input: base.input,
    primary: base.primary, primaryForeground: base.primaryForeground, primaryFocus: base.primaryFocus,
    primaryPressed: base.primaryPressed, secondary: base.secondary, secondaryForeground: base.secondaryForeground,
    secondaryPressed: base.secondaryPressed, subtle: base.subtle,
    accent: `${hue}-${d ? 500 : 600}`, accentForeground: 'white',
    accentSoft: `${hue}-${d ? 950 : 50}`, accentSoftForeground: `${hue}-${d ? 300 : 700}`,
    destructive: base.destructive, destructiveForeground: base.destructiveForeground,
    destructivePressed: base.destructivePressed, destructiveSoft: base.destructiveSoft,
    destructiveSoftForeground: base.destructiveSoftForeground, success: base.success, successSoft: base.successSoft,
    successSoftForeground: base.successSoftForeground, warningSoft: base.warningSoft,
    warningSoftForeground: base.warningSoftForeground,
  };
}

function applyTheme(): void { setTheme(withAccent(dark() ? DARK : LIGHT, accent())); }

export function setDark(on: boolean): void { setDarkSignal(on); applyTheme(); }
export function setAccent(hue: string): void { setAccentSignal(hue); applyTheme(); }
export function setSpeed(s: number): void { setSpeedSignal(s); setMotion(s, reduceMotion()); }
export function setReduceMotion(on: boolean): void { setReduceSignal(on); setMotion(speed(), on); }

export function resetPrefs(): void {
  setName('Ada Lovelace');
  setDarkSignal(false);
  setAccentSignal('indigo');
  setSpeed(1);
  setReduceMotion(false);
  applyTheme();
}

/** A 24-bit colour for canvas drawing, per accent hue (shade 500 and a light tint). */
export function accentRgb(): u32 {
  const a = accent();
  return a === 'emerald' ? 0x10b981 : a === 'rose' ? 0xf43f5e : a === 'amber' ? 0xf59e0b : a === 'sky' ? 0x0ea5e9 : 0x6366f1;
}
export function accentTint(): u32 {
  const a = accent();
  return a === 'emerald' ? 0xa7f3d0 : a === 'rose' ? 0xfecdd3 : a === 'amber' ? 0xfde68a : a === 'sky' ? 0xbae6fd : 0xc7d2fe;
}
