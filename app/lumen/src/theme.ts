// The look of a macOS menu: colours that follow the system's light or dark appearance, over the menu material's blur. Sizes live with the components.
import { createSignal } from 'zinc:ui/solid';

export const PANEL_RADIUS = 16;

export interface Palette {
  panel: string;      // the panel's rim and the tint over the blur
  label: string;
  secondary: string;
  iconTint: string;
  rowHover: string;
  rowOn: string;
  disc: string;       // behind a row's icon
  well: string;       // what a row opens, a segmented control's track
  segmentOn: string;
  separator: string;
  track: string;
  knob: string;
  button: string;
  tile: string;
  tileMain: string;
  warning: string;
}

const LIGHT: Palette = {
  panel: 'bg-white/30 border border-white/60',
  label: 'text-black/85',
  secondary: 'text-black/50',
  iconTint: 'tint-[#3c3c43]',
  rowHover: 'hover:bg-black/10',
  rowOn: 'bg-black/10',
  disc: 'bg-black/10',
  well: 'bg-black/5',
  segmentOn: 'bg-white shadow-sm',
  separator: 'bg-black/10',
  track: 'bg-black/15',
  knob: 'bg-white border border-black/10 shadow-sm',
  button: 'bg-white/70 border border-black/10',
  tile: 'bg-white/40 border border-black/15',
  tileMain: 'bg-[#007aff]/30 border border-[#007aff]/60',
  warning: 'text-[#c4291c]',
};
const DARK: Palette = {
  panel: 'bg-black/15 border border-white/15',
  label: 'text-white/90',
  secondary: 'text-white/55',
  iconTint: 'tint-[#ebebf5]',
  rowHover: 'hover:bg-white/15',
  rowOn: 'bg-white/15',
  disc: 'bg-white/15',
  well: 'bg-white/5',
  segmentOn: 'bg-white/25 shadow-sm',
  separator: 'bg-white/15',
  track: 'bg-white/20',
  knob: 'bg-white border border-black/10 shadow-sm',
  button: 'bg-white/15 border border-white/10',
  tile: 'bg-white/10 border border-white/25',
  tileMain: 'bg-[#0a84ff]/35 border border-[#0a84ff]/70',
  warning: 'text-[#ff6961]',
};

const [isDark, setIsDark] = createSignal<boolean>(false);
export { setIsDark };
export function palette(): Palette { return isDark() ? DARK : LIGHT; }
export function accent(): string { return isDark() ? 'bg-[#0a84ff]' : 'bg-[#007aff]'; }

export const TEXT_ROW = 'text-[13px]';
export const TEXT_SMALL = 'text-[11px]';
