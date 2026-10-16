// zinc:ui/kit — typography: class strings for host <Text> nodes, in the current theme.
//
//   <Text className={heading(2)}>Settings</Text>
//   <Text className={mutedText()}>{status()}</Text>
//
// Text does not inherit colour from a parent View, so every helper sets one.
// The sizes are the platform look's type scale (zinc:ui/platform: iOS's Dynamic Type, Material 3's, macOS's; neutral: Tailwind's text-3xl ... text-xs).
import { theme } from './theme';
import { look } from '../platform/index';
// The neutral look's sizes (zinc:ui/platform builds its classes at run time), named here so that a kit program bakes them as before:
// text-xs text-sm text-base text-lg text-xl text-2xl text-3xl

/** Page and section titles, level 1 (largest) to 4. */
export function heading(level: i32): string {
  const i = Math.max(1, Math.min(4, level)) - 1;
  return `${look().headings[i]} text-${theme().foreground}`;
}
/** Introductory paragraph under a page title. */
export function leadText(): string { return `${look().lead} text-${theme().mutedForeground}`; }
/** Running text. */
export function bodyText(): string { return `${look().body} text-${theme().foreground}`; }
/** Labels and dense UI text. */
export function smallText(): string { return `${look().small} text-${theme().foreground}`; }
/** Secondary text: descriptions, hints, status lines. */
export function mutedText(): string { return `${look().muted} text-${theme().mutedForeground}`; }
/** Fine print: captions, units, timestamps. */
export function captionText(): string { return `${look().caption} text-${theme().mutedForeground}`; }
/** Small upper-case section label ("SETTINGS"). */
export function overline(): string { return `${look().overline} text-${theme().mutedForeground}`; }
