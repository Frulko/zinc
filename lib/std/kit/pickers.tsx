/** @jsxHelpers zinc:ui/kit/host */
// Quiet date, time, colour and value pickers. Values belong to the caller; imports create no UI or timers.
import * as ui from 'zinc:ui';
import { gradient, stroke } from 'zinc:gfx';
import { createNodeRef } from 'zinc:ui/solid';
import { componentRef, componentEffect, renderSlot, onCleanup, componentSignal, componentMemo } from './host';
import { theme } from './theme';
import { look } from '../platform/index';
import { Button as KitButton } from './button';
import { Input as TextField, Select, SearchField } from './input';
import { Popover, Tooltip } from './overlays';
import { Slider, RangeSlider } from './slider';
import { emojiCatalog, EmojiEntry } from './picker-emoji';
export { EmojiEntry } from './picker-emoji';
import { validDate, dateDay, dayDate, moveDate, moveMonth, dateWeekday, todayDate } from './picker-date';

function controlClass(): string { return `rounded-[10px] border border-${theme().input} text-${theme().foreground} focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`; }
function labelClass(): string { return `text-[13px] text-${theme().foreground}`; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function pad(value: number): string { return String(Math.floor(value)).padStart(2, '0'); }

export interface CalendarOptions {
  value: () => string;
  label?: string;
  month?: string;
  today?: string;
  min?: string;
  max?: string;
  weekStart?: number;
  disabledDate?: (date: string) => boolean;
  disabled?: boolean;
  className?: string;
}
export interface CalendarProps extends CalendarOptions { onChange: (date: string) => void }
export interface RangeCalendarProps extends CalendarOptions {
  end: () => string;
  onRangeChange: (start: string, end: string) => void;
  months?: number;
}
class CalendarSession {
  month: string; cursor: string; selected: string;
  constructor(date: string, month: string, offset: number) {
    this.month = moveMonth(month, offset).slice(0, 7) + '-01';
    this.cursor = moveMonth(date, offset);
    if (this.cursor.slice(0, 7) !== this.month.slice(0, 7)) this.cursor = this.month;
    this.selected = date;
  }
}
enum RangePhase { Start, End }
class RangeSession {
  phase = RangePhase.Start;
  preview = '';
  painters: (() => void)[] = [];
  calendars: CalendarSession[] = [];
}
function transitionRange(state: RangeSession, phase: RangePhase): void {
  if (state.phase === phase) return;
  state.phase = phase; state.preview = '';
}
function CalendarGrid(p: CalendarOptions, change: (date: string) => void, range: RangeCalendarProps | null, offset: number = 0, selection: RangeSession = new RangeSession()): i32 {
  const initial = validDate(p.value()) ? p.value() : validDate(p.month ?? '') ? p.month as string : p.today ?? todayDate();
  const state = componentRef(new CalendarSession(initial, validDate(p.month ?? '') ? p.month as string : initial, offset)).current;
  const heading = createNodeRef(), root = createNodeRef(), cells: i32[] = [], texts: i32[] = [];
  const startOfWeek = Math.floor(clamp(p.weekStart ?? 1, 0, 6));
  const allowed = (date: string): boolean => p.disabled !== true && validDate(date) && (p.min === undefined || date >= p.min) && (p.max === undefined || date <= p.max) && (p.disabledDate === undefined || !p.disabledDate(date));
  const cellDate = (index: number): string => dayDate(dateDay(state.month) - (dateWeekday(state.month) - startOfWeek + 7) % 7 + index);
  const paint = (): void => {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const today = p.today ?? todayDate();
    ui.setText(heading.node, names[Number(state.month.slice(5, 7)) - 1] + ' ' + state.month.slice(0, 4));
    if (!allowed(state.cursor)) {
      for (let i = 0; i < 42; i++) { const date = cellDate(i); if (allowed(date)) { state.cursor = date; break; } }
    }
    const end = range === null ? '' : selection.phase === RangePhase.End && selection.preview !== '' ? selection.preview : range.end();
    const low = end !== '' && end < p.value() ? end : p.value(), high = end > p.value() ? end : p.value();
    for (let i = 0; i < cells.length; i++) {
      const date = cellDate(i), chosen = date === p.value() || date === end, between = range !== null && end !== '' && date >= low && date <= high;
      ui.setText(texts[i], String(Number(date.slice(8, 10)))); ui.setLabel(cells[i], date);
      ui.setAttr(cells[i], 'aria-selected', String(chosen || between)); ui.setAttr(cells[i], 'aria-current', date === today ? 'date' : '');
      ui.setNumber(cells[i], 'disabled', allowed(date) ? 0 : 1); ui.setNumber(cells[i], 'tabIndex', date === state.cursor && allowed(date) ? 0 : -1);
      ui.setClass(cells[i], `w-9 h-9 items-center justify-center rounded-[8px] ${date.slice(0, 7) === state.month.slice(0, 7) ? '' : 'opacity-45'} ${controlClass()} border-${date === today ? theme().accent : 'transparent'} bg-${chosen ? theme().accent : between ? theme().accentSoft : 'transparent'}`);
      ui.setClass(texts[i], `text-[13px] tabular-nums text-${chosen ? theme().accentForeground : theme().foreground}`);
    }
  };
  const choose = (date: string): void => {
    if (!allowed(date)) return;
    state.cursor = date;
    if (range !== null && selection.phase === RangePhase.End) {
      const start = Math.min(dateDay(date), dateDay(p.value())), end = Math.max(dateDay(date), dateDay(p.value()));
      if (p.disabledDate !== undefined) for (let day = start; day <= end; day++) if (!allowed(dayDate(day))) return;
    }
    if (range === null) change(date);
    else if (selection.phase === RangePhase.Start) { transitionRange(selection, RangePhase.End); range.onRangeChange(date, ''); }
    else { transitionRange(selection, RangePhase.Start);  range.onRangeChange(date < p.value() ? date : p.value(), date < p.value() ? p.value() : date); }
    paint();
  };
  const shiftMonths = (months: number): void => {
    const calendars = range === null ? [state] : selection.calendars;
    for (const calendar of calendars) {
      calendar.cursor = moveMonth(calendar.cursor, months);
      calendar.month = moveMonth(calendar.month, months).slice(0, 7) + '-01';
    }
    if (range === null) paint(); else for (const repaint of selection.painters) repaint();
  };
  const navigate = (date: string): void => {
    const months = (Number(date.slice(0, 4)) - Number(state.month.slice(0, 4))) * 12 + Number(date.slice(5, 7)) - Number(state.month.slice(5, 7));
    if (months !== 0) shiftMonths(months);
    state.cursor = date; state.month = date.slice(0, 7) + '-01'; paint();
    for (let i = 0; i < cells.length; i++) if (cellDate(i) === date) ui.focusNode(cells[i]);
  };
  const key = (date: string, e: ui.KeyEvent): void => {
    let next = date;
    if (e.key === 'ArrowLeft') next = moveDate(date, -1);
    else if (e.key === 'ArrowRight') next = moveDate(date, 1);
    else if (e.key === 'ArrowUp') next = moveDate(date, -7);
    else if (e.key === 'ArrowDown') next = moveDate(date, 7);
    else if (e.key === 'Home') next = moveDate(date, -(dateWeekday(date) - startOfWeek + 7) % 7);
    else if (e.key === 'End') next = moveDate(date, 6 - (dateWeekday(date) - startOfWeek + 7) % 7);
    else if (e.key === 'PageUp' || e.key === 'PageDown') next = moveMonth(date, (e.key === 'PageUp' ? -1 : 1) * (e.shift ? 12 : 1));
    else if (e.key === 'Escape' && range !== null) { transitionRange(selection, RangePhase.Start); for (const repaint of selection.painters) repaint(); e.preventDefault(); return; }
    else return;
    if (p.min !== undefined && next < p.min) next = p.min;
    if (p.max !== undefined && next > p.max) next = p.max;
    for (let i = 0; i < 366 && !allowed(next); i++) next = moveDate(next, next < date ? -1 : 1);
    if (allowed(next)) navigate(next);
    e.preventDefault();
  };
  const rows: number[][] = [];
  for (let r = 0; r < 6; r++) rows.push([r * 7, r * 7 + 1, r * 7 + 2, r * 7 + 3, r * 7 + 4, r * 7 + 5, r * 7 + 6]);
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const node = <View ref={root} role="grid" aria-label={p.label ?? 'Calendar'} disabled={p.disabled === true} className={`flex-col gap-2 w-[276px] ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <View className="flex-row items-center justify-between">
      <Tooltip label="Previous month"><KitButton label="‹" ariaLabel="Previous month" variant="ghost" size="sm" disabled={p.disabled} onClick={() => shiftMonths(-1)} /></Tooltip>
      <Text ref={heading} aria-live="polite" className={labelClass()} />
      <Tooltip label="Next month"><KitButton label="›" ariaLabel="Next month" variant="ghost" size="sm" disabled={p.disabled} onClick={() => shiftMonths(1)} /></Tooltip>
    </View>
    <View role="row" className="flex-row gap-1">{weekdays.map((name: string, i: i32) => <Text role="columnheader" className={`w-9 text-center text-[11px] text-${theme().mutedForeground}`}>{weekdays[(i + startOfWeek) % 7]}</Text>)}</View>
    {rows.map((row: number[]) => <View role="row" className="flex-row gap-1">{row.map((index: number) => renderSlot(() => {
      const ref = createNodeRef(), text = createNodeRef();
      const cell = <Button ref={ref} role="gridcell" onClick={() => choose(cellDate(index))} onKeyDown={(e: ui.KeyEvent) => key(cellDate(index), e)}
        onPointerEnter={(e: ui.PointerEvent) => { if (selection.phase === RangePhase.End) { selection.preview = cellDate(index); for (const repaint of selection.painters) repaint(); } }}>
        <Text ref={text} />
      </Button>;
      cells.push(ref.node); texts.push(text.node); return cell;
    }))}</View>)}
  </View>;
  componentEffect(() => {
    const date = p.value();
    if (validDate(date) && date !== state.selected) {
      state.selected = date; state.cursor = moveMonth(date, offset); state.month = state.cursor.slice(0, 7) + '-01';
    }
    if (range !== null) range.end();
    theme(); paint(); return undefined;
  });
  selection.painters.push(paint);
  selection.calendars.push(state);
  onCleanup(() => {
    const index = selection.painters.indexOf(paint), calendar = selection.calendars.indexOf(state);
    if (index >= 0) selection.painters.splice(index, 1);
    if (calendar >= 0) selection.calendars.splice(calendar, 1);
  });
  return node;
}
interface CalendarMonthProps {
  options: CalendarOptions;
  change: (date: string) => void;
  range: RangeCalendarProps | null;
  offset: number;
  selection: RangeSession;
}
function CalendarMonth(p: CalendarMonthProps): i32 {
  return CalendarGrid(p.options, p.change, p.range, p.offset, p.selection);
}
export function Calendar(p: CalendarProps): i32 { return CalendarGrid(p, p.onChange, null); }
export function RangeCalendar(p: RangeCalendarProps): i32 {
  const selection = componentRef(new RangeSession()).current;
  return <View className="flex-row flex-wrap gap-4">
    <CalendarMonth options={p} change={(date: string) => {}} range={p} offset={0} selection={selection} />
    <Show when={p.months === 2}><CalendarMonth options={p} change={(date: string) => {}} range={p} offset={1} selection={selection} /></Show>
  </View>;
}
export interface DatePickerProps extends CalendarProps { placeholder?: string; width?: number }
export function DatePicker(p: DatePickerProps): i32 {
  return <View disabled={p.disabled === true} className={`w-[${p.width ?? 180}px] ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}><Popover label={p.label ?? 'Choose date'} width={308} trigger={() => <Text className={labelClass()}>{p.value() !== '' ? p.value() : p.placeholder ?? 'Choose date'}</Text>}>
    <Calendar value={p.value} onChange={p.onChange} label={p.label} min={p.min} max={p.max} month={p.month} today={p.today} weekStart={p.weekStart} disabledDate={p.disabledDate} disabled={p.disabled} />
  </Popover></View>;
}
export interface DateRangePickerProps extends RangeCalendarProps { placeholder?: string; presets?: boolean }
export function DateRangePicker(p: DateRangePickerProps): i32 {
  const preset = (days: number): void => {
    const today = p.today ?? todayDate(), start = moveDate(today, 1 - days);
    if (p.disabled === true || p.min !== undefined && start < p.min || p.max !== undefined && today > p.max) return;
    for (let i = 0; i < days; i++) if (p.disabledDate !== undefined && p.disabledDate(moveDate(start, i))) return;
    p.onRangeChange(start, today);
  };
  return <View disabled={p.disabled === true} className={p.disabled === true ? 'opacity-45' : ''}><Popover label={p.label ?? 'Choose date range'} width={p.months === 2 ? 600 : 308} trigger={() => <Text className={labelClass()}>{p.value() === '' ? p.placeholder ?? 'Choose date range' : p.value() + ' — ' + (p.end() !== '' ? p.end() : 'Choose end')}</Text>}>
    <RangeCalendar value={p.value} end={p.end} onRangeChange={p.onRangeChange} label={p.label} month={p.month} today={p.today} months={p.months} min={p.min} max={p.max} disabled={p.disabled} disabledDate={p.disabledDate} weekStart={p.weekStart} />
    <Show when={p.presets !== false}><View className="flex-row gap-2"><KitButton label="Today" size="sm" variant="ghost" disabled={p.disabled} onClick={() => preset(1)} /><KitButton label="Last 7 days" size="sm" variant="ghost" disabled={p.disabled} onClick={() => preset(7)} /><KitButton label="Last 30 days" size="sm" variant="ghost" disabled={p.disabled} onClick={() => preset(30)} /></View></Show>
  </Popover></View>;
}

enum ScrollSelectionState { Initial, Ready }
class ScrollSelection { state = ScrollSelectionState.Initial; value = 0; }
function syncScrollSelection(selection: ScrollSelection, value: number): void {
  selection.value = value;
  selection.state = ScrollSelectionState.Ready;
}
export interface WheelPickerProps {
  items: string[]; value: () => number; onChange: (index: number) => void;
  label?: string; rows?: number; width?: number; loop?: boolean; joinLeft?: boolean; joinRight?: boolean; disabled?: boolean; className?: string;
}
export function WheelPicker(p: WheelPickerProps): i32 {
  const ref = createNodeRef(), selected = componentRef(new ScrollSelection()).current;
  const rows = Math.max(3, Math.floor(p.rows ?? 5) | 1), padding = (rows - 1) * 18;
  const length = p.items.length;
  const copies = p.loop === true && length > 0 ? Math.max(3, Math.ceil(rows / length) + 2) | 1 : 1;
  const middle = Math.floor(copies / 2) * length;
  const indices: number[] = [];
  for (let i = 0; i < length * copies; i++) indices.push(i);
  const normalize = (index: number): number => p.loop === true && length > 0
    ? (index % length + length) % length : clamp(index, 0, length - 1);
  const choose = (index: number, animated: boolean): void => {
    if (p.disabled === true || length === 0) return;
    const next = normalize(index);
    syncScrollSelection(selected, next);
    p.onChange(next);
    ui.scrollTo(ref.node, 0, (middle + next) * 36, animated);
  };
  const node = <View className={`relative ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <View className={`absolute left-0 right-0 top-[${padding}px] h-9 rounded-[8px] ${p.joinLeft === true ? 'rounded-l-none' : ''} ${p.joinRight === true ? 'rounded-r-none' : ''} bg-${theme().accentSoft} pointer-events-none`} />
    <ScrollView ref={ref} role="listbox" aria-label={p.label ?? 'Wheel'} disabled={p.disabled === true} tabIndex={0}
      className={`h-[${rows * 36}px] w-[${p.width ?? 100}px] snap-y snap-mandatory ${controlClass()} ${p.joinLeft === true ? 'rounded-l-none border-l-0' : ''} ${p.joinRight === true ? 'rounded-r-none' : ''}`}
      onScroll={(e: ui.ResponderEvent, g: ui.GestureState) => {
        if (p.disabled === true || length === 0) return;
        const position = Math.round(e.nativeEvent.contentOffset.y / 36), next = normalize(position);
        if (next !== selected.value) { syncScrollSelection(selected, next); p.onChange(next); }
        // Recenter repeated rows without stopping the scroll engine's current velocity or snap target.
        if (p.loop === true && (position < middle - length / 2 || position > middle + length * 1.5))
          ui.scrollBy(ref.node, 0, (middle + next - position) * 36);
      }} onKeyDown={(e: ui.KeyEvent) => {
        const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'PageDown' ? rows : e.key === 'PageUp' ? -rows : 0;
        if (delta === 0 && e.key !== 'Home' && e.key !== 'End') return;
        choose(e.key === 'Home' ? 0 : e.key === 'End' ? length - 1 : p.value() + delta, false);
        e.preventDefault();
      }}>
      <View className={`h-[${padding}px] shrink-0`} />
      {indices.map((index: number) => <Button role="option" aria-label={p.items[index % length]}
        aria-hidden={index < middle || index >= middle + length} aria-selected={String(p.value() === index % length)} tabIndex={-1}
        className="h-9 shrink-0 snap-center items-center justify-center" onClick={() => choose(index % length, !ui.prefersReducedMotion())}>
        <Text className={`text-[13px] tabular-nums text-${p.value() === index % length ? theme().accent : theme().mutedForeground}`}>{p.items[index % length]}</Text>
      </Button>)}
      <View className={`h-[${padding}px] shrink-0`} />
    </ScrollView>
  </View>;
  componentEffect(() => {
    const current = Math.round(normalize(p.value()));
    if (selected.state === ScrollSelectionState.Initial || current !== selected.value) { syncScrollSelection(selected, current); ui.scrollTo(ref.node, 0, (middle + current) * 36); }
    return undefined;
  });
  return node;
}
export interface TimePickerProps {
  value: () => number; onChange: (minutes: number) => void; label?: string;
  twelveHour?: boolean; minuteStep?: number; disabled?: boolean; className?: string;
}
function timeStep(p: TimePickerProps): number { return Math.floor(clamp(p.minuteStep ?? 1, 1, 60)); }
function timeValue(value: number): number { return Math.floor(clamp(value, 0, 1439)); }
function timeLabel(value: number, twelveHour: boolean): string {
  const minute = timeValue(value), hour = Math.floor(minute / 60);
  return pad(twelveHour ? hour % 12 === 0 ? 12 : hour % 12 : hour) + ':' + pad(minute % 60) + (twelveHour ? hour >= 12 ? ' PM' : ' AM' : '');
}
export function TimePicker(p: TimePickerProps): i32 {
  const hours: string[] = [], minutes: string[] = [], step = timeStep(p);
  for (let i = 0; i < (p.twelveHour === true ? 12 : 24); i++) hours.push(p.twelveHour === true ? pad(i + 1) : pad(i));
  for (let i = 0; i < 60; i += step) minutes.push(pad(i));
  const hour = (): number => Math.floor(timeValue(p.value()) / 60);
  const setHour = (index: number): void => p.onChange((p.twelveHour === true ? (index + 1) % 12 + (hour() >= 12 ? 12 : 0) : index) * 60 + timeValue(p.value()) % 60);
  return <View disabled={p.disabled === true} className={p.disabled === true ? 'opacity-45' : ''}><Popover label={p.label ?? 'Choose time'} width={p.twelveHour === true ? 300 : 216} trigger={() => <Text className={labelClass()}>{timeLabel(p.value(), p.twelveHour === true)}</Text>}>
    <View className={`flex-row items-center gap-1 ${p.className ?? ''}`}>
      <WheelPicker label={(p.label ?? 'Time') + ' hour'} items={hours} value={() => p.twelveHour === true ? (hour() % 12 + 11) % 12 : hour()} onChange={setHour} width={88} loop={true} disabled={p.disabled} />
      <Text className={labelClass()}>:</Text>
      <WheelPicker label={(p.label ?? 'Time') + ' minute'} items={minutes} value={() => Math.floor(timeValue(p.value()) % 60 / step)} onChange={(index: number) => p.onChange(hour() * 60 + index * step)} width={88} loop={true} disabled={p.disabled} />
      <Show when={p.twelveHour === true}><WheelPicker label={(p.label ?? 'Time') + ' period'} items={['AM', 'PM']} value={() => hour() >= 12 ? 1 : 0} onChange={(index: number) => p.onChange((hour() % 12 + index * 12) * 60 + timeValue(p.value()) % 60)} width={72} rows={3} disabled={p.disabled} /></Show>
    </View>
  </Popover></View>;
}
enum DialMode { Hours, Minutes }
export interface TimeDialProps {
  value: () => number; onChange: (minutes: number) => void; label?: string;
  minuteStep?: number; size?: number; disabled?: boolean; className?: string;
}
export function TimeDial(p: TimeDialProps): i32 {
  const [mode, setMode] = componentSignal(DialMode.Hours);
  const face = createNodeRef(), size = clamp(p.size ?? 240, 180, 360);
  const set = (value: number): void => { if (p.disabled !== true) p.onChange(timeValue(value)); };
  const pick = (e: ui.PointerEvent): void => {
    const x = e.x - size / 2, y = e.y - size / 2, angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
    const hour = Math.floor(timeValue(p.value()) / 60), minute = timeValue(p.value()) % 60;
    if (mode() === DialMode.Minutes) set(hour * 60 + Math.round(Math.round(angle / (Math.PI * 2) * 60) / timeStep(p)) * timeStep(p) % 60);
    else { const outer = Math.round(angle / (Math.PI * 2) * 12) % 12; set((Math.sqrt(x * x + y * y) < size * 0.30 ? outer === 0 ? 0 : outer + 12 : outer === 0 ? 12 : outer) * 60 + minute); }
  };
  const values: number[] = []; for (let i = 0; i < 24; i++) values.push(i);
  return <View className={`flex-col gap-3 items-center ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <View className="flex-row gap-2"><KitButton label="Hours" size="sm" variant="outline" disabled={p.disabled} onClick={() => { setMode(DialMode.Hours); ui.focusNode(face.node); }} /><Text className={`text-[17px] tabular-nums text-${theme().foreground}`}>{timeLabel(p.value(), false)}</Text><KitButton label="Minutes" size="sm" variant="outline" disabled={p.disabled} onClick={() => { setMode(DialMode.Minutes); ui.focusNode(face.node); }} /></View>
    <Button ref={face} role="slider" aria-label={p.label ?? 'Time dial'} aria-valuemin="0" aria-valuemax="1439" aria-valuenow={String(timeValue(p.value()))} aria-valuetext={timeLabel(p.value(), false)} disabled={p.disabled === true}
      className={`w-[${size}px] h-[${size}px] rounded-full border border-${theme().input} bg-${theme().card} focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`}
      onPointerDown={pick} onDrag={(e: ui.PointerEvent) => { if (e.phase < 2) pick(e); }} onPointerUp={(e: ui.PointerEvent) => { pick(e); setMode(DialMode.Minutes); }}
      onKeyDown={(e: ui.KeyEvent) => {
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (e.key === 'h') setMode(DialMode.Hours);
        else if (e.key === 'm') setMode(DialMode.Minutes);
        else if (delta !== 0) set(p.value() + delta * (mode() === DialMode.Hours ? 60 : timeStep(p)) * (e.shift ? 10 : 1));
        else if (e.key === 'Home') set(0); else if (e.key === 'End') set(1439); else return;
        e.preventDefault();
      }}>
      <Show when={mode() === DialMode.Hours}>{values.map((hour: number) => <Text className={`absolute text-[${hour === 0 || hour > 12 ? 11 : 13}px] text-${Math.floor(timeValue(p.value()) / 60) === hour ? theme().accent : theme().mutedForeground}`}
        style={{ left: size / 2 + Math.sin(hour % 12 / 12 * Math.PI * 2) * size * (hour === 0 || hour > 12 ? 0.24 : 0.40) - 10, top: size / 2 - Math.cos(hour % 12 / 12 * Math.PI * 2) * size * (hour === 0 || hour > 12 ? 0.24 : 0.40) - 8, width: 20 }}>{pad(hour)}</Text>)}</Show>
      <Show when={mode() === DialMode.Minutes}>{values.slice(0, 12).map((index: number) => <Text className={`absolute text-[13px] text-${Math.round(timeValue(p.value()) % 60 / 5) % 12 === index ? theme().accent : theme().mutedForeground}`} style={{ left: size / 2 + Math.sin(index / 12 * Math.PI * 2) * size * 0.40 - 10, top: size / 2 - Math.cos(index / 12 * Math.PI * 2) * size * 0.40 - 8, width: 20 }}>{pad(index * 5)}</Text>)}</Show>
      <View className={`absolute w-1 rounded-full origin-bottom bg-${theme().accent}`} style={{ left: size / 2 - 2, top: size / 2 - size * 0.32, height: size * 0.32, rotate: mode() === DialMode.Hours ? Math.floor(timeValue(p.value()) / 60) % 12 * 30 : timeValue(p.value()) % 60 * 6 }} />
    </Button>
    <Text className={`text-[11px] text-${theme().mutedForeground}`}>H: hours · M: minutes · arrows: change</Text>
  </View>;
}

interface ValuePickerProps {
  value: () => number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number; format?: (value: number) => string;
  disabled?: boolean; accessibilityLabel?: string; className?: string;
}
export interface RulerSliderProps extends ValuePickerProps { majorEvery?: number; spacing?: number; unit?: string; width?: number }
export function RulerSlider(p: RulerSliderProps): i32 {
  const min = p.min ?? 0, max = Math.max(min, p.max ?? 100), step = Math.max(0.000001, p.step ?? 1), spacing = Math.max(8, p.spacing ?? 12), width = Math.max(120, p.width ?? 300);
  const count = Math.ceil((max - min) / step) + 1, major = Math.max(1, Math.floor(p.majorEvery ?? 10));
  if (count > 4096) throw new Error('RulerSlider: at most 4096 ticks; increase step');
  const ticks: number[] = []; for (let i = 0; i < count; i++) ticks.push(i);
  const ref = createNodeRef(), selected = componentRef(new ScrollSelection()).current;
  const valueAt = (index: number): number => Math.min(max, min + Math.round(clamp(index, 0, count - 1)) * step);
  const tickAt = (value: number): number => value >= max ? count - 1 : Math.round((value - min) / step);
  const choose = (value: number): void => { if (p.disabled !== true) { syncScrollSelection(selected, valueAt((value - min) / step)); p.onChange(selected.value); ui.scrollTo(ref.node, tickAt(selected.value) * spacing, 0); } };
  const text = (value: number): string => (p.format !== undefined ? p.format(value) : String(Number(value.toFixed(6)))) + (p.unit ?? '');
  const node = <View className={`flex-col gap-2 w-[${width}px] ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <Text className={`text-[13px] tabular-nums text-${theme().foreground}`}>{text(p.value())}</Text>
    <View className="relative">
      <View className={`absolute top-0 h-7 w-[2px] bg-${theme().accent} pointer-events-none`} style={{ left: width / 2 }} />
      <View ref={ref} role="slider" tabIndex={0} aria-label={p.accessibilityLabel ?? 'Ruler'} aria-valuemin={String(min)} aria-valuemax={String(max)} aria-valuenow={String(p.value())} aria-valuetext={text(p.value())} disabled={p.disabled === true}
        className={`flex-row overflow-x-auto snap-x snap-mandatory h-[54px] ${controlClass()}`}
        onScroll={(e: ui.ResponderEvent, g: ui.GestureState) => { const next = valueAt(e.nativeEvent.contentOffset.x / spacing); if (p.disabled !== true && next !== selected.value) { syncScrollSelection(selected, next); p.onChange(next); } }}
        onKeyDown={(e: ui.KeyEvent) => {
          const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'PageUp' ? 10 : e.key === 'PageDown' ? -10 : 0;
          if (d !== 0 || e.key === 'Home' || e.key === 'End') { choose(e.key === 'Home' ? min : e.key === 'End' ? max : p.value() + d * step * (e.shift ? 10 : 1)); e.preventDefault(); }
        }}>
        <View className={`w-[${(width - spacing) / 2}px] shrink-0`} />
        {ticks.map((index: number) => <Button tabIndex={-1} aria-label={text(valueAt(index))} className={`w-[${spacing}px] shrink-0 h-[50px] items-center snap-center`} onClick={() => choose(valueAt(index))}>
          <View className={`w-px h-[${index % major === 0 ? 22 : 10}px] bg-${theme().input}`} />
          <Show when={index % major === 0}><Text className={`text-[10px] text-${theme().mutedForeground}`}>{text(valueAt(index))}</Text></Show>
        </Button>)}
        <View className={`w-[${(width - spacing) / 2}px] shrink-0`} />
      </View>
    </View>
  </View>;
  componentEffect(() => { const next = p.value(); if (selected.state === ScrollSelectionState.Initial || next !== selected.value) { syncScrollSelection(selected, next); ui.scrollTo(ref.node, tickAt(next) * spacing, 0); } return undefined; });
  return node;
}
export interface HistogramSliderProps {
  low: () => number; high: () => number; onChange: (low: number, high: number) => void;
  bins: number[]; height?: number; min?: number; max?: number; step?: number;
  format?: (value: number) => string; showValue?: boolean; disabled?: boolean;
  accessibilityLabel?: string; className?: string;
}
export function HistogramSlider(p: HistogramSliderProps): i32 {
  const min = p.min ?? 0, max = Math.max(min, p.max ?? 100);
  let top = 1; for (const bin of p.bins) if (Number.isFinite(bin)) top = Math.max(top, bin);
  return <View className={`flex-col ${p.className ?? ''}`}>
    <View className={`flex-row items-end gap-px h-[${p.height ?? 72}px] pointer-events-none`}>
      {p.bins.map((bin: number, index: i32) => <View className={`grow h-${Math.round(clamp(bin / top, 0, 1) * 10000)}/10000 bg-${min + (index + 0.5) / p.bins.length * (max - min) >= p.low() && min + (index + 0.5) / p.bins.length * (max - min) <= p.high() ? theme().accent : theme().muted}`} />)}
    </View>
    <RangeSlider low={p.low} high={p.high} onChange={p.onChange} min={min} max={max} step={p.step} accessibilityLabel={p.accessibilityLabel ?? 'Histogram'} format={p.format} showValue={p.showValue ?? true} disabled={p.disabled} />
  </View>;
}
function knobArc(x: number, y: number, size: number, from: number, to: number, color: i32): void {
  const points: number[] = [], steps = Math.max(1, Math.ceil(Math.abs(to - from) * 48)), radius = size / 2 - 4;
  for (let i = 0; i <= steps; i++) {
    const angle = (-135 + (from + (to - from) * i / steps) * 270) * Math.PI / 180;
    points.push(x + size / 2 + Math.sin(angle) * radius);
    points.push(y + size / 2 - Math.cos(angle) * radius);
  }
  stroke(points, 4, color as u32, 255, false);
}
export interface KnobProps extends ValuePickerProps { label?: string; unit?: string; size?: number; bipolar?: boolean; hideValue?: boolean; logarithmic?: boolean; reset?: number }
export function Knob(p: KnobProps): i32 {
  const knob = createNodeRef();
  const min = p.min ?? 0, max = Math.max(min, p.max ?? 100), step = p.step ?? 1, size = Math.max(40, p.size ?? 64), previousY = componentRef(0), dragRatio = componentRef(0);
  const ratio = (): number => max === min ? 0 : p.logarithmic === true && min > 0 ? clamp(Math.log(Math.max(min, p.value()) / min) / Math.log(max / min), 0, 1) : clamp((p.value() - min) / (max - min), 0, 1);
  const commit = (value: number): void => { if (p.disabled !== true) p.onChange(clamp(step > 0 ? min + Math.round((value - min) / step) * step : value, min, max)); };
  const reset = (): void => commit(p.reset ?? 0);
  const text = (): string => (p.format !== undefined ? p.format(p.value()) : String(Number(p.value().toFixed(4)))) + (p.unit ?? '');
  const key = (e: ui.KeyEvent): void => {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : e.key === 'PageUp' ? 10 : e.key === 'PageDown' ? -10 : 0;
    if (e.key === 'Delete' || e.key === 'Backspace') reset();
    else if (e.key === 'Home') commit(min); else if (e.key === 'End') commit(max);
    else if (d !== 0) commit(p.value() + d * (step > 0 ? step : (max - min) / 100) * (e.shift ? 10 : 1)); else return;
    e.preventDefault();
  };
  return <View className={`flex-col items-center gap-2 ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <Show when={p.label !== undefined}><Text className={labelClass()}>{p.label ?? ''}</Text></Show>
    <Button ref={knob} role="slider" aria-label={p.accessibilityLabel ?? p.label ?? 'Knob'} aria-valuemin={String(min)} aria-valuemax={String(max)} aria-valuenow={String(p.value())} aria-valuetext={text()} disabled={p.disabled === true}
      className={`relative w-[${size}px] h-[${size}px] rounded-full bg-${theme().card} focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`} grab="keep" onKeyDown={key}
      onDoubleClick={reset} onDrag={(e: ui.PointerEvent) => {
        if (e.phase === 0) { previousY.current = 0; dragRatio.current = ratio(); }
        if (e.phase < 2) { const delta = (previousY.current - e.dy) / (e.shift ? 2000 : 200); previousY.current = e.dy; dragRatio.current = clamp(dragRatio.current + delta, 0, 1); const r = dragRatio.current; commit(p.logarithmic === true && min > 0 ? min * Math.pow(max / min, r) : min + r * (max - min)); }
      }} onWheel={(e: ui.PointerEvent) => { if (ui.focused() === knob.node) commit(p.value() + Math.sign(e.wheel) * (step > 0 ? step : (max - min) / 100)); }}>
      <Canvas className="absolute inset-0 pointer-events-none" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        const value = ratio(), start = p.bipolar === true && max > min ? clamp((0 - min) / (max - min), 0, 1) : 0;
        knobArc(x, y, w, 0, 1, ui.tailwindColor(theme().muted));
        if (value !== start) knobArc(x, y, w, Math.min(start, value), Math.max(start, value), ui.tailwindColor(theme().accent));
      }} />
      <View className="absolute inset-0 items-center" style={{ rotate: -135 + ratio() * 270 }}><View className={`w-[3px] h-[${size * 0.23}px] rounded-full bg-${theme().accent}`} /></View>
      <Show when={p.bipolar === true}><View className={`absolute top-0 w-px h-1 bg-${theme().foreground}`} style={{ left: size / 2 }} /></Show>
    </Button>
    <Show when={p.hideValue !== true}><Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{text()}</Text></Show>
  </View>;
}
export interface FaderProps extends ValuePickerProps { label?: string; unit?: string; length?: number; horizontal?: boolean; ticks?: number[]; markers?: number[]; meter?: () => number[]; hideValue?: boolean; logarithmic?: boolean; reset?: number }
export function Fader(p: FaderProps): i32 {
  const root = createNodeRef(), length = Math.max(40, p.length ?? 180), min = p.min ?? 0, max = Math.max(min, p.max ?? 100), thumb = look().sliderThumb;
  const position = (value: number): number => {
    const ratio = max === min ? 0 : p.logarithmic === true && min > 0 ? Math.log(Math.max(min, value) / min) / Math.log(max / min) : (value - min) / (max - min);
    return thumb / 2 + clamp(ratio, 0, 1) * (length - thumb);
  };
  return <View ref={root} onWheel={(e: ui.PointerEvent) => { if (p.disabled !== true && e.wheel !== 0 && ui.hasFocusWithin(root.node)) ui.sendKey(e.wheel > 0 ? 'ArrowUp' : 'ArrowDown', e.shift ? ui.SHIFT : 0); }} className={`flex-col gap-2 ${p.className ?? ''}`}>
    <Show when={p.label !== undefined}><Text className={labelClass()}>{p.label ?? ''}</Text></Show>
    <View className={`gap-1 ${p.horizontal === true ? 'flex-col items-start' : 'flex-row items-end'}`}>
      <Slider value={p.value} onChange={p.onChange} min={p.min} max={p.max} step={p.step} logarithmic={p.logarithmic} disabled={p.disabled} vertical={p.horizontal !== true} markers={p.ticks ?? p.markers} reset={p.reset ?? 0} accessibilityLabel={p.accessibilityLabel ?? p.label ?? 'Fader'}
        className={p.horizontal === true ? `w-[${length}px]` : `h-[${length}px]`} />
      <Show when={p.ticks !== undefined}><View className={p.horizontal === true ? `relative h-5 w-[${length}px]` : `relative h-[${length}px] w-8`}>
        {(p.ticks ?? []).filter((tick: number) => Number.isFinite(tick) && tick >= min && tick <= max).map((tick: number) => <Text className={`absolute w-8 text-[10px] tabular-nums text-${theme().mutedForeground} ${p.horizontal === true ? 'text-center' : ''}`}
          style={{ left: p.horizontal === true ? position(tick) - 16 : 0, top: p.horizontal === true ? 0 : length - position(tick) - 6 }}>{p.format !== undefined ? p.format(tick) : String(Number(tick.toFixed(4)))}</Text>)}
      </View></Show>
      <Show when={p.meter !== undefined}>{(p.meter !== undefined ? p.meter() : []).map((level: number) => <View role="meter" aria-label={(p.label ?? 'Fader') + ' level'} aria-valuenow={String(clamp(level, 0, 1))} className={`${p.horizontal === true ? 'h-1 w-[' + length + 'px] flex-row' : 'w-1 h-[' + length + 'px] justify-end'} bg-${theme().muted}`}><View className={`${p.horizontal === true ? 'h-full w-' : 'w-full h-'}${Math.round(clamp(level, 0, 1) * 10000)}/10000 bg-${theme().accent}`} /></View>)}</Show>
    </View>
    <Show when={p.hideValue !== true}><Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{(p.format !== undefined ? p.format(p.value()) : String(Number(p.value().toFixed(4)))) + (p.unit ?? '')}</Text></Show>
  </View>;
}

export interface ColorPickerProps { value: () => string; onChange: (color: string) => void; label?: string; swatches?: string[]; alpha?: boolean; disabled?: boolean; className?: string }
function colorChannels(value: string): number[] {
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) return [0, 0, 0, 255];
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), value.length === 9 ? parseInt(value.slice(7, 9), 16) : 255];
}
function hsvColor(h: number, s: number, v: number): string {
  const sector = (h % 360 + 360) % 360 / 60, chroma = v * s, x = chroma * (1 - Math.abs(sector % 2 - 1)), m = v - chroma;
  const values = sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x] : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return '#' + values.map((channel: number) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}
function colorHSV(value: string): number[] {
  const channels = colorChannels(value), r = channels[0] / 255, g = channels[1] / 255, b = channels[2] / 255, top = Math.max(r, g, b), bottom = Math.min(r, g, b), d = top - bottom;
  const hue = d === 0 ? 0 : top === r ? ((g - b) / d + 6) % 6 : top === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, top === 0 ? 0 : d / top, top];
}
export function ColorPicker(p: ColorPickerProps): i32 {
  const square = createNodeRef(), retainedHue = componentRef(0);
  const hsv = (): number[] => { const values = colorHSV(p.value()); if (values[1] > 0) retainedHue.current = values[0]; else values[0] = retainedHue.current; return values; };
  const emit = (h: number, s: number, v: number): void => { retainedHue.current = h; if (p.disabled !== true) p.onChange(hsvColor(h, clamp(s, 0, 1), clamp(v, 0, 1)) + (p.alpha === true ? padHex(colorChannels(p.value())[3]) : '')); };
  const at = (e: ui.PointerEvent): void => { const box = ui.inspectNode(square.node), values = hsv(); if (box !== null) emit(values[0], e.x / Math.max(1, box.lw), 1 - e.y / Math.max(1, box.lh)); };
  return <View role="group" aria-label={p.label ?? 'Color'} className={`flex-col gap-3 w-[276px] ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`} disabled={p.disabled === true}>
    <Show when={p.label !== undefined}><Text className={labelClass()}>{p.label ?? ''}</Text></Show>
    <Button ref={square} role="slider" aria-label={(p.label ?? 'Color') + ' saturation and brightness'} aria-valuetext={Math.round(hsv()[1] * 100) + '% saturation, ' + Math.round(hsv()[2] * 100) + '% brightness'}
      className={`h-[150px] w-full overflow-hidden ${controlClass()}`} grab="keep" onPointerDown={at} onDrag={(e: ui.PointerEvent) => { if (e.phase < 2) at(e); }}
      onKeyDown={(e: ui.KeyEvent) => {
        const values = hsv(), step = e.shift ? 0.1 : 0.01;
        if (e.key === 'ArrowLeft') values[1] -= step; else if (e.key === 'ArrowRight') values[1] += step;
        else if (e.key === 'ArrowUp') values[2] += step; else if (e.key === 'ArrowDown') values[2] -= step;
        else if (e.key === 'Home') { values[1] = 0; values[2] = 1; } else if (e.key === 'End') { values[1] = 1; values[2] = 0; } else return;
        emit(values[0], values[1], values[2]); e.preventDefault();
      }}>
      <Canvas className="absolute inset-0 pointer-events-none" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        const hue = hsv()[0];
        for (let row = 0; row < 32; row++) {
          const brightness = 1 - row / 31, left = parseInt(hsvColor(hue, 0, brightness).slice(1), 16), right = parseInt(hsvColor(hue, 1, brightness).slice(1), 16);
          gradient(x, y + row * h / 32, w, h / 32 + 1, 0, left as u32, right as u32, false, 255);
        }
      }} />
      <View className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none" style={{ left: hsv()[1] * 264, top: (1 - hsv()[2]) * 138 }} />
    </Button>
    <Slider accessibilityLabel={(p.label ?? 'Color') + ' hue'} value={() => hsv()[0]} onChange={(hue: number) => { const values = hsv(); emit(hue, values[1], values[2]); }} min={0} max={359} step={1} format={(hue: number) => 'Hue ' + Math.round(hue) + '°'} showValue={true} disabled={p.disabled} />
    <Show when={p.alpha === true}><Slider accessibilityLabel={(p.label ?? 'Color') + ' opacity'} value={() => colorChannels(p.value())[3]} onChange={(alpha: number) => { if (p.disabled !== true) p.onChange(p.value().slice(0, 7) + padHex(alpha)); }} min={0} max={255} step={1} format={(alpha: number) => Math.round(alpha / 255 * 100) + '% opacity'} showValue={true} disabled={p.disabled} /></Show>
    <TextField label={(p.label ?? 'Color') + ' hex'} value={p.value} disabled={p.disabled} onInput={(value: string) => { if (p.disabled !== true && (p.alpha === true ? /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/ : /^#[0-9a-fA-F]{6}$/).test(value)) p.onChange(value.toLowerCase() + (p.alpha === true && value.length === 7 ? 'ff' : '')); }} />
    <View className="flex-row flex-wrap gap-2">{(p.swatches ?? ['#1d1d1d', '#737373', '#ffffff', '#2563eb', '#16a34a', '#dc2626', '#f59e0b']).map((color: string) => <Button aria-label={'Choose ' + color} aria-pressed={String(p.value().slice(0, 7).toLowerCase() === color.toLowerCase())} className={`w-7 h-7 rounded-[8px] border border-${theme().input} bg-[${color}]`} onClick={() => { if (p.disabled !== true && /^#[0-9a-fA-F]{6}$/.test(color)) p.onChange(color.toLowerCase() + (p.alpha === true ? padHex(colorChannels(p.value())[3]) : '')); }} />)}</View>
  </View>;
}
function padHex(value: number): string { return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0'); }

export interface EmojiPickerProps {
  value: () => string; onChange: (emoji: string) => void; items?: EmojiEntry[]; recent?: () => string[]; onRecentChange?: (recent: string[]) => void;
  tone?: () => number; onToneChange?: (tone: number) => void; label?: string; placeholder?: string; emptyText?: string;
  width?: number; height?: number; size?: number; noSearch?: boolean; noPreview?: boolean; noTone?: boolean; disabled?: boolean; className?: string;
}
function emojiGlyph(item: EmojiEntry, tone: number): string {
  if (tone <= 0) return item.emoji;
  if (item.tones !== undefined && item.tones.length >= tone) return item.tones[tone - 1];
  return item.emoji + (item.tone === true ? String.fromCodePoint(0x1f3fa + tone) : '');
}
enum EmojiCatalogState { Unread, Ready }
class EmojiCatalog { state = EmojiCatalogState.Unread; items: EmojiEntry[] = []; }
function readEmojiCatalog(catalog: EmojiCatalog): EmojiEntry[] {
  if (catalog.state === EmojiCatalogState.Unread) {
    catalog.items = emojiCatalog();
    catalog.state = EmojiCatalogState.Ready;
  }
  return catalog.items;
}
export function EmojiPicker(p: EmojiPickerProps): i32 {
  const [query, setQuery] = componentSignal(''), [group, setGroup] = componentSignal('All');
  const [active, setActive] = componentSignal(0), [preview, setPreview] = componentSignal('');
  const catalog = componentRef(new EmojiCatalog()).current;
  const items = p.items !== undefined ? p.items : readEmojiCatalog(catalog);
  const grid = createNodeRef(), list = createNodeRef(), cellSize = (p.size ?? 26) + 14;
  const columns = Math.max(1, Math.floor((p.width ?? 300) / cellSize));
  const groups = ['All'];
  for (const item of items) if (groups.indexOf(item.group) < 0) groups.push(item.group);
  if (p.recent !== undefined) groups.push('Recent');
  const filtered = componentMemo(() => {
    const term = query().toLowerCase().trim(), words = term.split(' ').filter((word: string) => word !== '');
    const recent = p.recent !== undefined ? p.recent() : [];
    const begins: EmojiEntry[] = [], others: EmojiEntry[] = [];
    for (const item of items) {
      if (group() !== 'All' && group() !== item.group && !(group() === 'Recent' && recent.indexOf(item.emoji) >= 0)) continue;
      const name = item.name.toLowerCase(), parts = name.split(' ');
      if (!words.every((word: string) => parts.some((part: string) => part.startsWith(word)))) continue;
      if (name.startsWith(term)) begins.push(item); else others.push(item);
    }
    const result = begins.concat(others);
    if (group() === 'Recent') result.sort((first: EmojiEntry, second: EmojiEntry) => recent.indexOf(first.emoji) - recent.indexOf(second.emoji));
    return result;
  }, [] as EmojiEntry[]);
  const tone = (): number => Math.floor(clamp(p.tone !== undefined ? p.tone() : 0, 0, 5));
  const choose = (item: EmojiEntry): void => {
    if (p.disabled === true) return;
    p.onChange(emojiGlyph(item, tone()));
    if (p.onRecentChange !== undefined) {
      const recent = p.recent !== undefined ? p.recent() : [];
      p.onRecentChange([item.emoji].concat(recent.filter((value: string) => value !== item.emoji)).slice(0, 24));
    }
  };
  const focus = (index: number): void => {
    const next = Math.floor(clamp(index, 0, filtered().length - 1));
    setActive(next);
    ui.focusNode(grid.node);
    ui.scrollToRow(list.node, Math.floor(next / columns));
  };
  const resetSearch = (): void => { setActive(0); setPreview(''); ui.scrollToRow(list.node, 0); };
  const key = (e: ui.KeyEvent): void => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? columns : e.key === 'ArrowUp' ? -columns : 0;
    if (delta !== 0 || e.key === 'Home' || e.key === 'End') focus(e.key === 'Home' ? 0 : e.key === 'End' ? filtered().length - 1 : active() + delta);
    else if ((e.key === 'Enter' || e.key === ' ') && filtered().length > 0) choose(filtered()[Math.floor(clamp(active(), 0, filtered().length - 1))]);
    else return;
    e.preventDefault();
  };
  return <View className={`flex-col gap-2 w-[${p.width ?? 300}px] ${p.className ?? ''}`} role="group" aria-label={p.label ?? 'Emoji'} disabled={p.disabled === true}>
    <Show when={p.noSearch !== true}><View onKeyDown={(e: ui.KeyEvent) => {
      if (e.key === 'ArrowDown') { focus(0); e.preventDefault(); }
      else if (e.key === 'Enter' && filtered().length > 0) { choose(filtered()[0]); e.preventDefault(); }
    }}><SearchField label={p.label ?? 'Emoji search'} placeholder={p.placeholder ?? 'Search emoji'} value={query} onInput={(value: string) => { setQuery(value); resetSearch(); }} disabled={p.disabled} /></View></Show>
    <Select label="Emoji group" items={groups.map((name: string) => ({ value: name, label: name }))} value={group} onChange={(name: string) => { setGroup(name); resetSearch(); }} disabled={p.disabled} />
    <Show when={p.noTone !== true && p.onToneChange !== undefined}><Select label="Skin tone" items={[{ value: '0', label: 'Default' }, { value: '1', label: 'Light' }, { value: '2', label: 'Medium light' }, { value: '3', label: 'Medium' }, { value: '4', label: 'Medium dark' }, { value: '5', label: 'Dark' }]} value={() => String(tone())} onChange={(value: string) => { if (p.onToneChange !== undefined) p.onToneChange(Number(value)); }} disabled={p.disabled} /></Show>
    <View ref={grid} role="grid" tabIndex={0} aria-label={(p.label ?? 'Emoji') + ' choices'}
      aria-rowcount={String(Math.ceil(filtered().length / columns))} aria-colcount={String(columns)}
      aria-activedescendant={filtered().length > 0 ? 'emoji-' + grid.node + '-' + active() : ''}
      className={`h-[${p.height ?? 180}px] ${p.disabled === true ? 'opacity-45' : ''} ${controlClass()}`} onKeyDown={key}>
      <VirtualList ref={list} count={Math.ceil(filtered().length / columns)} itemHeight={cellSize} className="h-full w-full">{(row: i32) => <View role="row" className="flex-row">
        {filtered().slice(row * columns, (row + 1) * columns).map((item: EmojiEntry, column: i32) => <Button role="gridcell" id={'emoji-' + grid.node + '-' + (row * columns + column)} aria-label={item.name}
          aria-selected={String(row * columns + column === active())} tabIndex={-1}
          className={`w-[${cellSize}px] h-[${cellSize}px] items-center justify-center rounded-[8px] bg-${row * columns + column === active() ? theme().accentSoft : 'transparent'}`}
          onClick={() => { focus(row * columns + column); choose(item); }} onPointerEnter={(e: ui.PointerEvent) => setPreview(item.name)}>
          <Text className={`text-[${p.size ?? 26}px]`}>{emojiGlyph(item, tone())}</Text>
        </Button>)}
      </View>}</VirtualList>
    </View>
    <Show when={p.noPreview !== true}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{filtered().length === 0 ? p.emptyText ?? 'No emoji found' : preview() !== '' ? preview() : filtered()[Math.floor(clamp(active(), 0, filtered().length - 1))].name}</Text></Show>
  </View>;
}
