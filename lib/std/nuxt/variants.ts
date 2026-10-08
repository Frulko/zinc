// zinc:ui/nuxt, class builders (ZN-357.02): Nuxt UI 4's component themes (nuxt/ui src/theme/*.ts, docs/reports/nuxt-ui-research.md section 3) written as
// zinc:ui classes with the exact colours of the current theme. Nuxt's `ring ring-inset` (a 1 px line inside the box) is a 1 px border here: borders are
// paint only in zinc:ui, so the box keeps its size like the inset ring does.
import { NuxtTheme, hex, mix, rounded } from './theme';

export const SIZES: string[] = ['xs', 'sm', 'md', 'lg', 'xl'];
function at(size: string): i32 { const i = SIZES.indexOf(size); return i < 0 ? 2 : i; }
function pick(size: string, values: string[]): string { return values[at(size)]; }

/** The colour behind `color`: an alias's shade, or the inverted background for neutral. */
function c(t: NuxtTheme, color: string): string { return t.color(color); }
/** `col` at `alpha` % composited on the page (ZN-378: a browser's float blend, exact where the tint sits on the page background). */
const tint = (t: NuxtTheme, col: string, alpha: i32): string => alpha >= 100 ? hex(col) : hex(mix(col, alpha, t.bg));
const ring = (t: NuxtTheme, col: string, alpha: i32 = 100): string => 'border border-' + tint(t, col, alpha);
/** A ring drawn over the element's own tinted background (`ring-c/a` on `bg-c/u`: the browser stacks them). */
const ringOn = (t: NuxtTheme, col: string, alpha: i32, under: i32): string => 'border border-' + hex(mix(col, alpha, mix(col, under, t.bg)));
const focus = (t: NuxtTheme, col: string): string => 'outline-' + tint(t, col, 25) + ' focus-visible:outline-3';

// ---------------------------------------------------------------- Button
export function buttonSize(size: string, square: boolean): string {
  const pad = square ? pick(size, ['p-1', 'p-1.5', 'p-1.5', 'p-2', 'p-2']) : pick(size, ['px-2 py-1', 'px-2.5 py-1.5', 'px-2.5 py-1.5', 'px-3 py-2', 'px-3 py-2']);
  return pad + ' ' + pick(size, ['text-xs gap-1', 'text-xs gap-1.5', 'text-sm gap-1.5', 'text-sm gap-2', 'text-base gap-2']);
}
export function buttonIconSize(size: string): number { return [16, 16, 20, 20, 24][at(size)]; }
export function buttonVariant(t: NuxtTheme, color: string, variant: string): string {
  if (color === 'neutral') {
    if (variant === 'outline') return ring(t, t.borderAccented) + ' text-' + hex(t.text) + ' bg-' + hex(t.bg) + ' hover:bg-' + hex(t.bgElevated) + ' active:bg-' + hex(t.bgElevated) + ' ' + focus(t, t.bgInverted);
    if (variant === 'soft') return 'text-' + hex(t.text) + ' bg-' + hex(t.bgElevated) + ' hover:bg-' + tint(t, t.bgAccented, 75) + ' active:bg-' + tint(t, t.bgAccented, 75) + ' ' + focus(t, t.bgInverted);
    if (variant === 'subtle') return ring(t, t.borderAccented) + ' text-' + hex(t.text) + ' bg-' + hex(t.bgElevated) + ' hover:bg-' + tint(t, t.bgAccented, 75) + ' ' + focus(t, t.bgInverted);
    if (variant === 'ghost') return 'text-' + hex(t.text) + ' hover:bg-' + hex(t.bgElevated) + ' active:bg-' + hex(t.bgElevated) + ' ' + focus(t, t.bgInverted);
    if (variant === 'link') return 'text-' + hex(t.textMuted) + ' hover:text-' + hex(t.text) + ' ' + focus(t, t.bgInverted);
    return 'text-' + hex(t.textInverted) + ' bg-' + hex(t.bgInverted) + ' hover:bg-' + tint(t, t.bgInverted, 90) + ' active:bg-' + tint(t, t.bgInverted, 90) + ' ' + focus(t, t.bgInverted);
  }
  const k = c(t, color);
  if (variant === 'outline') return ring(t, k, 50) + ' text-' + hex(k) + ' hover:bg-' + tint(t, k, 10) + ' active:bg-' + tint(t, k, 10) + ' ' + focus(t, k);
  if (variant === 'soft') return 'text-' + hex(k) + ' bg-' + tint(t, k, 10) + ' hover:bg-' + tint(t, k, 15) + ' active:bg-' + tint(t, k, 15) + ' ' + focus(t, k);
  if (variant === 'subtle') return ringOn(t, k, 25, 10) + ' text-' + hex(k) + ' bg-' + tint(t, k, 10) + ' hover:bg-' + tint(t, k, 15) + ' active:bg-' + tint(t, k, 15) + ' ' + focus(t, k);
  if (variant === 'ghost') return 'text-' + hex(k) + ' hover:bg-' + tint(t, k, 10) + ' active:bg-' + tint(t, k, 10) + ' ' + focus(t, k);
  if (variant === 'link') return 'text-' + hex(k) + ' hover:text-' + tint(t, k, 75) + ' active:text-' + tint(t, k, 75) + ' ' + focus(t, k);
  return 'text-' + hex(t.textInverted) + ' bg-' + hex(k) + ' hover:bg-' + tint(t, k, 75) + ' active:bg-' + tint(t, k, 75) + ' ' + focus(t, k);
}
/** The text colour of a button or badge, for its icons (zinc:icons takes a number). */
export function contentColor(t: NuxtTheme, color: string, variant: string): string {
  if (variant === 'solid') return t.textInverted;
  if (color === 'neutral') return variant === 'link' ? t.textMuted : t.text;
  return c(t, color);
}

// ---------------------------------------------------------------- Badge
export function badgeSize(size: string, square: boolean): string {
  const pad = square ? pick(size, ['p-0.5', 'p-1', 'p-1', 'p-1', 'p-1']) : pick(size, ['px-1 py-0.5', 'px-1.5 py-1', 'px-2 py-1', 'px-2 py-1', 'px-2.5 py-1']);
  return pad + ' ' + pick(size, ['text-[8px] gap-1', 'text-[10px] gap-1', 'text-xs gap-1', 'text-sm gap-1.5', 'text-base gap-1.5']) + ' ' + rounded(at(size) < 2 ? 'sm' : 'md');
}
export function badgeIconSize(size: string): number { return [12, 12, 16, 20, 24][at(size)]; }
export function badgeVariant(t: NuxtTheme, color: string, variant: string): string {
  if (color === 'neutral') {
    if (variant === 'outline') return ring(t, t.borderAccented) + ' text-' + hex(t.text) + ' bg-' + hex(t.bg);
    if (variant === 'soft') return 'text-' + hex(t.text) + ' bg-' + hex(t.bgElevated);
    if (variant === 'subtle') return ring(t, t.borderAccented) + ' text-' + hex(t.text) + ' bg-' + hex(t.bgElevated);
    return 'text-' + hex(t.textInverted) + ' bg-' + hex(t.bgInverted);
  }
  const k = c(t, color);
  if (variant === 'outline') return 'text-' + hex(k) + ' ' + ring(t, k, 50);
  if (variant === 'soft') return 'bg-' + tint(t, k, 10) + ' text-' + hex(k);
  if (variant === 'subtle') return 'bg-' + tint(t, k, 10) + ' text-' + hex(k) + ' ' + ringOn(t, k, 25, 10);
  return 'bg-' + hex(k) + ' text-' + hex(t.textInverted);
}

// ---------------------------------------------------------------- Avatar
export const AVATAR_SIZES: string[] = ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
export function avatarBox(size: string): number { const i = AVATAR_SIZES.indexOf(size); return [16, 20, 24, 28, 32, 36, 40, 44, 48][i < 0 ? 4 : i]; }

// ---------------------------------------------------------------- Input, Textarea, Select's trigger
export function inputSize(size: string): string {
  return pick(size, ['px-2 py-1 text-xs gap-1', 'px-2.5 py-1.5 text-xs gap-1.5', 'px-2.5 py-1.5 text-sm gap-1.5', 'px-3 py-2 text-sm gap-2', 'px-3 py-2 text-base gap-2']);
}
export function inputHeight(size: string): number { return [24, 28, 32, 36, 40][at(size)]; }
export function inputVariant(t: NuxtTheme, color: string, variant: string, highlight: boolean): string {
  const k = color === 'neutral' ? t.bgInverted : c(t, color);
  const base = 'text-' + hex(t.textHighlighted) + ' ' + rounded('md') + ' border-0 disabled:opacity-75';   // Nuxt's base: border-0 (zinc:ui's field has a border)
  if (variant === 'soft') return base + ' bg-' + tint(t, t.bgElevated, 50) + ' hover:bg-' + hex(t.bgElevated) + ' focus:bg-' + hex(t.bgElevated) + ' ' + focus(t, k);
  if (variant === 'subtle') return base + ' bg-' + hex(t.bgElevated) + ' ' + ring(t, highlight ? k : t.borderAccented) + ' focus:border-' + hex(k) + ' ' + focus(t, k);
  if (variant === 'ghost') return base + ' bg-transparent hover:bg-' + hex(t.bgElevated) + ' focus:bg-' + hex(t.bgElevated) + ' ' + focus(t, k);
  if (variant === 'none') return base + ' bg-transparent';
  return base + ' bg-' + hex(t.bg) + ' ' + ring(t, highlight ? k : t.borderAccented) + ' focus:border-' + hex(k) + ' ' + focus(t, k);
}

// ---------------------------------------------------------------- Checkbox, Switch, RadioGroup
export function choiceText(size: string): string { return pick(size, ['text-xs', 'text-xs', 'text-sm', 'text-sm', 'text-base']); }
export function checkboxBox(size: string): number { return [12, 14, 16, 18, 20][at(size)]; }
export function switchThumb(size: string): number { return [12, 14, 16, 18, 20][at(size)]; }
export function radioDot(size: string): number { return [4, 4, 6, 6, 8][at(size)]; }
export function cardPadding(size: string): string { return pick(size, ['p-2.5', 'p-3', 'p-3.5', 'p-4', 'p-4.5']); }
/** The fill of a checked control: the alias, or the inverted background for neutral. */
export function checkedFill(t: NuxtTheme, color: string): string { return color === 'neutral' ? t.bgInverted : c(t, color); }
/** A choice drawn as a card (Checkbox and RadioGroup `variant="card"`). */
export function choiceCard(t: NuxtTheme, color: string, on: boolean, size: string): string {
  const k = checkedFill(t, color);
  return cardPadding(size) + ' ' + rounded('lg') + ' ' + (on ? (color === 'neutral' ? 'border border-' + tint(t, k, 50) : ringOn(t, k, 50, 10)) + ' bg-' + (color === 'neutral' ? hex(t.bgElevated) : tint(t, k, 10))
    : 'border border-' + hex(t.border) + ' hover:bg-' + tint(t, t.bgElevated, 50));
}
/** '#rrggbb' as the number zinc:icons draws with. */
export function rgb(c: string): i32 { return parseInt(c.substring(1), 16) as i32; }
