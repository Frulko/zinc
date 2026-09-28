// zinc:ui/kit — typography: class strings for host <Text> nodes, in the current theme.
//
//   <Text class={heading(2)}>Settings</Text>
//   <Text class={mutedText()}>{status()}</Text>
//
// Text does not inherit colour from a parent View, so every helper sets one.
import { theme } from './theme';

const HEADINGS: string[] = [
  'text-3xl font-bold tracking-tight',
  'text-2xl font-semibold tracking-tight',
  'text-xl font-semibold tracking-tight',
  'text-lg font-semibold',
];

/** Page and section titles, level 1 (largest) to 4. */
export function heading(level: i32): string {
  const i = Math.max(1, Math.min(4, level)) - 1;
  return `${HEADINGS[i]} text-${theme().foreground}`;
}
/** Introductory paragraph under a page title. */
export function leadText(): string { return `text-lg text-${theme().mutedForeground}`; }
/** Running text. */
export function bodyText(): string { return `text-base leading-7 text-${theme().foreground}`; }
/** Labels and dense UI text. */
export function smallText(): string { return `text-sm text-${theme().foreground}`; }
/** Secondary text: descriptions, hints, status lines. */
export function mutedText(): string { return `text-sm text-${theme().mutedForeground}`; }
/** Fine print: captions, units, timestamps. */
export function captionText(): string { return `text-xs text-${theme().mutedForeground}`; }
/** Small upper-case section label ("SETTINGS"). */
export function overline(): string { return `text-xs font-semibold tracking-wider text-${theme().mutedForeground}`; }
