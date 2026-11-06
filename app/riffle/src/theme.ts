// The look: light or dark over the system's blur, or over a plain panel, with the accent the person chose. Everything here follows the settings.
import { createSignal } from 'zinc:ui/solid';
import { settings } from './settings';

export const PANEL_RADIUS = 14;
export const PANEL_PADDING = 8;
export const BAR_HEIGHT = 34;
export const ACCENTS = ['#0a84ff', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f', '#af52de'];

export interface Density { rowHeight: number; icon: number; title: string; detail: string }
export function density(): Density {
  const chosen = settings().density;
  if (chosen === 'compact') return { rowHeight: 30, icon: 18, title: 'text-[13px]', detail: 'text-[11px]' };
  if (chosen === 'large') return { rowHeight: 52, icon: 36, title: 'text-[16px]', detail: 'text-[12px]' };
  return { rowHeight: 40, icon: 26, title: 'text-[14px]', detail: 'text-[11px]' };
}

const [systemDark, setSystemDark] = createSignal<boolean>(false);
export { setSystemDark };
export function isDark(): boolean {
  const theme = settings().theme;
  if (theme === 'system') return systemDark();
  return theme === 'dark';
}

export interface Palette { panel: string; label: string; secondary: string; control: string; controlOn: string; separator: string; track: string; rowHover: string; barBorder: string; card: string; segment: string }
const LIGHT: Palette = {
  panel: 'border border-black/10', label: 'text-black/85', secondary: 'text-black/50', control: 'bg-black/5 hover:bg-black/10',
  controlOn: 'bg-white shadow-sm', separator: 'bg-black/10', track: 'bg-black/15', rowHover: 'hover:bg-black/5', barBorder: 'border-black/10', card: 'bg-black/5', segment: 'bg-black/10',
};
const DARK: Palette = {
  panel: 'border border-white/15', label: 'text-white/90', secondary: 'text-white/55', control: 'bg-white/10 hover:bg-white/15',
  controlOn: 'bg-white/25 shadow-sm', separator: 'bg-white/15', track: 'bg-white/20', rowHover: 'hover:bg-white/10', barBorder: 'border-white/15', card: 'bg-white/5', segment: 'bg-white/10',
};
export function palette(): Palette { return isDark() ? DARK : LIGHT; }
/** The colour of the line icons, with the secondary text. */
export function iconColor(): i32 { return isDark() ? 0xb4b4b8 : 0x6e6e73; }

/** With the blur the panel only tints what shows through; without it, it is the whole background. */
export function panelFill(): string {
  if (settings().blur) return isDark() ? 'bg-black/20' : 'bg-white/30';
  return isDark() ? 'bg-[#26262a]' : 'bg-[#f5f5f7]';
}
export function accentFill(): string { return `bg-[${settings().accent}]`; }
