// Pure planning operations. Civil dates come from the same provider as the kit's date pickers.
import { validDate, dateDay, dayDate, moveDate, dateWeekday, moveMonth } from './picker-date';
export interface KanbanColumn {
  id: string;
  title: string;
  limit?: i32;
  width?: number;
}
export interface KanbanCard {
  id: string;
  column: string;
  title: string;
  detail?: string;
  tag?: string;
  disabled?: boolean;
}
export class KanbanMove {
  card: string;
  fromColumn: string;
  toColumn: string;
  toIndex: i32;
  constructor(card: string, from: string, to: string, index: i32) {
    this.card = card;
    this.fromColumn = from;
    this.toColumn = to;
    this.toIndex = index;
  }
}
export interface WeekEvent {
  id: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  detail?: string;
}
export interface MonthEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  timeMinutes?: number;
  allDay?: boolean;
}
export interface GanttTask {
  id: string;
  title: string;
  owner?: string;
  start: i32;
  end: i32;
  progress?: number;
  dependsOn?: string;
  milestone?: boolean;
  disabled?: boolean;
}
export class WeekPlacement {
  event: WeekEvent;
  day: i32;
  lane: i32 = 0;
  lanes: i32 = 1;
  constructor(event: WeekEvent, day: i32) {
    this.event = event;
    this.day = day;
  }
}
export class MonthBar {
  event: MonthEvent;
  week: i32;
  column: i32;
  days: i32;
  lane: i32;
  constructor(event: MonthEvent, week: i32, column: i32, days: i32, lane: i32) {
    this.event = event;
    this.week = week;
    this.column = column;
    this.days = days;
    this.lane = lane;
  }
}
function unique(ids: string[], limit: i32, kind: string): void {
  if (ids.length > limit) throw new RangeError(kind + ' exceeds ' + limit + ' items');
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === '' || seen.has(id)) throw new RangeError(kind + ' requires nonempty unique ids');
    seen.add(id);
  }
}
function requireDate(date: string): void {
  if (!validDate(date)) throw new RangeError('Expected a civil ISO date, YYYY-MM-DD: ' + date);
}
export function validateBoard(columns: KanbanColumn[], cards: KanbanCard[]): void {
  unique(
    columns.map((c: KanbanColumn): string => c.id),
    64,
    'Kanban columns',
  );
  unique(
    cards.map((c: KanbanCard): string => c.id),
    4096,
    'Kanban cards',
  );
  const ids = new Set<string>(columns.map((c: KanbanColumn): string => c.id));
  for (const c of cards) if (!ids.has(c.column)) throw new RangeError('Unknown Kanban column: ' + c.column);
  for (const c of columns)
    if (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 0))
      throw new RangeError('Kanban limit must be a nonnegative integer');
}
export function columnCards(cards: KanbanCard[], column: string, without: string = ''): KanbanCard[] {
  return cards.filter((c: KanbanCard): boolean => c.column === column && c.id !== without);
}
/** The target index excludes the moving card, including within its original column. */
export function moveKanbanCard(columns: KanbanColumn[], cards: KanbanCard[], move: KanbanMove): KanbanCard[] {
  validateBoard(columns, cards);
  const card = cards.find((c: KanbanCard): boolean => c.id === move.card);
  if (
    card === undefined ||
    card.disabled === true ||
    card.column !== move.fromColumn ||
    !columns.some((c: KanbanColumn): boolean => c.id === move.toColumn)
  )
    return cards;
  const target = columnCards(cards, move.toColumn, move.card);
  if (!Number.isInteger(move.toIndex) || move.toIndex < 0 || move.toIndex > target.length) return cards;
  const fromIndex = columnCards(cards, card.column).findIndex((c: KanbanCard): boolean => c.id === card.id);
  if (move.fromColumn === move.toColumn && fromIndex === move.toIndex) return cards;
  const moved: KanbanCard = {
    id: card.id,
    column: move.toColumn,
    title: card.title,
    detail: card.detail,
    tag: card.tag,
    disabled: card.disabled,
  };
  target.splice(move.toIndex, 0, moved);
  const out: KanbanCard[] = [];
  for (const column of columns)
    for (const c of column.id === move.toColumn ? target : columnCards(cards, column.id, move.card)) out.push(c);
  return out;
}
export function minuteLabel(minute: number, hour12: boolean = false): string {
  const value = Math.max(0, Math.min(1440, Math.floor(minute))),
    hour = Math.floor(value / 60);
  return (
    String(hour12 ? hour % 12 || 12 : hour).padStart(hour12 ? 1 : 2, '0') +
    ':' +
    String(value % 60).padStart(2, '0') +
    (hour12 ? (hour < 12 ? 'a' : 'p') : '')
  );
}
export function validateWeek(events: WeekEvent[], week: string, start: number, end: number): void {
  requireDate(week);
  if (dateDay(week) + 6 > dateDay('9999-12-31')) throw new RangeError('Week exceeds the supported civil date range');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1440 || end <= start)
    throw new RangeError('Week range must be within 0–1440 minutes');
  unique(
    events.map((e: WeekEvent): string => e.id),
    2048,
    'Week events',
  );
  for (const e of events) {
    requireDate(e.date);
    if (
      !Number.isFinite(e.startMinute) ||
      !Number.isFinite(e.endMinute) ||
      e.startMinute < 0 ||
      e.endMinute > 1440 ||
      e.endMinute <= e.startMinute
    )
      throw new RangeError('Week event has an invalid minute range');
  }
}
/** Connected overlap groups share lanes; touching event ends may use the same lane. */
export function weekPlacements(events: WeekEvent[], week: string, start: number, end: number): WeekPlacement[] {
  validateWeek(events, week, start, end);
  const out: WeekPlacement[] = [],
    base = dateDay(week);
  for (let day: i32 = 0; day < 7; day++) {
    const date = dayDate(base + day);
    const sorted = events.filter((e: WeekEvent): boolean => e.date === date && e.endMinute > start && e.startMinute < end);
    sorted.sort(
      (a: WeekEvent, b: WeekEvent): number =>
        a.startMinute - b.startMinute || a.endMinute - b.endMinute || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    let group: WeekPlacement[] = [],
      laneEnds: number[] = [],
      groupEnd = -1;
    const finish = (): void => {
      for (const p of group) p.lanes = laneEnds.length;
      group = [];
      laneEnds = [];
    };
    for (const e of sorted) {
      if (e.startMinute >= groupEnd) finish();
      let lane: i32 = 0;
      while (lane < laneEnds.length && laneEnds[lane] > e.startMinute) lane++;
      if (lane === laneEnds.length) laneEnds.push(e.endMinute);
      else laneEnds[lane] = e.endMinute;
      const p = new WeekPlacement(e, day);
      p.lane = lane;
      group.push(p);
      out.push(p);
      groupEnd = Math.max(groupEnd, e.endMinute);
    }
    finish();
  }
  return out;
}
export function changeWeekEvent(
  event: WeekEvent,
  week: string,
  days: i32,
  minutes: number,
  resize: boolean,
  start: number,
  end: number,
): WeekEvent {
  const snapped = Math.round(minutes / 15) * 15,
    duration = event.endMinute - event.startMinute;
  if (!resize && duration > end - start) return event;
  const result: WeekEvent = {
    id: event.id,
    title: event.title,
    date: event.date,
    startMinute: event.startMinute,
    endMinute: event.endMinute,
    detail: event.detail,
  };
  if (resize) result.endMinute = Math.max(event.startMinute + 15, Math.min(end, event.endMinute + snapped));
  else {
    result.date = moveDate(week, Math.max(0, Math.min(6, dateDay(event.date) - dateDay(week) + days)));
    result.startMinute = Math.max(start, Math.min(end - duration, event.startMinute + snapped));
    result.endMinute = result.startMinute + duration;
  }
  return result;
}
export function monthDays(month: string, firstWeekday: i32 = 1): string[] {
  requireDate(month);
  if (!Number.isInteger(firstWeekday) || firstWeekday < 0 || firstWeekday > 6)
    throw new RangeError('First weekday must be 0–6, Sunday first');
  const first = month.slice(0, 7) + '-01';
  const firstDay = dateDay(first),
    gridStart = firstDay - ((dateWeekday(first) - firstWeekday + 7) % 7);
  const next = moveMonth(first, 1),
    last = first.slice(0, 7) === '9999-12' ? dateDay('9999-12-31') : dateDay(next) - 1;
  const cells = Math.ceil((last - gridStart + 1) / 7) * 7,
    out: string[] = [];
  for (let i = 0; i < cells; i++) {
    const n = gridStart + i;
    out.push(n < dateDay('0001-01-01') || n > dateDay('9999-12-31') ? '' : dayDate(n));
  }
  return out;
}
export function validateMonth(events: MonthEvent[]): void {
  unique(
    events.map((e: MonthEvent): string => e.id),
    8192,
    'Month events',
  );
  for (const e of events) {
    requireDate(e.start);
    if (e.end !== undefined) requireDate(e.end);
    if (e.timeMinutes !== undefined && (!Number.isFinite(e.timeMinutes) || e.timeMinutes < 0 || e.timeMinutes >= 1440))
      throw new RangeError('Month event time must be within 0–1439 minutes');
  }
}
export function monthEventEnd(event: MonthEvent): string {
  return event.end !== undefined && event.end > event.start ? event.end : event.start;
}
export function compareMonthEvents(a: MonthEvent, b: MonthEvent): number {
  const ab = a.allDay === true || monthEventEnd(a) !== a.start,
    bb = b.allDay === true || monthEventEnd(b) !== b.start;
  if (ab !== bb) return ab ? -1 : 1;
  return (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
}
function releaseLane(heap: i32[], lane: i32): void {
  heap.push(lane);
  let at = heap.length - 1;
  while (at > 0) {
    const parent = Math.floor((at - 1) / 2);
    if (heap[parent] <= lane) break;
    heap[at] = heap[parent];
    at = parent;
  }
  heap[at] = lane;
}
function takeLane(heap: i32[]): i32 {
  const first = heap[0],
    last = heap.pop()!;
  if (heap.length === 0) return first;
  let at = 0;
  while (at * 2 + 1 < heap.length) {
    let child = at * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1] < heap[child]) child++;
    if (last <= heap[child]) break;
    heap[at] = heap[child];
    at = child;
  }
  heap[at] = last;
  return first;
}
export function eventsOnDay(events: MonthEvent[], date: string): MonthEvent[] {
  const out = events.filter((e: MonthEvent): boolean => e.start <= date && monthEventEnd(e) >= date);
  out.sort(compareMonthEvents);
  return out;
}
/** Per-week lanes preserve inclusive spans across week boundaries without overlap. */
export function monthBars(events: MonthEvent[], dates: string[]): MonthBar[] {
  validateMonth(events);
  const sorted = events.filter((e: MonthEvent): boolean => e.allDay === true || monthEventEnd(e) !== e.start);
  sorted.sort((a: MonthEvent, b: MonthEvent): number =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : dateDay(monthEventEnd(b)) - dateDay(monthEventEnd(a)),
  );
  const out: MonthBar[] = [];
  for (let week: i32 = 0; week < dates.length / 7; week++) {
    const releases: i32[][] = [[], [], [], [], [], [], []],
      available: i32[] = [];
    let released: i32 = 0,
      nextLane: i32 = 0;
    for (const e of sorted) {
      let first: i32 = -1,
        last: i32 = -1;
      for (let c: i32 = 0; c < 7; c++) {
        const d = dates[week * 7 + c];
        if (d !== '' && d >= e.start && d <= monthEventEnd(e)) {
          if (first < 0) first = c;
          last = c;
        }
      }
      if (first < 0) continue;
      while (released < first) {
        for (const lane of releases[released]) releaseLane(available, lane);
        released++;
      }
      const lane = available.length > 0 ? takeLane(available) : nextLane++;
      releases[last].push(lane);
      out.push(new MonthBar(e, week, first, last - first + 1, lane));
    }
  }
  return out;
}
enum Visit {
  Unseen,
  Visiting,
  Complete,
}
export function validateGantt(tasks: GanttTask[], days: i32): void {
  if (!Number.isInteger(days) || days < 1 || days > 3660) throw new RangeError('Gantt days must be 1–3660');
  unique(
    tasks.map((t: GanttTask): string => t.id),
    4096,
    'Gantt tasks',
  );
  const byId = new Map<string, GanttTask>();
  for (const t of tasks) {
    byId.set(t.id, t);
    if (
      !Number.isInteger(t.start) ||
      !Number.isInteger(t.end) ||
      t.start < 0 ||
      t.end > days ||
      (t.milestone === true ? t.end !== t.start || t.start >= days : t.end <= t.start)
    )
      throw new RangeError('Gantt task has an invalid day range');
    if (t.progress !== undefined && (!Number.isFinite(t.progress) || t.progress < 0 || t.progress > 1))
      throw new RangeError('Gantt progress must be within 0–1');
  }
  const visits = new Map<string, Visit>();
  for (const task of tasks) {
    let current: GanttTask | undefined = task;
    const path: string[] = [];
    while (current !== undefined) {
      const state = visits.get(current.id) ?? Visit.Unseen;
      if (state === Visit.Complete) break;
      if (state === Visit.Visiting) throw new RangeError('Gantt dependency cycle');
      visits.set(current.id, Visit.Visiting);
      path.push(current.id);
      if (current.dependsOn === undefined) break;
      const parent = byId.get(current.dependsOn);
      if (parent === undefined) throw new RangeError('Unknown Gantt dependency: ' + current.dependsOn);
      current = parent;
    }
    for (const id of path) visits.set(id, Visit.Complete);
  }
}
/** Gantt ranges are half-open; milestones have a zero-length range. Dependencies are descriptive, not an auto-scheduler. */
export function changeGanttTask(task: GanttTask, delta: i32, edge: i32, days: i32): GanttTask {
  const out: GanttTask = {
    id: task.id,
    title: task.title,
    owner: task.owner,
    start: task.start,
    end: task.end,
    progress: task.progress,
    dependsOn: task.dependsOn,
    milestone: task.milestone,
    disabled: task.disabled,
  };
  if (task.disabled === true) return task;
  if (task.milestone === true) {
    out.start = Math.max(0, Math.min(days - 1, task.start + delta));
    out.end = out.start;
  } else if (edge < 0) out.start = Math.max(0, Math.min(task.end - 1, task.start + delta));
  else if (edge > 0) out.end = Math.max(task.start + 1, Math.min(days, task.end + delta));
  else {
    const duration = task.end - task.start;
    out.start = Math.max(0, Math.min(days - duration, task.start + delta));
    out.end = out.start + duration;
  }
  return out;
}
