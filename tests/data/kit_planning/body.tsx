/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { Show } from 'zinc:ui/solid';
import { componentSignal } from 'zinc:ui/kit/host';
import {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  KanbanMove,
  moveKanbanCard,
  WeekCalendar,
  WeekEvent,
  MonthCalendar,
  MonthEvent,
  GanttChart,
  GanttTask,
  useQuietTheme,
} from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
useQuietTheme();
let getCards: () => KanbanCard[] = () => [],
  getWeek: () => WeekEvent[] = () => [],
  getTasks: () => GanttTask[] = () => [];
let getMonth: () => string = () => '',
  getDay: () => string = () => '',
  resetMonth: () => void = () => {},
  hide: () => void = () => {},
  show: () => void = () => {};
let replaceCard: () => void = () => {};
let activated = '',
  opened = '',
  boardClicks: i32 = 0,
  moves: i32 = 0;
function Surface(): i32 {
  const columns: KanbanColumn[] = [
    { id: 'one', title: 'One' },
    { id: 'two', title: 'Two' },
  ];
  const [cards, setCards] = componentSignal<KanbanCard[]>([
    { id: 'a', column: 'one', title: 'Alpha' },
    { id: 'b', column: 'one', title: 'Bravo' },
    { id: 'c', column: 'two', title: 'Charlie', disabled: true },
  ]);
  const [events, setEvents] = componentSignal<WeekEvent[]>([
    { id: 'meeting', title: 'Meeting', date: '2026-11-09', startMinute: 540, endMinute: 600 },
  ]);
  const [tasks, setTasks] = componentSignal<GanttTask[]>([
    { id: 'task', title: 'Build', start: 2, end: 5, progress: 0.5 },
    { id: 'milestone', title: 'Release', start: 8, end: 8, milestone: true, dependsOn: 'task' },
  ]);
  const [month, setMonth] = componentSignal('2026-11-01'),
    [day, setDay] = componentSignal('2026-11-10');
  const monthly: MonthEvent[] = [];
  for (let i = 0; i < 12; i++) monthly.push({ id: 'event-' + i, title: 'Event ' + i, start: '2026-11-10', timeMinutes: 480 + i * 15 });
  replaceCard = () =>
    setCards(
      cards().map((card: KanbanCard): KanbanCard => (card.id === 'a' ? { id: card.id, column: card.column, title: card.title } : card)),
    );
  getCards = cards;
  getWeek = events;
  getTasks = tasks;
  getMonth = month;
  getDay = day;
  resetMonth = () => {
    setMonth('2026-11-01');
    setDay('2026-11-10');
  };
  return (
    <View className="flex-col gap-3 w-full">
      <KanbanBoard
        label="Board fixture"
        columns={() => columns}
        cards={cards}
        height={150}
        onMove={(move: KanbanMove) => {
          moves++;
          setCards(moveKanbanCard(columns, cards(), move));
        }}
        onCardClick={(id: string) => {
          boardClicks++;
        }}
      />
      <WeekCalendar
        label="Week fixture"
        weekStart="2026-11-09"
        events={events}
        startMinute={480}
        endMinute={720}
        hourHeight={40}
        height={220}
        today="2026-11-10"
        nowMinute={() => 600}
        onEventChange={(event: WeekEvent) => setEvents(events().map((old: WeekEvent): WeekEvent => (old.id === event.id ? event : old)))}
      />
      <GanttChart
        label="Gantt fixture"
        origin="2026-11-01"
        days={14}
        tasks={tasks}
        height={100}
        today="2026-11-10"
        onTaskChange={(task: GanttTask) => setTasks(tasks().map((old: GanttTask): GanttTask => (old.id === task.id ? task : old)))}
      />
      <MonthCalendar
        label="Month fixture"
        month={month}
        onMonthChange={setMonth}
        selected={day}
        onSelectDay={setDay}
        events={() => monthly}
        today="2026-11-10"
        cellHeight={80}
        onDayActivate={(date: string) => {
          activated = date;
        }}
        onEventClick={(id: string) => {
          opened = id;
        }}
      />
    </View>
  );
}
export function App(): i32 {
  const [visible, setVisible] = componentSignal(true);
  hide = () => setVisible(false);
  show = () => setVisible(true);
  return (
    <View className="p-2 w-full">
      <Show when={visible()}>
        <Surface />
      </Show>
    </View>
  );
}
function find(h: i32, label: string, prefix: boolean = false): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (prefix ? n.label.startsWith(label) : n.label === label) return h;
  for (const c of n.children) {
    const found = find(c, label, prefix);
    if (found >= 0) return found;
  }
  return -1;
}
function named(label: string, prefix: boolean = false): i32 {
  const h = find(ui.rootNode(), label, prefix);
  ok(h >= 0, 'Missing ' + label);
  return h;
}
function key(label: string, value: string, mods: i32 = 0, prefix: boolean = false): void {
  const h = named(label, prefix);
  ui.focusNode(h);
  ui.keyDown(h, value, mods);
}
function pointer(h: i32, dx: number, dy: number, cancel: boolean = false): void {
  const b = ui.screenBox(h),
    x = b[0] + b[2] / 2,
    y = b[1] + Math.min(14, b[3] / 2);
  ui.pointerAt(x, y, false);
  ui.pointerAt(x, y, true);
  ui.pointerAt(x + dx / 3, y + dy / 3, true);
  ui.pointerAt(x + dx, y + dy, true);
  if (cancel) ui.sendKey('Escape');
  ui.pointerAt(x + dx, y + dy, false);
}
let frame: i32 = 0,
  stage: i32 = 0;
export function advance(dt: number): void {
  if (frame++ !== 0) return;
  ui.setAfterPaint(() => {
    if (frame++ < 3) return;
    if (stage === 0) {
      key('Alpha', ' ');
      ui.sendKey('ArrowRight');
      ui.sendKey('Enter');
      equal(getCards().find((c: KanbanCard) => c.id === 'a')!.column, 'two');
      equal(moves, 1);
    } else if (stage === 1) {
      equal(ui.focused(), named('Alpha'), 'keyboard drop retains card focus');
      key('Meeting,', 'ArrowDown', 0, true);
      ui.sendKey('ArrowDown');
      equal(getWeek()[0].startMinute, 570, 'same-turn calendar changes');
      key('Task Build', 'ArrowRight');
      ui.sendKey('ArrowRight');
      ui.sendKey('ArrowLeft', ui.SHIFT);
      equal(getTasks()[0].start, 4);
      equal(getTasks()[0].end, 6);
      key('Month fixture,', 'ArrowRight', 0, true);
      ui.sendKey('ArrowDown');
      equal(getDay(), '2026-11-18');
      ui.sendKey('PageDown');
      ui.sendKey('ArrowLeft');
      ui.sendKey('Enter');
      equal(getMonth(), '2026-12-01');
      equal(activated, '2026-12-17');
      resetMonth();
      const alpha = named('Alpha'),
        bravo = named('Bravo'),
        a = ui.screenBox(alpha),
        b = ui.screenBox(bravo);
      pointer(alpha, b[0] + b[2] / 2 - (a[0] + a[2] / 2), b[1] + b[3] - 4 - (a[1] + Math.min(14, a[3] / 2)));
    } else if (stage === 2) {
      equal(getCards().find((c: KanbanCard) => c.id === 'a')!.column, 'one', 'pointer focus must not cancel a drag');
      equal(moves, 2);
      const before = getWeek()[0];
      pointer(named('Meeting,', true), 0, 20);
      equal(getWeek()[0].startMinute, before.startMinute + 30, 'drag minutes from original press');
      const beforeTask = getTasks()[0];
      pointer(named('Task Build'), 30, 0);
      equal(getTasks()[0].start, beforeTask.start + 1, 'Gantt pointer move commits on release');
      key('Alpha', ' ');
      ui.sendKey('ArrowRight');
      ui.sendKey('Escape');
      equal(moves, 2, 'cancel does not commit');
      key('Alpha', ' ');
      ui.sendKey('ArrowRight');
      replaceCard();
      ui.sendKey('Enter');
      equal(moves, 2, 'replaced card rejects stale gesture');
      const overflow = named('+11 more');
      const box = ui.screenBox(overflow);
      ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
      ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
    } else if (stage === 3) {
      ok(find(ui.rootNode(), '2026-11-10 events') >= 0, 'overflow dialog');
      key('08:00 Event 0', 'Enter');
    } else if (stage === 4) {
      equal(opened, 'event-0');
      ui.sendKey('Escape');
      key('Alpha', ' ');
      hide();
    } else if (stage === 5) {
      show();
    } else if (stage === 6) {
      equal(getCards()[0].column, 'one');
      equal(getWeek()[0].startMinute, 540);
      equal(getTasks()[0].start, 2);
      ok(find(ui.rootNode(), 'Alpha') >= 0, 'remount');
      ui.setAfterPaint(null);
      console.log('kit planning: pass');
    }
    stage++;
  });
}
