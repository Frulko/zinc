import { equal, ok } from 'zinc:assert';
import { KanbanCard, KanbanColumn, KanbanMove, WeekEvent, MonthEvent, GanttTask, moveKanbanCard } from 'zinc:ui/kit';
import {
  validateBoard,
  weekPlacements,
  changeWeekEvent,
  monthDays,
  monthBars,
  eventsOnDay,
  validateGantt,
  changeGanttTask,
  minuteLabel,
} from '../../../lib/std/kit/planning-model';
function rejects(run: () => void): void {
  let failed = false;
  try {
    run();
  } catch (error) {
    failed = true;
  }
  ok(failed, 'invalid model accepted');
}
const columns: KanbanColumn[] = [
  { id: 'todo', title: 'To do', limit: 1 },
  { id: 'done', title: 'Done' },
  { id: 'empty', title: 'Empty' },
];
const cards: KanbanCard[] = [
  { id: 'a/é', column: 'todo', title: 'One' },
  { id: 'b', column: 'todo', title: 'Two' },
  { id: 'c', column: 'done', title: 'Three', disabled: true },
];
const moved = moveKanbanCard(columns, cards, new KanbanMove('a/é', 'todo', 'done', 0));
equal(cards[0].column, 'todo');
equal(moved[1].id, 'a/é');
equal(moved[1].column, 'done');
ok(moved[0] === cards[1]);
const reorder = moveKanbanCard(columns, cards, new KanbanMove('a/é', 'todo', 'todo', 1));
equal(reorder[0].id, 'b');
equal(reorder[1].id, 'a/é');
ok(moveKanbanCard(columns, cards, new KanbanMove('c', 'done', 'todo', 0)) === cards);
ok(moveKanbanCard(columns, cards, new KanbanMove('a/é', 'wrong', 'done', 0)) === cards);
ok(moveKanbanCard(columns, cards, new KanbanMove('a/é', 'todo', 'todo', 0)) === cards);
equal(moveKanbanCard(columns, cards, new KanbanMove('b', 'todo', 'empty', 0))[2].column, 'empty');
rejects(() => validateBoard(columns, [cards[0], cards[0]]));
rejects(() => validateBoard(columns, [{ id: 'x', title: 'Bad', column: 'missing' }]));
const week = '2026-11-09';
const events: WeekEvent[] = [
  { id: 'a', title: 'A', date: week, startMinute: 540, endMinute: 630 },
  { id: 'b', title: 'B', date: week, startMinute: 600, endMinute: 660 },
  { id: 'c', title: 'C', date: week, startMinute: 640, endMinute: 700 },
  { id: 'd', title: 'D', date: week, startMinute: 700, endMinute: 720 },
  { id: 'off', title: 'Off', date: '2026-12-01', startMinute: 540, endMinute: 600 },
];
const placements = weekPlacements(events, week, 480, 1080);
equal(placements.length, 4);
equal(placements[0].lanes, 2);
equal(placements[2].lane, 0);
equal(placements[3].lanes, 1);
const shifted = changeWeekEvent(events[0], week, 2, 19, false, 480, 1080);
equal(shifted.date, '2026-11-11');
equal(shifted.startMinute, 555);
equal(shifted.endMinute, 645);
equal(changeWeekEvent(events[0], week, 99, 9999, false, 480, 1080).date, '2026-11-15');
equal(changeWeekEvent(events[0], week, 0, -9999, true, 480, 1080).endMinute, 555);
rejects(() => weekPlacements([{ id: 'x', title: 'X', date: week, startMinute: 720, endMinute: 600 }], week, 480, 1080));
equal(minuteLabel(1440), '24:00');
equal(minuteLabel(570, true), '9:30a');
const feb = monthDays('2024-02-01', 1);
equal(feb.length, 35);
equal(feb[0], '2024-01-29');
ok(feb.includes('2024-02-29'));
equal(monthDays('2026-02-01', 0).length, 28);
equal(monthDays('0001-01-01', 0)[0], '');
const monthly: MonthEvent[] = [
  { id: 'span', title: 'Sprint', start: '2026-11-06', end: '2026-11-11', allDay: true },
  { id: 'second', title: 'Second', start: '2026-11-09', end: '2026-11-10', allDay: true },
  { id: 'late', title: 'Late', start: week, timeMinutes: 720 },
  { id: 'early', title: 'Early', start: week, timeMinutes: 540 },
];
const days = monthDays('2026-11-01');
const bars = monthBars(monthly, days);
equal(bars.filter((bar) => bar.event.id === 'span').length, 2);
equal(eventsOnDay(monthly, week)[2].id, 'early');
for (const a of bars)
  for (const b of bars)
    if (a !== b && a.week === b.week && a.lane === b.lane)
      ok(a.column + a.days <= b.column || b.column + b.days <= a.column, 'overlapping bars');
const crowded: MonthEvent[] = [];
for (let i = 0; i < 1024; i++) crowded.push({ id: String(i), title: 'Span', start: '2026-11-01', end: '2026-11-30', allDay: true });
const dense = monthBars(crowded, days);
ok(dense.length >= 5120);
equal(dense[1023].lane, 1023);
const tasks: GanttTask[] = [
  { id: 'a', title: 'A', start: 0, end: 5, progress: 0.5 },
  { id: 'b', title: 'B', start: 6, end: 10, dependsOn: 'a' },
  { id: 'm', title: 'M', start: 12, end: 12, milestone: true, dependsOn: 'b' },
];
validateGantt(tasks, 14);
equal(changeGanttTask(tasks[0], 20, 0, 14).start, 9);
equal(changeGanttTask(tasks[0], 20, -1, 14).start, 4);
equal(changeGanttTask(tasks[0], -20, 1, 14).end, 1);
equal(changeGanttTask(tasks[2], 20, 0, 14).start, 13);
rejects(() =>
  validateGantt(
    [
      { id: 'a', title: 'A', start: 0, end: 1, dependsOn: 'b' },
      { id: 'b', title: 'B', start: 1, end: 2, dependsOn: 'a' },
    ],
    14,
  ),
);
rejects(() => validateGantt([{ id: 'x', title: 'X', start: 0, end: 1, dependsOn: 'missing' }], 14));
rejects(() => validateGantt([{ id: 'x', title: 'X', start: 0, end: 1, progress: 2 }], 14));
console.log('planning models: pass');
