// Dashboard state: the wall clock, a 25-minute focus timer, today's tasks and a week of habits.
import { createSignal } from 'zinc:ui/solid';

export const TASKS: string[] = ['Review the Q3 plan', 'Call the plumber', 'Sketch the new logo', 'Read chapter 4', 'Water the plants'];
export const HABITS: string[] = ['Run', 'Read', 'Write'];
export const DAYS: string[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FOCUS_SECONDS: i32 = 25 * 60;

export const [now, setNow] = createSignal<number>(Date.now());
export const [secondsLeft, setSecondsLeft] = createSignal<i32>(FOCUS_SECONDS);
export const [timerRunning, setTimerRunning] = createSignal<boolean>(false);
export const [tasksDone, setTasksDone] = createSignal<boolean[]>([false, true, false, false, false]);
/** Habit h on day d is at index h * 7 + d. */
export const [habitDays, setHabitDays] = createSignal<boolean[]>([
  true, false, true, true, false, false, false,
  true, true, true, false, true, false, false,
  false, true, false, false, true, false, false,
]);

/** A copy of `list` with item i flipped (signals compare by identity, so never mutate in place). */
function flipped(list: boolean[], i: i32): boolean[] {
  const copy = list.slice();
  copy[i] = !copy[i];
  return copy;
}
export function toggleTask(i: i32): void { setTasksDone(flipped(tasksDone(), i)); }
export function toggleHabit(habit: i32, day: i32): void { setHabitDays(flipped(habitDays(), habit * 7 + day)); }
export function toggleTimer(): void { setTimerRunning(!timerRunning()); }

/** 7 -> "07" */
export function twoDigits(n: number): string {
  return `${Math.floor(n)}`.padStart(2, '0');
}
/** "14:05" (UTC) */
export function clockText(): string {
  const minutes = Math.floor(now() / 60000);
  return `${twoDigits((minutes / 60) % 24)}:${twoDigits(minutes % 60)}`;
}
/** "24:59" */
export function timerText(): string {
  return `${twoDigits(secondsLeft() / 60)}:${twoDigits(secondsLeft() % 60)}`;
}

/** Once a second: update the clock and count the timer down. */
export function everySecond(): void {
  setNow(Date.now());
  if (timerRunning() && secondsLeft() > 0) setSecondsLeft(secondsLeft() - 1);
}
