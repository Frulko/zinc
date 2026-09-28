// zinc:ui/kit — theme tokens.
//
// A theme names the colour of every role a component can play (shadcn/ui's CSS variables, expressed as Tailwind
// colour names such as 'zinc-900'). Components build their classes from the current theme, so:
//   - Solid model: `setTheme(DARK)` restyles every mounted kit component (the theme is a signal);
//   - React model: the new theme applies on the next render.
// App code can use the same tokens for its own nodes: `<View class={`bg-${theme().muted}`}>`.
import { createSignal } from 'zinc:ui/solid';

export interface Theme {
  name: string;
  background: string;            // the page
  foreground: string;            // main text
  card: string;                  // cards, lists, tab triggers
  muted: string;                 // quiet fills: tracks, secondary surfaces
  mutedForeground: string;       // secondary text
  border: string;                // hairlines and outlines
  input: string;                 // unchecked switch track
  primary: string;               // default button, checked switch, progress
  primaryForeground: string;
  primaryFocus: string;          // focused / pressed shades of primary
  primaryPressed: string;
  secondary: string;
  secondaryForeground: string;
  secondaryPressed: string;
  subtle: string;                // ghost / outline focus and press fill
  accent: string;                // the one brand colour
  accentForeground: string;
  accentSoft: string;            // tinted backgrounds (badges, highlights)
  accentSoftForeground: string;
  destructive: string;
  destructiveForeground: string;
  destructivePressed: string;
  destructiveSoft: string;
  destructiveSoftForeground: string;
  success: string;
  successSoft: string;
  successSoftForeground: string;
  warningSoft: string;
  warningSoftForeground: string;
}

/** Light neutral theme (the default): white surfaces, zinc greys, one indigo accent. */
export const LIGHT: Theme = {
  name: 'light',
  background: 'zinc-50', foreground: 'zinc-950', card: 'white', muted: 'zinc-100', mutedForeground: 'zinc-500',
  border: 'zinc-200', input: 'zinc-200',
  primary: 'zinc-900', primaryForeground: 'zinc-50', primaryFocus: 'zinc-800', primaryPressed: 'zinc-700',
  secondary: 'zinc-100', secondaryForeground: 'zinc-900', secondaryPressed: 'zinc-200', subtle: 'zinc-100',
  accent: 'indigo-600', accentForeground: 'white', accentSoft: 'indigo-50', accentSoftForeground: 'indigo-700',
  destructive: 'red-600', destructiveForeground: 'white', destructivePressed: 'red-700',
  destructiveSoft: 'red-50', destructiveSoftForeground: 'red-700',
  success: 'emerald-600', successSoft: 'emerald-50', successSoftForeground: 'emerald-700',
  warningSoft: 'amber-50', warningSoftForeground: 'amber-700',
};

/** Dark variant of the same roles. */
export const DARK: Theme = {
  name: 'dark',
  background: 'zinc-950', foreground: 'zinc-50', card: 'zinc-900', muted: 'zinc-800', mutedForeground: 'zinc-400',
  border: 'zinc-800', input: 'zinc-700',
  primary: 'zinc-50', primaryForeground: 'zinc-900', primaryFocus: 'zinc-200', primaryPressed: 'zinc-300',
  secondary: 'zinc-800', secondaryForeground: 'zinc-50', secondaryPressed: 'zinc-700', subtle: 'zinc-800',
  accent: 'indigo-500', accentForeground: 'white', accentSoft: 'indigo-950', accentSoftForeground: 'indigo-300',
  destructive: 'red-600', destructiveForeground: 'white', destructivePressed: 'red-700',
  destructiveSoft: 'red-950', destructiveSoftForeground: 'red-300',
  success: 'emerald-500', successSoft: 'emerald-950', successSoftForeground: 'emerald-300',
  warningSoft: 'amber-950', warningSoftForeground: 'amber-300',
};

const [current, setCurrent] = createSignal<Theme>(LIGHT);

/** The current theme (a tracked read under Solid). */
export function theme(): Theme { return current(); }

/** Switches every kit component to another theme. */
export function setTheme(t: Theme): void { setCurrent(t); }

