/** @jsxHelpers zinc:ui/kit/host */
// Planning controls own interaction only; applications own their cards, events and tasks.
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { createNodeRef, Show } from 'zinc:ui/solid';
import { rect, stroke, polygon, font, drawText } from 'zinc:gfx';
import { componentRef, componentSignal, componentEffect, componentMemo, renderSlot, _virtual as virtualRows } from './host';
import { theme, themeColor } from './theme';
import { Button as KitButton } from './button';
import { Dialog } from './overlays';
import { validDate, dateDay, dayDate, moveDate, moveMonth, dateWeekday, todayDate } from './picker-date';
import {
  KanbanColumn,
  KanbanCard,
  KanbanMove,
  WeekEvent,
  WeekPlacement,
  MonthEvent,
  MonthBar,
  GanttTask,
  validateBoard,
  columnCards,
  moveKanbanCard,
  minuteLabel,
  weekPlacements,
  changeWeekEvent,
  monthDays,
  monthBars,
  eventsOnDay,
  compareMonthEvents,
  monthEventEnd,
  validateGantt,
  changeGanttTask,
} from './planning-model';
export { KanbanColumn, KanbanCard, KanbanMove, WeekEvent, MonthEvent, GanttTask, moveKanbanCard } from './planning-model';
function ring(): string {
  return `focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`;
}
function panel(): string {
  return `border border-${theme().border} rounded-[14px] bg-${theme().card} text-${theme().foreground}`;
}
function label(): string {
  return `text-[12px] text-${theme().mutedForeground}`;
}
function selectedClass(selected: boolean): string {
  return `border border-${selected ? theme().accent : theme().border} bg-${selected ? theme().accentSoft : theme().card} ${ring()}`;
}
export interface KanbanBoardProps {
  label: string;
  columns: () => KanbanColumn[];
  cards: () => KanbanCard[];
  onMove: (move: KanbanMove) => void;
  onCardClick?: (id: string) => void;
  onAdd?: (column: string) => void;
  readOnly?: boolean;
  height?: number;
  className?: string;
}
enum BoardPhase {
  Idle,
  Pointer,
  Keyboard,
}
enum BoardFocusPhase {
  Idle,
  Pending,
}
class BoardFocus {
  phase: BoardFocusPhase;
  card: string;
  column: string;
  constructor(phase: BoardFocusPhase, card: string = '', column: string = '') {
    this.phase = phase;
    this.card = card;
    this.column = column;
  }
}
class BoardGesture {
  phase: BoardPhase;
  move: KanbanMove | null;
  original: KanbanCard | null;
  constructor(phase: BoardPhase, move: KanbanMove | null, original: KanbanCard | null = null) {
    this.phase = phase;
    this.move = move;
    this.original = original;
  }
}
class BoardTarget {
  column: string;
  card: string;
  constructor(column: string, card: string = '') {
    this.column = column;
    this.card = card;
  }
}
class BoardScope {
  props: KanbanBoardProps;
  gesture: () => BoardGesture;
  writeGesture: (gesture: BoardGesture) => void;
  get phase(): BoardPhase {
    return this.gesture().phase;
  }
  get move(): KanbanMove | null {
    return this.gesture().move;
  }
  targets = new Map<i32, BoardTarget>();
  nodes = new Map<string, i32>();
  focus = new BoardFocus(BoardFocusPhase.Idle);
  transitionFocus(phase: BoardFocusPhase, card: string = '', column: string = ''): void {
    this.focus = new BoardFocus(phase, card, column);
  }
  restoreFocus(id: string, column: string, node: i32): void {
    if (this.focus.phase !== BoardFocusPhase.Pending || this.focus.card !== id || this.focus.column !== column) return;
    this.transitionFocus(BoardFocusPhase.Idle);
    ui.focusNode(node);
  }
  ghost: i32 = -1;
  ghostSerial: i32 = 0;
  ghostText: i32 = -1;
  root: i32 = -1;
  source: i32 = -1;
  sourceSerial: i32 = 0;
  offsetX: number = 0;
  offsetY: number = 0;
  ghostX: number = 0;
  ghostY: number = 0;
  ghostWidth: number = 0;
  ghostHeight: number = 0;
  announce: (message: string) => void;
  constructor(
    props: KanbanBoardProps,
    announce: (message: string) => void,
    gesture: () => BoardGesture,
    writeGesture: (gesture: BoardGesture) => void,
  ) {
    this.props = props;
    this.announce = announce;
    this.gesture = gesture;
    this.writeGesture = writeGesture;
  }
  transition(next: BoardPhase, move: KanbanMove | null = null, original: KanbanCard | null = null): boolean {
    if (next !== BoardPhase.Idle && this.phase !== BoardPhase.Idle && next !== this.phase) return false;
    if (next !== BoardPhase.Idle && move === null) return false;
    this.writeGesture(
      new BoardGesture(
        next,
        next === BoardPhase.Idle ? null : move,
        next === BoardPhase.Idle ? null : (original ?? this.gesture().original),
      ),
    );
    if (next === BoardPhase.Idle) {
      if (this.ghost >= 0 && ui.nodeSerial(this.ghost) === this.ghostSerial) {
        ui.closeLayer(this.ghost);
        ui.setNumber(this.ghost, 'hidden', 1);
      }
      if (this.source >= 0 && ui.nodeSerial(this.source) === this.sourceSerial) ui.setNumber(this.source, 'opacity', 1);
      this.source = -1;
    }
    return true;
  }
  allowed(card: KanbanCard | undefined): boolean {
    return this.props.readOnly !== true && card !== undefined && card.disabled !== true;
  }
  begin(id: string, phase: BoardPhase): boolean {
    const cards = this.props.cards(),
      card = cards.find((c: KanbanCard): boolean => c.id === id);
    if (!this.allowed(card) || card === undefined || this.phase !== BoardPhase.Idle) return false;
    this.transitionFocus(BoardFocusPhase.Idle);
    this.transition(
      phase,
      new KanbanMove(
        id,
        card.column,
        card.column,
        columnCards(cards, card.column).findIndex((c: KanbanCard): boolean => c.id === id),
      ),
      card,
    );
    this.describe();
    return true;
  }
  describe(): void {
    const move = this.move;
    if (move === null) return;
    const column = this.props.columns().find((c: KanbanColumn): boolean => c.id === move.toColumn);
    this.announce(
      'Moving card to ' +
        (column !== undefined ? column.title : move.toColumn) +
        ', position ' +
        (move.toIndex + 1) +
        '. Enter drops; Escape cancels.',
    );
  }
  updateTarget(d: dnd.DragInfo): void {
    const move = this.move;
    if (this.phase !== BoardPhase.Pointer || move === null) return;
    let target: BoardTarget | undefined;
    let edge: i32 = dnd.EDGE_NONE;
    for (const drop of d.targets) {
      const found = this.targets.get(drop.node);
      if (found !== undefined) {
        target = found;
        edge = drop.edge;
        break;
      }
    }
    if (target === undefined) return;
    const cards = columnCards(this.props.cards(), target.column, move.card);
    const at = target.card === '' ? cards.length : cards.findIndex((c: KanbanCard): boolean => c.id === target!.card);
    const index = at < 0 ? cards.length : at + (target.card !== '' && edge === dnd.EDGE_BOTTOM ? 1 : 0);
    if (move.toColumn !== target.column || move.toIndex !== index) {
      this.transition(BoardPhase.Pointer, new KanbanMove(move.card, move.fromColumn, target.column, index));
      this.describe();
    }
  }
  pointerStart(id: string, d: dnd.DragInfo): void {
    if (!this.begin(id, BoardPhase.Pointer)) {
      dnd.cancelDrag();
      return;
    }
    this.source = d.source;
    this.sourceSerial = ui.nodeSerial(d.source);
    const box = ui.screenBox(d.source),
      card = this.props.cards().find((c: KanbanCard): boolean => c.id === id);
    this.offsetX = d.x - box[0];
    this.offsetY = d.y - box[1];
    this.ghostX = box[0];
    this.ghostY = box[1];
    this.ghostWidth = box[2];
    this.ghostHeight = Math.min(110, box[3]);
    ui.setNumber(d.source, 'opacity', 0.3);
    ui.setText(this.ghostText, card !== undefined ? card.title : 'Card');
    ui.setNumber(this.ghost, 'width', box[2]);
    ui.setNumber(this.ghost, 'height', Math.min(110, box[3]));
    ui.setNumber(this.ghost, 'left', box[0]);
    ui.setNumber(this.ghost, 'top', box[1]);
    ui.setNumber(this.ghost, 'hidden', 0);
    ui.openLayer(this.ghost, { priority: 100 });
  }
  pointerMove(d: dnd.DragInfo): void {
    if (this.phase !== BoardPhase.Pointer) return;
    this.ghostX = d.x - this.offsetX;
    this.ghostY = d.y - this.offsetY;
    ui.setNumber(this.ghost, 'left', this.ghostX);
    ui.setNumber(this.ghost, 'top', this.ghostY);
    this.updateTarget(d);
  }
  finish(commit: boolean): void {
    const move = this.move;
    if (this.phase === BoardPhase.Idle || move === null) return;
    const cards = this.props.cards(),
      card = cards.find((c: KanbanCard): boolean => c.id === move.card);
    const valid = commit && this.allowed(card) && card !== undefined && card === this.gesture().original && card.column === move.fromColumn;
    const keyboard = this.phase === BoardPhase.Keyboard;
    const output = valid ? new KanbanMove(move.card, move.fromColumn, move.toColumn, move.toIndex) : null;
    this.transition(BoardPhase.Idle);
    this.announce(valid ? 'Card moved.' : 'Move cancelled.');
    if (output !== null && moveKanbanCard(this.props.columns(), cards, output) !== cards) {
      if (keyboard) this.transitionFocus(BoardFocusPhase.Pending, output.card, output.toColumn);
      this.props.onMove(output);
      const node = this.nodes.get(output.card);
      const target = node !== undefined ? this.targets.get(node) : undefined;
      if (node !== undefined && target !== undefined) this.restoreFocus(output.card, target.column, node);
    }
  }
  cancel(): void {
    if (this.phase === BoardPhase.Pointer) dnd.cancelDrag();
    else this.finish(false);
  }
  key(id: string, e: ui.KeyEvent): void {
    if (e.key === 'Escape' && this.phase !== BoardPhase.Idle) {
      this.cancel();
      e.preventDefault();
      return;
    }
    if (this.phase === BoardPhase.Idle) {
      if (e.key === ' ') {
        this.begin(id, BoardPhase.Keyboard);
        e.preventDefault();
      }
      return;
    }
    const move = this.move;
    if (this.phase !== BoardPhase.Keyboard || move === null || move.card !== id) return;
    if (e.key === 'Enter' || e.key === ' ') {
      this.finish(true);
      e.preventDefault();
      return;
    }
    const columns = this.props.columns();
    let col = columns.findIndex((c: KanbanColumn): boolean => c.id === move.toColumn),
      index = move.toIndex;
    if (e.key === 'ArrowLeft') col = Math.max(0, col - 1);
    else if (e.key === 'ArrowRight') col = Math.min(columns.length - 1, col + 1);
    else if (e.key === 'ArrowUp') index--;
    else if (e.key === 'ArrowDown') index++;
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = columnCards(this.props.cards(), move.toColumn, id).length;
    else return;
    const destination = columns[col].id;
    this.transition(
      BoardPhase.Keyboard,
      new KanbanMove(
        move.card,
        move.fromColumn,
        destination,
        Math.max(0, Math.min(columnCards(this.props.cards(), destination, id).length, index)),
      ),
    );
    this.describe();
    e.preventDefault();
  }
}
function BoardCard(p: { card: () => KanbanCard; scope: BoardScope }): i32 {
  const ref = createNodeRef(),
    live = componentRef(p);
  live.current = p;
  const node = (
    <Button
      ref={ref}
      role="listitem"
      disabled={p.card().disabled === true}
      aria-label={p.card().title}
      aria-disabled={p.card().disabled === true}
      aria-grabbed={p.scope.move?.card === p.card().id}
      className={`flex-col items-start gap-1 p-3 rounded-[10px] text-left ${selectedClass(p.scope.move?.card === p.card().id)} ${p.card().disabled === true ? 'opacity-45' : ''}`}
      onKeyDown={(e: ui.KeyEvent) => p.scope.key(p.card().id, e)}
      onClick={() => {
        if (p.scope.phase === BoardPhase.Idle && p.card().disabled !== true && p.scope.props.onCardClick !== undefined)
          p.scope.props.onCardClick(p.card().id);
      }}
    >
      <Show when={p.card().tag !== undefined}>
        <Text className={label()}>{p.card().tag ?? ''}</Text>
      </Show>
      <Text className={`text-[13px] font-medium text-${theme().foreground}`}>{p.card().title}</Text>
      <Show when={p.card().detail !== undefined}>
        <Text className={label()}>{p.card().detail ?? ''}</Text>
      </Show>
    </Button>
  );
  componentEffect(() => {
    const scope = live.current.scope,
      id = live.current.card().id;
    scope.nodes.set(id, ref.node);
    scope.targets.set(ref.node, new BoardTarget(live.current.card().column, id));
    scope.restoreFocus(id, live.current.card().column, ref.node);
    const source = dnd.draggable(ref.node, {
      data: id,
      canDrag: () => scope.allowed(live.current.card()),
      onDragStart: (d: dnd.DragInfo) => scope.pointerStart(id, d),
      onDrag: (d: dnd.DragInfo) => scope.pointerMove(d),
      onDrop: (d: dnd.DragInfo) => {
        scope.updateTarget(d);
        scope.finish(d.targets.some((t: dnd.DropRecord): boolean => scope.targets.has(t.node)));
      },
    });
    const target = dnd.dropTarget(ref.node, {
      edges: dnd.EDGES_VERTICAL,
      canDrop: () => scope.phase === BoardPhase.Pointer && scope.move?.card !== id,
    });
    return () => {
      source();
      target();
      scope.targets.delete(ref.node);
      if (scope.nodes.get(id) === ref.node) scope.nodes.delete(id);
    };
  }, []);
  return node;
}
function BoardColumn(p: { column: KanbanColumn; scope: BoardScope }): i32 {
  const ref = createNodeRef(),
    scroller = createNodeRef(),
    live = componentRef(p);
  live.current = p;
  const cards = (): KanbanCard[] => columnCards(p.scope.props.cards(), p.column.id);
  const cardIds = componentMemo(() => cards().map((card: KanbanCard): string => card.id), [] as string[]);
  const readCard = (id: string): KanbanCard => cards().find((card: KanbanCard): boolean => card.id === id)!;
  const over = (): boolean => p.column.limit !== undefined && cards().length > p.column.limit;
  const destination = (): boolean => p.scope.move !== null && p.scope.move!.toColumn === p.column.id;
  const beforeId = componentMemo(() => {
    const move = p.scope.move;
    if (move === null || move.toColumn !== p.column.id) return '';
    const targets = columnCards(p.scope.props.cards(), p.column.id, move.card);
    return move.toIndex < targets.length ? targets[move.toIndex].id : '';
  }, '');
  const node = (
    <View
      ref={ref}
      className={`flex-col shrink-0 min-w-[210px] gap-3 p-3 ${panel()} ${destination() ? 'border-' + theme().accent : ''}`}
      style={{ width: p.column.width ?? 250 }}
    >
      <View className="flex-row items-center gap-2">
        <Text className={`grow text-[13px] font-medium text-${theme().foreground}`}>{p.column.title}</Text>
        <Text
          aria-label={over() ? 'Work in progress limit exceeded' : 'Card count'}
          className={`text-[11px] text-${over() ? theme().destructive : theme().mutedForeground}`}
        >
          {cards().length}
          {p.column.limit !== undefined ? ' / ' + p.column.limit : ''}
        </Text>
        <Show when={p.scope.props.onAdd !== undefined}>
          <KitButton
            label="+"
            ariaLabel={'Add to ' + p.column.title}
            size="sm"
            variant="ghost"
            disabled={p.scope.props.readOnly}
            onClick={() => {
              const add = p.scope.props.onAdd;
              if (add !== undefined) add(p.column.id);
            }}
          />
        </Show>
      </View>
      <ScrollView ref={scroller} className="flex-col gap-2 grow min-h-[80px]">
        {cardIds().map((id: string) => (
          <View key={id} className="flex-col gap-2">
            <Show when={destination() && beforeId() === id}>
              <View aria-hidden="true" className={`h-[2px] bg-${theme().accent}`} />
            </Show>
            <BoardCard key={id} card={() => readCard(id)} scope={p.scope} />
          </View>
        ))}
        <Show when={destination() && beforeId() === ''}>
          <View aria-hidden="true" className={`h-[2px] bg-${theme().accent}`} />
        </Show>
      </ScrollView>
    </View>
  );
  componentEffect(() => {
    const scope = live.current.scope;
    scope.targets.set(ref.node, new BoardTarget(live.current.column.id));
    const target = dnd.dropTarget(ref.node, { canDrop: () => scope.phase === BoardPhase.Pointer });
    const scroll = dnd.autoScroll(scroller.node);
    return () => {
      target();
      scroll();
      scope.targets.delete(ref.node);
    };
  }, []);
  return node;
}
export function KanbanBoard(p: KanbanBoardProps): i32 {
  const [message, setMessage] = componentSignal('Space lifts a card. Arrows move; Enter drops; Escape cancels.');
  const [gesture, setGesture] = componentSignal(new BoardGesture(BoardPhase.Idle, null));
  const scope = componentRef(new BoardScope(p, setMessage, gesture, setGesture)).current;
  scope.props = p;
  const root = createNodeRef(),
    ghost = createNodeRef(),
    ghostText = createNodeRef(),
    scroll = createNodeRef();
  const checked = (): KanbanColumn[] => {
    const columns = p.columns();
    validateBoard(columns, p.cards());
    return columns;
  };
  const node = (
    <View ref={root} role="group" aria-label={p.label} className={`relative flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
      <ScrollView ref={scroll} className="w-full overflow-x-auto" style={{ height: p.height ?? 320 }}>
        <View className="flex-row gap-3 h-full">
          {checked().map((column: KanbanColumn) => (
            <BoardColumn key={column.id} column={column} scope={scope} />
          ))}
        </View>
      </ScrollView>
      <View
        ref={ghost}
        hidden={scope.phase === BoardPhase.Pointer ? 0 : 1}
        style={{ left: scope.ghostX, top: scope.ghostY, width: scope.ghostWidth, height: scope.ghostHeight }}
        className={`absolute pointer-events-none p-3 rounded-[10px] border border-${theme().accent} bg-${theme().card} shadow-[0_8px_24px_rgba(0,0,0,0.18)]`}
      >
        <Text ref={ghostText} className={`text-[13px] text-${theme().foreground}`} />
      </View>
      <Text role="status" aria-live="polite" className={label()}>
        {message()}
      </Text>
    </View>
  );
  scope.root = root.node;
  scope.ghost = ghost.node;
  scope.ghostSerial = ui.nodeSerial(ghost.node);
  scope.ghostText = ghostText.node;
  componentEffect(() => {
    const cards = p.cards(),
      current = scope.gesture();
    if (current.phase !== BoardPhase.Idle && (p.readOnly === true || !cards.some((card: KanbanCard): boolean => card === current.original)))
      scope.cancel();
  });
  componentEffect(() => {
    const stop = ui.onFocusWithin(root.node, (focused: boolean) => {
      if (!ui.hasFocusWithin(root.node)) {
        scope.cancel();
        if (ui.focused() >= 0) scope.transitionFocus(BoardFocusPhase.Idle);
      }
    });
    const auto = dnd.autoScroll(scroll.node);
    return () => {
      scope.transitionFocus(BoardFocusPhase.Idle);
      scope.cancel();
      stop();
      auto();
    };
  }, []);
  return node;
}

export interface WeekCalendarProps {
  label: string;
  weekStart: string;
  events: () => WeekEvent[];
  onEventChange?: (event: WeekEvent) => void;
  onEventClick?: (id: string) => void;
  startMinute?: number;
  endMinute?: number;
  hourHeight?: number;
  height?: number;
  readOnly?: boolean;
  today?: string;
  nowMinute?: () => number;
  dayNames?: string[];
  className?: string;
}
enum EditPhase {
  Idle,
  Move,
  ResizeStart,
  ResizeEnd,
}
class WeekEdit {
  phase: EditPhase;
  original: WeekEvent | null;
  preview: WeekEvent | null;
  x: number;
  y: number;
  constructor(phase: EditPhase, original: WeekEvent | null, preview: WeekEvent | null, x: number = 0, y: number = 0) {
    this.phase = phase;
    this.original = original;
    this.preview = preview;
    this.x = x;
    this.y = y;
  }
}
class WeekCache {
  source: WeekEvent[] | null = null;
  week: string = '';
  start: number = -1;
  end: number = -1;
  placements: WeekPlacement[] = [];
  read(events: WeekEvent[], week: string, start: number, end: number): WeekPlacement[] {
    if (events !== this.source || week !== this.week || start !== this.start || end !== this.end) {
      this.placements = weekPlacements(events, week, start, end);
      this.source = events;
      this.week = week;
      this.start = start;
      this.end = end;
    }
    return this.placements;
  }
}
export function WeekCalendar(p: WeekCalendarProps): i32 {
  const content = createNodeRef(),
    root = createNodeRef();
  const cache = componentRef(new WeekCache()).current;
  const [width, setWidth] = componentSignal(760);
  const [edit, setEdit] = componentSignal(new WeekEdit(EditPhase.Idle, null, null));
  const start = (): number => p.startMinute ?? 420,
    end = (): number => p.endMinute ?? 1260;
  const hourHeight = (): number => Math.max(24, Math.min(120, p.hourHeight ?? 52));
  const height = (): number => ((end() - start()) / 60) * hourHeight();
  const dayWidth = (): number => Math.max(1, (width() - 56) / 7);
  const placements = componentMemo(() => cache.read(p.events(), p.weekStart, start(), end()), [] as WeekPlacement[]);
  const eventIds = componentMemo(() => placements().map((item: WeekPlacement): string => item.event.id), [] as string[]);
  const readPlacement = (id: string): WeekPlacement => placements().find((item: WeekPlacement): boolean => item.event.id === id)!;
  const dates = componentMemo(() => [0, 1, 2, 3, 4, 5, 6].map((day: number): string => moveDate(p.weekStart, day)), [] as string[]);
  const hours = componentMemo(() => {
    const values: number[] = [];
    for (let minute = Math.ceil(start() / 60) * 60; minute <= end(); minute += 60) values.push(minute);
    return values;
  }, [] as number[]);
  const effective = (event: WeekEvent): WeekEvent => {
    const current = edit();
    return current.preview !== null && current.preview.id === event.id ? current.preview : event;
  };
  const editable = (): boolean => p.readOnly !== true && p.onEventChange !== undefined;
  const transition = (
    phase: EditPhase,
    original: WeekEvent | null = null,
    preview: WeekEvent | null = null,
    x: number = 0,
    y: number = 0,
  ): void => {
    const current = edit();
    if (phase === EditPhase.Idle && current.phase === EditPhase.Idle) return;
    if (
      phase === current.phase &&
      preview !== null &&
      current.preview !== null &&
      preview.date === current.preview.date &&
      preview.startMinute === current.preview.startMinute &&
      preview.endMinute === current.preview.endMinute
    )
      return;
    if (phase !== EditPhase.Idle && current.phase !== EditPhase.Idle && current.phase !== phase) return;
    if (phase !== EditPhase.Idle && (original === null || preview === null)) return;
    setEdit(new WeekEdit(phase, original, preview, x, y));
  };
  const commit = (value: WeekEvent): void => {
    const change = p.onEventChange;
    if (editable() && change !== undefined) change(value);
  };
  const key = (event: WeekEvent, e: ui.KeyEvent): void => {
    if (e.key === 'Escape' && edit().phase !== EditPhase.Idle) {
      transition(EditPhase.Idle);
      e.preventDefault();
      return;
    }
    if (!editable()) return;
    const current = p.events().find((item: WeekEvent): boolean => item.id === event.id);
    if (current === undefined) return;
    let days: i32 = 0,
      minutes = 0;
    if (e.key === 'ArrowUp') minutes = -15;
    else if (e.key === 'ArrowDown') minutes = 15;
    else if (e.key === 'ArrowLeft' && !e.shift) days = -1;
    else if (e.key === 'ArrowRight' && !e.shift) days = 1;
    else return;
    commit(changeWeekEvent(current, p.weekStart, days, minutes, e.shift, start(), end()));
    e.preventDefault();
  };
  const drag = (event: WeekEvent, resize: boolean, e: ui.PointerEvent): void => {
    if (!editable()) return;
    const point = ui.toLocal(content.node, e.gx, e.gy);
    const press = e.phase === 0 ? ui.toLocal(content.node, e.gx - e.dx, e.gy - e.dy) : point;
    if (e.phase === 0) {
      const current = p.events().find((item: WeekEvent): boolean => item.id === event.id);
      if (current !== undefined) transition(resize ? EditPhase.ResizeEnd : EditPhase.Move, current, current, press[0], press[1]);
    }
    const state = edit();
    if (state.phase === EditPhase.Idle || state.original === null) return;
    if (e.phase === 3) {
      transition(EditPhase.Idle);
      return;
    }
    const preview = changeWeekEvent(
      state.original,
      p.weekStart,
      Math.round((point[0] - state.x) / dayWidth()),
      ((point[1] - state.y) / hourHeight()) * 60,
      state.phase === EditPhase.ResizeEnd,
      start(),
      end(),
    );
    if (e.phase === 2) {
      const still = p.events().find((item: WeekEvent): boolean => item.id === state.original!.id);
      transition(EditPhase.Idle);
      if (still === state.original) commit(preview);
    } else transition(state.phase, state.original, preview, state.x, state.y);
  };
  const line = componentRef([0, 0, 0, 0]).current;
  const draw = (x: i32, y: i32, w: i32, h: i32): void => {
    if (width() !== w) setWidth(w);
    const grid = themeColor('border') as u32;
    for (let day = 0; day <= 7; day++) {
      line[0] = x + 56 + (day * (w - 56)) / 7;
      line[1] = y + 40;
      line[2] = line[0];
      line[3] = y + h;
      stroke(line, 1, grid, 255, false);
    }
    for (const minute of hours()) {
      line[0] = x + 56;
      line[1] = y + 40 + ((minute - start()) / 60) * hourHeight();
      line[2] = x + w;
      line[3] = line[1];
      stroke(line, 1, grid, 255, false);
    }
    const now = p.nowMinute !== undefined ? p.nowMinute() : new Date().getHours() * 60 + new Date().getMinutes();
    const today = p.today ?? todayDate(),
      day = dateDay(today) - dateDay(p.weekStart);
    if (day >= 0 && day < 7 && now >= start() && now <= end()) {
      line[0] = x + 56 + (day * (w - 56)) / 7;
      line[2] = line[0] + (w - 56) / 7;
      line[1] = y + 40 + ((now - start()) / 60) * hourHeight();
      line[3] = line[1];
      stroke(line, 1.5, themeColor('accent') as u32, 255, false);
    }
  };
  const eventBox = (placement: WeekPlacement): number[] => {
    const value = effective(placement.event),
      day = dateDay(value.date) - dateDay(p.weekStart),
      top = Math.max(start(), value.startMinute),
      bottom = Math.min(end(), value.endMinute);
    return [
      56 + (day + placement.lane / placement.lanes) * dayWidth() + 3,
      40 + ((top - start()) / 60) * hourHeight() + 1,
      Math.max(18, dayWidth() / placement.lanes - 6),
      Math.max(18, ((bottom - top) / 60) * hourHeight() - 2),
    ];
  };
  const node = (
    <View ref={root} role="group" aria-label={p.label} className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
      <ScrollView className={`w-full overflow-auto ${panel()}`} style={{ height: p.height ?? 460 }}>
        <View ref={content} className="relative w-full min-w-[760px]" style={{ height: height() + 40 }}>
          <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={draw} />
          {dates().map((date: string, day: i32) => (
            <View
              className="absolute top-0 h-[40px] items-center justify-center"
              style={{ left: 56 + day * dayWidth(), width: dayWidth() }}
            >
              <Text
                className={`text-[11px] ${date === (p.today ?? todayDate()) ? 'font-semibold text-' + theme().accent : 'text-' + theme().mutedForeground}`}
              >
                {(p.dayNames ?? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[dateWeekday(date)]} {date.slice(8, 10)}
              </Text>
            </View>
          ))}
          {hours().map((minute: number) => (
            <Text
              className={`absolute left-1 w-[48px] text-right text-[10px] text-${theme().mutedForeground}`}
              style={{ top: 34 + ((minute - start()) / 60) * hourHeight() }}
            >
              {minuteLabel(minute)}
            </Text>
          ))}
          {eventIds().map((id: string) => (
            <Button
              key={readPlacement(id).event.id}
              aria-label={
                readPlacement(id).event.title +
                ', ' +
                effective(readPlacement(id).event).date +
                ', ' +
                minuteLabel(effective(readPlacement(id).event).startMinute) +
                '–' +
                minuteLabel(effective(readPlacement(id).event).endMinute)
              }
              className={`absolute flex-col items-start overflow-hidden p-2 rounded-[8px] text-left ${selectedClass(edit().preview?.id === readPlacement(id).event.id)}`}
              style={{
                left: eventBox(readPlacement(id))[0],
                top: eventBox(readPlacement(id))[1],
                width: eventBox(readPlacement(id))[2],
                height: eventBox(readPlacement(id))[3],
              }}
              onClick={() => {
                if (p.onEventClick !== undefined) p.onEventClick(readPlacement(id).event.id);
              }}
              onKeyDown={(e: ui.KeyEvent) => key(readPlacement(id).event, e)}
              onDrag={(e: ui.PointerEvent) => drag(readPlacement(id).event, false, e)}
              onPointerCancel={(e: ui.PointerEvent) => transition(EditPhase.Idle)}
            >
              <Text className={`w-full truncate text-[11px] font-medium text-${theme().foreground}`}>{readPlacement(id).event.title}</Text>
              <Text className={label()}>{minuteLabel(effective(readPlacement(id).event).startMinute)}</Text>
              <Show when={readPlacement(id).event.detail !== undefined}>
                <Text className={`w-full truncate text-[10px] text-${theme().mutedForeground}`}>
                  {readPlacement(id).event.detail ?? ''}
                </Text>
              </Show>
              <Show when={editable()}>
                <Button
                  aria-label={'Resize ' + readPlacement(id).event.title}
                  className={`absolute bottom-0 left-0 right-0 h-[8px] ${ring()}`}
                  onDrag={(e: ui.PointerEvent) => drag(readPlacement(id).event, true, e)}
                  onKeyDown={(e: ui.KeyEvent) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      const current = p.events().find((item: WeekEvent): boolean => item.id === readPlacement(id).event.id);
                      if (current !== undefined)
                        commit(changeWeekEvent(current, p.weekStart, 0, e.key === 'ArrowUp' ? -15 : 15, true, start(), end()));
                      e.preventDefault();
                    }
                  }}
                />
              </Show>
            </Button>
          ))}
        </View>
      </ScrollView>
      <Text className={label()}>Arrows move by a day or 15 minutes. Shift Up/Down resizes. Escape cancels a drag.</Text>
    </View>
  );
  componentEffect(
    () =>
      ui.onFocusWithin(root.node, (focused: boolean) => {
        if (!ui.hasFocusWithin(root.node)) transition(EditPhase.Idle);
      }),
    [],
  );
  componentEffect(() => {
    const state = edit(),
      original = state.original,
      events = p.events();
    if (
      state.phase !== EditPhase.Idle &&
      (original === null || !editable() || events.find((event: WeekEvent): boolean => event.id === original.id) !== original)
    )
      transition(EditPhase.Idle);
    return undefined;
  });
  componentEffect(() => () => transition(EditPhase.Idle), []);
  return node;
}

export interface MonthCalendarProps {
  label: string;
  month: () => string;
  onMonthChange: (month: string) => void;
  selected: () => string;
  onSelectDay: (date: string) => void;
  events: () => MonthEvent[];
  onDayActivate?: (date: string) => void;
  onEventClick?: (id: string) => void;
  today?: string;
  weekStart?: i32;
  cellHeight?: number;
  monthNames?: string[];
  dayNames?: string[];
  hour12?: boolean;
  className?: string;
}
class MonthLayout {
  dates: string[] = [];
  bars: MonthBar[] = [];
  weeks: i32[] = [];
  byDate = new Map<string, MonthEvent[]>();
}
class MonthCache {
  source: MonthEvent[] | null = null;
  month: string = '';
  first: i32 = -1;
  value = new MonthLayout();
  read(events: MonthEvent[], month: string, first: i32): MonthLayout {
    if (events !== this.source || month !== this.month || first !== this.first) {
      const next = new MonthLayout();
      next.dates = monthDays(month, first);
      next.bars = monthBars(events, next.dates);
      const ordered = events.slice();
      ordered.sort(compareMonthEvents);
      for (const date of next.dates)
        if (date !== '')
          next.byDate.set(
            date,
            ordered.filter((event: MonthEvent): boolean => event.start <= date && monthEventEnd(event) >= date),
          );
      for (let week: i32 = 0; week < next.dates.length / 7; week++) next.weeks.push(week);
      this.source = events;
      this.month = month;
      this.first = first;
      this.value = next;
    }
    return this.value;
  }
}
enum AgendaPhase {
  Closed,
  Open,
}
class MonthAgenda {
  phase: AgendaPhase;
  date: string;
  constructor(phase: AgendaPhase, date: string) {
    this.phase = phase;
    this.date = date;
  }
}
function MonthEventList(p: { events: () => MonthEvent[]; text: (event: MonthEvent) => string; activate: (id: string) => void }): i32 {
  const ref = createNodeRef();
  const node = <ScrollView ref={ref} className="w-full" style={{ height: Math.min(240, Math.max(32, p.events().length * 32)) }} />;
  virtualRows(
    ref.node,
    () => p.events().length,
    32,
    (index: i32): i32 => {
      const event = p.events()[index];
      return (
        <Button
          aria-label={p.text(event)}
          className={`h-[32px] px-2 items-start justify-center ${ring()}`}
          onClick={() => p.activate(event.id)}
        >
          <Text className={`text-[12px] truncate text-${theme().foreground}`}>{p.text(event)}</Text>
        </Button>
      );
    },
  );
  return node;
}
export function MonthCalendar(p: MonthCalendarProps): i32 {
  const grid = createNodeRef(),
    [width, setWidth] = componentSignal(700);
  const cache = componentRef(new MonthCache()).current;
  const [agenda, setAgenda] = componentSignal(new MonthAgenda(AgendaPhase.Closed, ''));
  const transitionAgenda = (phase: AgendaPhase, date: string = ''): void => {
    if (phase === AgendaPhase.Open && !validDate(date)) return;
    setAgenda(new MonthAgenda(phase, date));
  };
  const layout = componentMemo(() => cache.read(p.events(), p.month(), p.weekStart ?? 1), new MonthLayout());
  const narrow = (): boolean => width() < 520,
    dayWidth = (): number => width() / 7;
  const cellHeight = (): number => (narrow() ? 48 : Math.max(80, p.cellHeight ?? 104));
  const laneLimit = (): number => Math.max(1, Math.min(3, Math.floor((cellHeight() - 48) / 18)));
  const bars = (week: i32): MonthBar[] => layout().bars.filter((bar: MonthBar): boolean => bar.week === week && bar.lane < laneLimit());
  const dayEvents = (date: string): MonthEvent[] => layout().byDate.get(date) ?? eventsOnDay(p.events(), date);
  const timed = (date: string): MonthEvent[] =>
    dayEvents(date).filter((event: MonthEvent): boolean => event.allDay !== true && monthEventEnd(event) === event.start);
  const lanesFor = (week: i32): number => {
    let n = 0;
    for (const b of bars(week)) n = Math.max(n, b.lane + 1);
    return n;
  };
  const timedLimit = (week: i32): number => Math.max(0, Math.floor((cellHeight() - 46 - lanesFor(week) * 18) / 18));
  const overflow = (date: string, week: i32, column: i32): number => {
    let visible = Math.min(timed(date).length, timedLimit(week));
    for (const b of bars(week)) if (column >= b.column && column < b.column + b.days) visible++;
    return Math.max(0, dayEvents(date).length - visible);
  };
  const dayId = (date: string): string => 'month-' + grid.node + '-' + date;
  const choose = (date: string): void => {
    if (!validDate(date)) return;
    p.onSelectDay(date);
    if (date.slice(0, 7) !== p.month().slice(0, 7)) p.onMonthChange(date.slice(0, 7) + '-01');
  };
  const navigate = (months: i32): void => {
    const next = moveMonth(validDate(p.selected()) ? p.selected() : p.month(), months);
    p.onMonthChange(moveMonth(p.month().slice(0, 7) + '-01', months));
    p.onSelectDay(next);
  };
  const key = (e: ui.KeyEvent): void => {
    if (ui.focused() !== grid.node) return;
    let next = validDate(p.selected()) ? p.selected() : p.month();
    if (e.key === 'ArrowLeft') next = moveDate(next, -1);
    else if (e.key === 'ArrowRight') next = moveDate(next, 1);
    else if (e.key === 'ArrowUp') next = moveDate(next, -7);
    else if (e.key === 'ArrowDown') next = moveDate(next, 7);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      navigate(e.key === 'PageUp' ? -1 : 1);
      e.preventDefault();
      return;
    } else if (e.key === 'Home') next = p.today ?? todayDate();
    else if (e.key === 'Enter') {
      if (p.onDayActivate !== undefined) p.onDayActivate(next);
      e.preventDefault();
      return;
    } else if (e.key !== ' ') return;
    choose(next);
    e.preventDefault();
  };
  const title = (): string =>
    (p.monthNames ?? [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ])[Number(p.month().slice(5, 7)) - 1] +
    ' ' +
    p.month().slice(0, 4);
  const names = (): string[] => p.dayNames ?? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const eventLabel = (event: MonthEvent): string =>
    event.allDay === true || monthEventEnd(event) !== event.start
      ? event.title
      : minuteLabel(event.timeMinutes ?? 0, p.hour12 === true) + ' ' + event.title;
  const activateEvent = (id: string): void => {
    if (p.onEventClick !== undefined) p.onEventClick(id);
  };
  return (
    <View className={`flex-col gap-3 min-w-0 ${p.className ?? ''}`} role="group" aria-label={p.label}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text aria-live="polite" className={`grow text-[15px] font-medium text-${theme().foreground}`}>
          {title()}
        </Text>
        <KitButton label="Today" variant="outline" size="sm" onClick={() => choose(p.today ?? todayDate())} />
        <KitButton label="‹" ariaLabel={'Previous month in ' + p.label} variant="ghost" size="sm" onClick={() => navigate(-1)} />
        <KitButton label="›" ariaLabel={'Next month in ' + p.label} variant="ghost" size="sm" onClick={() => navigate(1)} />
      </View>
      <Button
        ref={grid}
        role="grid"
        aria-label={p.label + ', ' + title() + '. Arrows select a day; Enter activates.'}
        aria-activedescendant={dayId(p.selected())}
        className={`relative flex-col w-full overflow-hidden ${panel()} ${ring()}`}
        onKeyDown={key}
      >
        <Canvas
          className="absolute left-0 top-0 right-0 h-[1px] pointer-events-none"
          style={{ lazy: 1 }}
          onDraw={(x: i32, y: i32, w: i32, h: i32) => {
            if (width() !== w) setWidth(w);
          }}
        />
        <View role="row" className="flex-row w-full">
          {[0, 1, 2, 3, 4, 5, 6].map((index: number) => (
            <Text role="columnheader" className={`grow basis-0 text-center py-2 text-[11px] text-${theme().mutedForeground}`}>
              {names()[(index + (p.weekStart ?? 1)) % 7]}
            </Text>
          ))}
        </View>
        {layout().weeks.map((week: i32) => (
          <View role="row" className="relative w-full" style={{ height: cellHeight() }}>
            {[0, 1, 2, 3, 4, 5, 6].map((column: number) =>
              renderSlot(() => {
                const date = layout().dates[week * 7 + column],
                  events = date === '' ? [] : dayEvents(date);
                return (
                  <View
                    className={`absolute top-0 border-t border-r border-${theme().border} ${date === p.selected() ? 'bg-' + theme().accentSoft : ''}`}
                    style={{ left: column * dayWidth(), width: dayWidth(), height: cellHeight() }}
                  >
                    <Button
                      id={dayId(date)}
                      role="gridcell"
                      tabIndex={-1}
                      disabled={date === ''}
                      aria-label={date + ', ' + events.length + ' events'}
                      aria-selected={date === p.selected()}
                      aria-current={date === (p.today ?? todayDate()) ? 'date' : ''}
                      className={`absolute inset-0 p-1 items-start justify-start ${ring()} ${date.slice(0, 7) !== p.month().slice(0, 7) ? 'opacity-45' : ''}`}
                      onClick={() => {
                        choose(date);
                        ui.focusNode(grid.node);
                      }}
                      onDoubleClick={(e: ui.PointerEvent) => {
                        choose(date);
                        if (p.onDayActivate !== undefined) p.onDayActivate(date);
                      }}
                    >
                      <Text
                        className={`text-[11px] ${date === (p.today ?? todayDate()) ? 'font-semibold text-' + theme().accent : 'text-' + theme().foreground}`}
                      >
                        {date === '' ? '' : String(Number(date.slice(8, 10)))}
                      </Text>
                    </Button>
                    <Show when={narrow()}>
                      <View className="absolute top-[28px] left-1 flex-row gap-1 pointer-events-none">
                        {events.slice(0, 3).map((event: MonthEvent) => (
                          <View className={`w-1 h-1 rounded-full bg-${theme().accent}`} />
                        ))}
                      </View>
                    </Show>
                    <Show when={!narrow() && date !== ''}>
                      <View className="absolute left-1 right-1 flex-col" style={{ top: 26 + lanesFor(week) * 18 }}>
                        {timed(date)
                          .slice(0, timedLimit(week))
                          .map((event: MonthEvent) => (
                            <Button
                              aria-label={eventLabel(event)}
                              className={`h-[18px] items-start ${ring()}`}
                              onClick={() => activateEvent(event.id)}
                            >
                              <Text className={`text-[10px] truncate text-${theme().foreground}`}>{eventLabel(event)}</Text>
                            </Button>
                          ))}
                      </View>
                      <Show when={overflow(date, week, column) > 0}>
                        <View className="absolute bottom-1 left-1 right-1">
                          <KitButton
                            label={'+' + overflow(date, week, column) + ' more'}
                            variant="ghost"
                            size="sm"
                            onClick={() => transitionAgenda(AgendaPhase.Open, date)}
                          />
                        </View>
                      </Show>
                    </Show>
                  </View>
                );
              }),
            )}
            <Show when={!narrow()}>
              {bars(week).map((bar: MonthBar) => (
                <Button
                  aria-label={bar.event.title + ', ' + bar.event.start + ' to ' + monthEventEnd(bar.event)}
                  className={`absolute h-[17px] px-1 items-start rounded-[3px] bg-${theme().accentSoft} ${ring()}`}
                  style={{ left: bar.column * dayWidth() + 2, top: 25 + bar.lane * 18, width: bar.days * dayWidth() - 4 }}
                  onClick={() => activateEvent(bar.event.id)}
                >
                  <Text className={`text-[10px] truncate text-${theme().foreground}`}>
                    {bar.event.start < layout().dates[week * 7] ? '‹ ' : ''}
                    {bar.event.title}
                    {monthEventEnd(bar.event) > layout().dates[week * 7 + 6] ? ' ›' : ''}
                  </Text>
                </Button>
              ))}
            </Show>
          </View>
        ))}
      </Button>
      <Show when={narrow()}>
        <View className={`flex-col gap-1 p-3 ${panel()}`}>
          <Text className={`text-[12px] font-medium text-${theme().foreground}`}>{p.selected()}</Text>
          <Show when={dayEvents(p.selected()).length === 0}>
            <Text className={label()}>No events</Text>
          </Show>
          <MonthEventList events={() => dayEvents(p.selected())} text={eventLabel} activate={activateEvent} />
        </View>
      </Show>
      <Dialog
        open={() => agenda().phase === AgendaPhase.Open}
        onOpenChange={(open: boolean) => {
          if (!open) transitionAgenda(AgendaPhase.Closed);
        }}
        title={agenda().date + ' events'}
        width={360}
      >
        <Show when={agenda().phase === AgendaPhase.Open}>
          <MonthEventList events={() => dayEvents(agenda().date)} text={eventLabel} activate={activateEvent} />
        </Show>
      </Dialog>
    </View>
  );
}

export interface GanttChartProps {
  label: string;
  origin: string;
  days: i32;
  tasks: () => GanttTask[];
  onTaskChange?: (task: GanttTask) => void;
  onTaskClick?: (id: string) => void;
  dayWidth?: number;
  rowHeight?: number;
  height?: number;
  today?: string;
  readOnly?: boolean;
  className?: string;
}
class GanttEdit {
  phase: EditPhase;
  original: GanttTask | null;
  preview: GanttTask | null;
  x: number;
  constructor(phase: EditPhase, original: GanttTask | null, preview: GanttTask | null, x: number = 0) {
    this.phase = phase;
    this.original = original;
    this.preview = preview;
    this.x = x;
  }
}
class GanttCache {
  source: GanttTask[] | null = null;
  origin: string = '';
  days: i32 = 0;
  rows = new Map<string, i32>();
  dates: string[] = [];
  months: string[] = [];
  weekends: boolean[] = [];
  read(tasks: GanttTask[], origin: string, days: i32): GanttTask[] {
    if (tasks !== this.source || days !== this.days || origin !== this.origin) {
      validateGantt(tasks, days);
      if (!validDate(origin) || dateDay(origin) + days - 1 > dateDay('9999-12-31'))
        throw new RangeError('Gantt origin exceeds the supported civil date range');
      this.rows.clear();
      this.dates = [];
      this.months = [];
      this.weekends = [];
      for (let i = 0; i < tasks.length; i++) this.rows.set(tasks[i].id, i);
      for (let i = 0; i < days; i++) {
        const date = moveDate(origin, i);
        this.dates.push(date.slice(8, 10));
        this.months.push(i === 0 || date.endsWith('-01') ? date.slice(0, 7) : '');
        this.weekends.push(dateWeekday(date) === 0 || dateWeekday(date) === 6);
      }
      this.source = tasks;
      this.origin = origin;
      this.days = days;
    }
    return tasks;
  }
}
function GanttBar(p: {
  id: string;
  task: () => GanttTask;
  index: i32;
  rowHeight: () => number;
  dayWidth: () => number;
  editable: () => boolean;
  selected: () => string;
  select: (id: string) => void;
  onKey: (id: string, edge: i32, event: ui.KeyEvent) => void;
  drag: (id: string, edge: i32, event: ui.PointerEvent) => void;
  register: (id: string, node: i32) => () => void;
}): i32 {
  const ref = createNodeRef();
  const left = (): number => p.task().start * p.dayWidth() + (p.task().milestone === true ? p.dayWidth() / 2 - 10 : 2);
  const width = (): number => (p.task().milestone === true ? 20 : Math.max(12, (p.task().end - p.task().start) * p.dayWidth() - 4));
  const node = (
    <Button
      ref={ref}
      aria-label={'Task ' + p.task().title}
      aria-disabled={p.task().disabled === true}
      aria-selected={p.selected() === p.id}
      className={`absolute flex-col justify-center overflow-hidden rounded-[5px] ${p.task().milestone === true ? 'bg-transparent' : selectedClass(p.selected() === p.id)} ${p.task().disabled === true ? 'opacity-45' : ''} ${ring()}`}
      style={{ left: left(), top: p.index * p.rowHeight() + 8, width: width(), height: p.rowHeight() - 16 }}
      onClick={() => p.select(p.id)}
      onKeyDown={(e: ui.KeyEvent) => p.onKey(p.id, 0, e)}
      onDrag={(e: ui.PointerEvent) => p.drag(p.id, 0, e)}
    >
      <Show when={p.task().milestone !== true}>
        <View
          className={`absolute top-0 bottom-0 left-0 bg-${theme().accent} opacity-20 pointer-events-none`}
          style={{ widthPercent: p.task().progress ?? 0 }}
        />
        <Text className={`px-2 text-[10px] truncate text-${theme().foreground}`}>{Math.round((p.task().progress ?? 0) * 100)}%</Text>
        <Show when={p.editable() && p.task().disabled !== true}>
          <Button
            aria-label={'Resize start of ' + p.task().title}
            className={`absolute top-0 bottom-0 left-0 w-[7px] ${ring()}`}
            onKeyDown={(e: ui.KeyEvent) => p.onKey(p.id, -1, e)}
            onDrag={(e: ui.PointerEvent) => p.drag(p.id, -1, e)}
          />
          <Button
            aria-label={'Resize end of ' + p.task().title}
            className={`absolute top-0 bottom-0 right-0 w-[7px] ${ring()}`}
            onKeyDown={(e: ui.KeyEvent) => p.onKey(p.id, 1, e)}
            onDrag={(e: ui.PointerEvent) => p.drag(p.id, 1, e)}
          />
        </Show>
      </Show>
    </Button>
  );
  componentEffect(() => p.register(p.id, ref.node), []);
  return node;
}
export function GanttChart(p: GanttChartProps): i32 {
  const root = createNodeRef(),
    list = createNodeRef(),
    timeline = createNodeRef(),
    body = createNodeRef();
  const cache = componentRef(new GanttCache()).current,
    nodes = componentRef(new Map<string, i32>()).current;
  const [rootWidth, setRootWidth] = componentSignal(700);
  const [selected, setSelected] = componentSignal(''),
    [edit, setEdit] = componentSignal(new GanttEdit(EditPhase.Idle, null, null));
  const tasks = componentMemo(() => cache.read(p.tasks(), p.origin, p.days), [] as GanttTask[]);
  const ids = componentMemo(() => tasks().map((task: GanttTask): string => task.id), [] as string[]);
  const rowHeight = (): number => Math.max(32, Math.min(96, p.rowHeight ?? 40)),
    dayWidth = (): number => Math.max(20, Math.min(100, p.dayWidth ?? 30));
  const editable = (): boolean => p.readOnly !== true && p.onTaskChange !== undefined;
  const effective = (id: string): GanttTask => {
    const current = edit();
    if (current.preview !== null && current.preview.id === id) return current.preview;
    return tasks().find((task: GanttTask): boolean => task.id === id)!;
  };
  const transition = (phase: EditPhase, original: GanttTask | null = null, preview: GanttTask | null = null, x: number = 0): void => {
    const current = edit();
    if (phase === EditPhase.Idle && current.phase === EditPhase.Idle) return;
    if (phase !== EditPhase.Idle && current.phase !== EditPhase.Idle && current.phase !== phase) return;
    if (phase !== EditPhase.Idle && (original === null || preview === null)) return;
    if (
      phase === current.phase &&
      preview !== null &&
      current.preview !== null &&
      preview.start === current.preview.start &&
      preview.end === current.preview.end
    )
      return;
    setEdit(new GanttEdit(phase, original, preview, x));
  };
  const commit = (task: GanttTask): void => {
    if (editable() && p.onTaskChange !== undefined) p.onTaskChange(task);
  };
  const select = (id: string): void => {
    setSelected(id);
    if (p.onTaskClick !== undefined) p.onTaskClick(id);
  };
  const key = (id: string, edge: i32, e: ui.KeyEvent): void => {
    if (e.key === 'Escape') {
      transition(EditPhase.Idle);
      e.preventDefault();
      return;
    }
    const at = ids().indexOf(id),
      task = p.tasks().find((item: GanttTask): boolean => item.id === id);
    if (task === undefined) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const target = ids()[Math.max(0, Math.min(ids().length - 1, at + (e.key === 'ArrowUp' ? -1 : 1)))],
        handle = nodes.get(target);
      setSelected(target);
      if (handle !== undefined) ui.focusNode(handle);
      e.preventDefault();
      return;
    }
    if (!editable() || task.disabled === true) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const result = changeGanttTask(task, e.key === 'ArrowLeft' ? -1 : 1, edge !== 0 ? edge : e.shift ? 1 : 0, p.days);
    setSelected(id);
    commit(result);
    e.preventDefault();
  };
  const drag = (id: string, edge: i32, e: ui.PointerEvent): void => {
    if (!editable()) return;
    const point = ui.toLocal(body.node, e.gx, e.gy);
    const press = e.phase === 0 ? ui.toLocal(body.node, e.gx - e.dx, e.gy - e.dy) : point;
    if (e.phase === 0) {
      const task = p.tasks().find((item: GanttTask): boolean => item.id === id);
      if (task !== undefined && task.disabled !== true) {
        setSelected(id);
        transition(edge < 0 ? EditPhase.ResizeStart : edge > 0 ? EditPhase.ResizeEnd : EditPhase.Move, task, task, press[0]);
      }
    }
    const state = edit();
    if (state.phase === EditPhase.Idle || state.original === null) return;
    if (e.phase === 3) {
      transition(EditPhase.Idle);
      return;
    }
    const preview = changeGanttTask(
      state.original,
      Math.round((point[0] - state.x) / dayWidth()),
      state.phase === EditPhase.ResizeStart ? -1 : state.phase === EditPhase.ResizeEnd ? 1 : 0,
      p.days,
    );
    if (e.phase === 2) {
      const original = state.original,
        current = p.tasks().find((task: GanttTask): boolean => task.id === original.id);
      transition(EditPhase.Idle);
      if (current === original) commit(preview);
    } else transition(state.phase, state.original, preview, state.x);
  };
  const line = componentRef([0, 0, 0, 0]).current,
    elbow = componentRef([0, 0, 0, 0, 0, 0, 0, 0]).current,
    diamond = componentRef([0, 0, 0, 0, 0, 0, 0, 0]).current,
    arrow = componentRef([0, 0, 0, 0, 0, 0]).current;
  const drawHeader = (x: i32, y: i32, w: i32, h: i32): void => {
    const rootBox = ui.screenBox(root.node);
    if (rootWidth() !== rootBox[2]) setRootWidth(rootBox[2]);
    const offset = ui.scrollLeft(timeline.node),
      first = Math.max(0, Math.floor(offset / dayWidth())),
      last = Math.min(p.days, Math.ceil((offset + w) / dayWidth()));
    const face = font('sans', 10),
      color = themeColor('mutedForeground') as u32;
    for (let day = first; day < last; day++) {
      const left = x + day * dayWidth() - offset;
      if (cache.weekends[day]) rect(left, y, dayWidth(), h, themeColor('muted') as u32);
      drawText(face, left + 5, y + 29, cache.dates[day], color, 255, 0);
      if (cache.months[day] !== '') drawText(face, left + 4, y + 5, cache.months[day], color, 255, 0);
    }
  };
  const drawBody = (x: i32, y: i32, w: i32, h: i32): void => {
    const offsetX = ui.scrollLeft(timeline.node),
      offsetY = ui.scrollTop(timeline.node),
      viewport = ui.screenBox(timeline.node);
    const first = Math.max(0, Math.floor(offsetX / dayWidth())),
      last = Math.min(p.days, Math.ceil((offsetX + viewport[2]) / dayWidth()));
    for (let day = first; day < last; day++) {
      if (cache.weekends[day]) rect(x + day * dayWidth(), y, dayWidth(), h, themeColor('muted') as u32);
      line[0] = x + day * dayWidth();
      line[2] = line[0];
      line[1] = y;
      line[3] = y + h;
      stroke(line, 1, themeColor('border') as u32, 255, false);
    }
    for (
      let row = Math.max(0, Math.floor(offsetY / rowHeight()));
      row <= Math.min(tasks().length, Math.ceil((offsetY + viewport[3]) / rowHeight()));
      row++
    ) {
      line[0] = x;
      line[2] = x + w;
      line[1] = y + row * rowHeight();
      line[3] = line[1];
      stroke(line, 1, themeColor('border') as u32, 255, false);
    }
    const today = dateDay(p.today ?? todayDate()) - dateDay(p.origin);
    if (today >= 0 && today < p.days) {
      line[0] = x + (today + 0.5) * dayWidth();
      line[2] = line[0];
      line[1] = y;
      line[3] = y + h;
      stroke(line, 1.5, themeColor('accent') as u32, 255, false);
    }
    for (let row = 0; row < tasks().length; row++) {
      const task = effective(tasks()[row].id),
        cy = y + (row + 0.5) * rowHeight();
      if (task.milestone === true && row * rowHeight() + rowHeight() >= offsetY && row * rowHeight() <= offsetY + viewport[3]) {
        const cx = x + (task.start + 0.5) * dayWidth();
        diamond[0] = cx;
        diamond[1] = cy - 8;
        diamond[2] = cx + 8;
        diamond[3] = cy;
        diamond[4] = cx;
        diamond[5] = cy + 8;
        diamond[6] = cx - 8;
        diamond[7] = cy;
        polygon(diamond, themeColor('accent') as u32, 255);
      }
      if (task.dependsOn === undefined) continue;
      const previous = cache.rows.get(task.dependsOn);
      if (previous === undefined) continue;
      const from = effective(tasks()[previous].id),
        sx = x + (from.milestone === true ? from.start + 0.5 : from.end) * dayWidth(),
        sy = y + (previous + 0.5) * rowHeight();
      const endX = x + (task.start + (task.milestone === true ? 0.5 : 0)) * dayWidth() - 2,
        joint = Math.max(sx + 8, endX - 10);
      elbow[0] = sx;
      elbow[1] = sy;
      elbow[2] = joint;
      elbow[3] = sy;
      elbow[4] = joint;
      elbow[5] = cy;
      elbow[6] = endX;
      elbow[7] = cy;
      stroke(elbow, 1, themeColor('mutedForeground') as u32, 255, false);
      const direction = endX >= joint ? 1 : -1;
      arrow[0] = endX;
      arrow[1] = cy;
      arrow[2] = endX - direction * 5;
      arrow[3] = cy - 3;
      arrow[4] = endX - direction * 5;
      arrow[5] = cy + 3;
      polygon(arrow, themeColor('mutedForeground') as u32, 255);
    }
  };
  const node = (
    <View ref={root} role="group" aria-label={p.label} className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
      <View className={`flex-row overflow-hidden ${panel()}`}>
        <View className="shrink-0" style={{ width: Math.max(96, Math.min(160, rootWidth() * 0.35)) }}>
          <View className={`h-[52px] px-2 justify-center border-b border-${theme().border}`}>
            <Text className={label()}>Task / owner</Text>
          </View>
          <ScrollView
            ref={list}
            style={{ height: p.height ?? 280 }}
            onScroll={(event: ui.ResponderEvent, gesture: ui.GestureState) => {
              const y = event.nativeEvent.contentOffset.y;
              if (ui.scrollTop(timeline.node) !== y) ui.scrollTo(timeline.node, ui.scrollLeft(timeline.node), y);
            }}
          >
            {ids().map((id: string) => (
              <Button
                className={`justify-center items-start px-2 border-b border-${theme().border} ${ring()} ${selected() === id ? 'bg-' + theme().accentSoft : ''}`}
                style={{ height: rowHeight() }}
                aria-label={'Select task ' + effective(id).title}
                onClick={() => select(id)}
              >
                <Text className={`text-[12px] truncate text-${theme().foreground}`}>{effective(id).title}</Text>
                <Show when={effective(id).owner !== undefined}>
                  <Text className={label()}>{effective(id).owner ?? ''}</Text>
                </Show>
              </Button>
            ))}
          </ScrollView>
        </View>
        <View className="grow min-w-0">
          <Canvas className={`h-[52px] border-b border-${theme().border}`} style={{ lazy: 1 }} onDraw={drawHeader} />
          <ScrollView
            ref={timeline}
            className="overflow-auto w-full"
            style={{ height: p.height ?? 280 }}
            onScroll={(event: ui.ResponderEvent, gesture: ui.GestureState) => {
              const y = event.nativeEvent.contentOffset.y;
              if (ui.scrollTop(list.node) !== y) ui.scrollTo(list.node, 0, y);
              ui.repaint();
            }}
          >
            <View
              ref={body}
              className="relative"
              style={{ width: p.days * dayWidth(), height: Math.max(rowHeight(), tasks().length * rowHeight()) }}
            >
              <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={drawBody} />
              {ids().map((id: string, index: i32) => (
                <GanttBar
                  key={id}
                  id={id}
                  task={() => effective(id)}
                  index={index}
                  rowHeight={rowHeight}
                  dayWidth={dayWidth}
                  editable={editable}
                  selected={selected}
                  select={select}
                  onKey={key}
                  drag={drag}
                  register={(item: string, handle: i32): (() => void) => {
                    nodes.set(item, handle);
                    return () => {
                      if (nodes.get(item) === handle) nodes.delete(item);
                    };
                  }}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
      <Text role="status" aria-live="polite" className={label()}>
        {selected() !== '' && ids().includes(selected())
          ? effective(selected()).title +
            ', ' +
            moveDate(p.origin, effective(selected()).start) +
            '–' +
            moveDate(p.origin, Math.max(effective(selected()).start, effective(selected()).end - 1))
          : 'Arrows move a task by one day. Shift Left/Right changes its end. Escape cancels a drag.'}
      </Text>
    </View>
  );
  componentEffect(
    () =>
      ui.onFocusWithin(root.node, (focused: boolean) => {
        if (!ui.hasFocusWithin(root.node)) transition(EditPhase.Idle);
      }),
    [],
  );
  componentEffect(() => {
    const state = edit(),
      original = state.original,
      input = tasks();
    if (
      state.phase !== EditPhase.Idle &&
      (original === null || !editable() || input.find((task: GanttTask): boolean => task.id === original.id) !== original)
    )
      transition(EditPhase.Idle);
    theme();
    ui.repaint();
    return undefined;
  });
  componentEffect(() => () => transition(EditPhase.Idle), []);
  return node;
}
