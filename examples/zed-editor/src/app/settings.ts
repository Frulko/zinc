// View settings: the project panel (open / width), the bottom terminal panel, the buffer font size and soft wrap.
// Panel toggles animate: the rendered widths / heights are springs following the settings.
import { createSignal } from 'zinc:ui/solid';
import { Spring } from './motion';

export const [panelOpen, setPanelOpen] = createSignal<boolean>(true);
export const [panelWidth, setPanelWidthSignal] = createSignal<number>(240);
/** Rendered width of the project panel (0 when hidden), animated on ⌘B. */
export const panelW = new Spring(240, 260, 30);
export function togglePanel(): void { setPanelOpen(!panelOpen()); panelW.to(panelOpen() ? panelWidth() : 0); }
export function setPanelWidth(w: number): void {
  const v = Math.max(160, Math.min(480, w));
  setPanelWidthSignal(v);
  if (panelOpen()) panelW.snap(v);
}

export const [terminalOpen, setTerminalOpen] = createSignal<boolean>(false);
/** Rendered height of the terminal panel (0 when hidden), animated on ⌘J. */
export const terminalH = new Spring(0, 260, 30);
export const TERMINAL_HEIGHT: number = 220;
export function toggleTerminal(): void { showTerminal(!terminalOpen()); }
export function showTerminal(on: boolean): void { setTerminalOpen(on); terminalH.to(on ? TERMINAL_HEIGHT : 0); }

/** Buffer font sizes (literal classes, so every size is baked into the program). */
export const FONT_SIZES: number[] = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];
export const FONT_CLASSES: string[] = ['text-[10px]', 'text-[11px]', 'text-[12px]', 'text-[13px]', 'text-[14px]', 'text-[15px]',
  'text-[16px]', 'text-[18px]', 'text-[20px]', 'text-[22px]', 'text-[24px]'];
export const DEFAULT_FONT: i32 = 4;
export const [fontIndex, setFontIndex] = createSignal<i32>(DEFAULT_FONT);
export function zoom(step: i32): void { setFontIndex(Math.max(0, Math.min(FONT_SIZES.length - 1, fontIndex() + step))); }
export function fontSize(): number { return FONT_SIZES[fontIndex()]; }

export const [softWrap, setSoftWrap] = createSignal<boolean>(false);
export const [minimapOn, setMinimapOn] = createSignal<boolean>(true);
