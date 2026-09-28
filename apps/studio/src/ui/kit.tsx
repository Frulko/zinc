// Small styled components for the studio (shadcn-like: neutral zinc greys, 1 px borders, 6 px radii, 13 px Inter).
// Icons are Lucide-style 24x24 stroke paths drawn with zinc:svg in canvas nodes, cached per colour.
import { Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Svg } from 'zinc:svg';

// ---------------------------------------------------------------- icons
const ICONS = new Map<string, string>();
function icon(name: string, body: string): void { ICONS.set(name, body); }
icon('play', '<polygon points="6 3 20 12 6 21 6 3"/>');
icon('stop', '<rect x="5" y="5" width="14" height="14" rx="2"/>');
icon('save', '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>');
icon('open', '<path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>');
icon('new', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>');
icon('undo', '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>');
icon('redo', '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>');
icon('search', '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>');
icon('monitor', '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>');
icon('devices', '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>');
icon('trash', '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');
icon('copy', '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
icon('plus', '<path d="M5 12h14"/><path d="M12 5v14"/>');
icon('minus', '<path d="M5 12h14"/>');
icon('x', '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>');
icon('book', '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>');
icon('right', '<path d="M9 18l6-6-6-6"/>');
icon('down', '<path d="M6 9l6 6 6-6"/>');
icon('file', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>');
icon('folder', '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>');
icon('image', '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>');
icon('video', '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>');
icon('font', '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>');
icon('lottie', '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>');
icon('code', '<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>');
icon('fit', '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>');
icon('import', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>');
icon('deploy', '<path d="M22 2l-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>');
icon('wifi', '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>');
icon('server', '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>');
icon('terminal', '<path d="M4 17l6-6-6-6"/><path d="M12 19h8"/>');
icon('box', '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="M3.3 7l8.7 5 8.7-5"/><path d="M12 22V12"/>');
icon('plug', '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>');
icon('sliders', '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>');
icon('clear', '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>');

const cache = new Map<string, Svg>();
const HEX = '0123456789abcdef';
function hex(c: i32): string {
  let s = '';
  for (let k = 20; k >= 0; k -= 4) { const d = (c >> k) & 15; s += HEX.slice(d, d + 1); }
  return '#' + s;
}
/** The parsed icon for a colour (0xRRGGBB). */
export function iconSvg(name: string, color: i32): Svg {
  const key = `${name}/${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const body = ICONS.get(name) ?? ICONS.get('box') ?? '';
  const s = new Svg(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${hex(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`);
  cache.set(key, s);
  return s;
}

// ---------------------------------------------------------------- colours (Tailwind zinc scale)
export const C_TEXT = 0x18181b, C_MUTED = 0x71717a, C_SOFT = 0xa1a1aa, C_BORDER = 0xe4e4e7, C_BG = 0xfafafa, C_WHITE = 0xffffff;
export const C_ACCENT = 0x0284c7, C_RED = 0xdc2626, C_GREEN = 0x16a34a, C_AMBER = 0xd97706;

export interface IconProps { name: string; color?: i32; size?: i32; tint?: () => i32 }
/** <Icon name="play"/>: 16 px by default; `tint` makes the colour reactive (read each frame). */
export function Icon(props: IconProps): i32 {
  const c = ui.createNode(ui.CANVAS);
  const s = props.size ?? 16;
  ui.setClass(c, `w-[${s}] h-[${s}]`);
  const fixed = props.color ?? C_TEXT;
  const tint = props.tint;
  const name = props.name;
  ui.draw(c, (x: i32, y: i32, w: i32, h: i32) => { iconSvg(name, tint !== undefined ? tint() : fixed).draw(x, y, w, h, 255); });
  return c;
}

// ---------------------------------------------------------------- buttons
export interface ButtonProps { label: string; onClick: () => void; icon?: string; variant?: string; disabled?: () => boolean }
/** Text button. variant: primary (black), secondary (outlined, default), ghost, danger. */
export function Button(props: ButtonProps): i32 {
  const v = props.variant ?? 'secondary';
  const dis = props.disabled;
  const base = 'flex-row items-center gap-2 h-[30] px-3 rounded-md cursor-pointer transition-colors ';
  const style = v === 'primary' ? 'bg-zinc-900 hover:bg-zinc-700 active:bg-zinc-600'
    : v === 'danger' ? 'bg-red-600 hover:bg-red-500 active:bg-red-700'
    : v === 'ghost' ? 'bg-transparent hover:bg-zinc-100 active:bg-zinc-200'
    : 'bg-white border border-zinc-200 hover:bg-zinc-100 active:bg-zinc-200';
  // text colour goes on the <text> itself: zinc:ui text inherits colours from <text> ancestors only
  const label = v === 'primary' || v === 'danger' ? 'text-[13] font-medium text-white' : 'text-[13] font-medium text-zinc-800';
  const fg = v === 'primary' || v === 'danger' ? C_WHITE : C_TEXT;
  const ic = props.icon ?? '';
  return <button class={dis !== undefined && dis() ? base + 'bg-zinc-100 cursor-not-allowed' : base + style}
    onClick={() => { if (dis === undefined || !dis()) props.onClick(); }}>
    <Show when={ic !== ''}><Icon name={ic} tint={() => dis !== undefined && dis() ? C_SOFT : fg} size={14} /></Show>
    <text class={dis !== undefined && dis() ? 'text-[13] font-medium text-zinc-400' : label}>{props.label}</text>
  </button>;
}

export interface IconButtonProps { icon: string; onClick: () => void; active?: () => boolean; disabled?: () => boolean; color?: i32 }
/** Square 28 px icon button (toolbars). */
export function IconButton(props: IconButtonProps): i32 {
  const act = props.active, dis = props.disabled;
  const col = props.color ?? 0x3f3f46;
  return <button class={dis !== undefined && dis() ? 'w-[28] h-[28] items-center justify-center rounded-md bg-transparent cursor-not-allowed'
      : act !== undefined && act() ? 'w-[28] h-[28] items-center justify-center rounded-md bg-zinc-200 cursor-pointer'
      : 'w-[28] h-[28] items-center justify-center rounded-md bg-transparent hover:bg-zinc-100 active:bg-zinc-200 cursor-pointer transition-colors'}
    onClick={() => { if (dis === undefined || !dis()) props.onClick(); }}>
    <Icon name={props.icon} tint={() => dis !== undefined && dis() ? 0xd4d4d8 : col} />
  </button>;
}

// ---------------------------------------------------------------- layout pieces
export interface HeaderProps { title: string; icon?: string; children?: () => i32 }
/** Panel title bar: small uppercase label, optional icon and actions on the right. */
export function PanelHeader(props: HeaderProps): i32 {
  const ic = props.icon ?? '';
  const kids = props.children;
  const renderActions = (): i32 => kids !== undefined ? kids() : ui.createNode(ui.FRAGMENT);
  return <view class="flex-col">
    <view class="flex-row items-center gap-2 h-[36] px-3 bg-white">
      <Show when={ic !== ''}><Icon name={ic} color={C_MUTED} size={14} /></Show>
      <text class="text-[11] font-semibold text-zinc-500 tracking-wider">{props.title.toUpperCase()}</text>
      <view class="grow" />
      {renderActions()}
    </view>
    <HSep />
  </view>;
}

export interface TabsProps { tabs: string[]; current: () => string; onSelect: (t: string) => void }
/** Segmented tabs (shadcn TabsList). */
export function Tabs(props: TabsProps): i32 {
  const row = ui.createNode(ui.VIEW);
  ui.setClass(row, 'flex-row items-center gap-1 p-[3] rounded-lg bg-zinc-100');
  for (const t of props.tabs) {
    const name = t;
    const n = <button class={props.current() === name ? 'h-[26] px-3 items-center justify-center rounded-md bg-white shadow-sm cursor-pointer' : 'h-[26] px-3 items-center justify-center rounded-md bg-transparent hover:bg-zinc-50 cursor-pointer'}
      onClick={() => props.onSelect(name)}>
      <text class={props.current() === name ? 'text-[13] font-medium text-zinc-900' : 'text-[13] font-medium text-zinc-500'}>{name}</text>
    </button>;
    ui.insert(row, n, -1);
  }
  return row;
}

export interface FieldProps { label: string; error?: () => string; hint?: string; children: () => i32 }
/** Label, control, then the validation error (red) or the hint (grey). */
export function Field(props: FieldProps): i32 {
  const err = props.error;
  const hint = props.hint ?? '';
  return <view class="flex-col gap-1">
    <text class="text-[12] font-medium text-zinc-700">{props.label}</text>
    {props.children()}
    <Show when={(err !== undefined && err() !== '') || hint !== ''}>
      <text class={err !== undefined && err() !== '' ? 'text-[11] text-red-600' : 'text-[11] text-zinc-400'}>{err !== undefined && err() !== '' ? err() : hint}</text>
    </Show>
  </view>;
}

/** Class of a text input, red border when invalid. */
export function inputClass(invalid: boolean): string {
  return invalid ? 'w-full h-[30] px-2 rounded-md border border-red-400 bg-white text-[13] text-zinc-900 focus:border-red-500'
    : 'w-full h-[30] px-2 rounded-md border border-zinc-200 bg-white text-[13] text-zinc-900 focus:border-zinc-400';
}

export interface BadgeProps { label: string; color?: string }
export function Badge(props: BadgeProps): i32 {
  const c = props.color ?? 'zinc';
  const cls = c === 'green' ? 'bg-emerald-50 border-emerald-200' : c === 'amber' ? 'bg-amber-50 border-amber-200'
    : c === 'red' ? 'bg-red-50 border-red-200' : c === 'blue' ? 'bg-sky-50 border-sky-200' : 'bg-zinc-50 border-zinc-200';
  const fg = c === 'green' ? 'text-emerald-700' : c === 'amber' ? 'text-amber-700' : c === 'red' ? 'text-red-700' : c === 'blue' ? 'text-sky-700' : 'text-zinc-600';
  return <view class={`flex-row items-center h-[20] px-2 rounded-full border ${cls}`}><text class={`text-[11] font-medium ${fg}`}>{props.label}</text></view>;
}

/** A short vertical separator between toolbar groups. */
export function VSep(): i32 { return <view class="w-[1] h-[20] bg-zinc-200 mx-1" />; }
// zinc:ui borders are all-sides only: one-sided rules are 1 px views
/** Horizontal 1 px rule (in a column). */
export function HSep(): i32 { return <view class="h-[1] w-full bg-zinc-200" />; }
/** Vertical 1 px rule (in a row), full height. */
export function VLine(): i32 { return <view class="w-[1] h-full bg-zinc-200" />; }
