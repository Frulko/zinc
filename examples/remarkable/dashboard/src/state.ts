// Dashboard state: the wall clock, a 25-minute focus timer, today's tasks and a week of habits. Everything is saved (zinc:storage) as it
// changes, so the app comes back as it was after Accueil, Quitter or a restart; the timer keeps the time it ends, so it runs on while the
// app is closed.
import { createSignal } from 'zinc:ui/solid';
import * as storage from 'zinc:storage';

export const TASKS: string[] = ['Review the Q3 plan', 'Call the plumber', 'Sketch the new logo', 'Read chapter 4', 'Water the plants'];
export const HABITS: string[] = ['Run', 'Read', 'Write'];
export const DAYS: string[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FOCUS_SECONDS: i32 = 25 * 60;

/** "01001" <-> [false, true, false, false, true]; a saved list of another length is ignored. */
function loadFlags(name: string, fallback: boolean[]): boolean[] {
  const s = storage.get('dashboard.' + name);
  if (s.length !== fallback.length) return fallback;
  const list: boolean[] = [];
  for (let i = 0; i < s.length; i++) list.push(s.charAt(i) === '1');
  return list;
}
function saveFlags(name: string, list: boolean[]): void {
  let s = '';
  for (const b of list) s += b ? '1' : '0';
  storage.set('dashboard.' + name, s);
}
/** Whole seconds until `end` (ms since the epoch), never below 0. */
function secondsUntil(end: number): i32 {
  const left = Math.ceil((end - Date.now()) / 1000);
  return left > 0 ? Math.floor(left) : 0;
}

let timerEnd: number = Number(storage.get('dashboard.timerEnd'));   // 0: paused or stopped
const savedLeft = storage.get('dashboard.timerLeft');

export const [now, setNow] = createSignal<number>(Date.now());
export const [secondsLeft, setSecondsLeft] = createSignal<i32>(timerEnd > 0 ? secondsUntil(timerEnd) : savedLeft !== '' ? Math.floor(Number(savedLeft)) : FOCUS_SECONDS);
export const [timerRunning, setTimerRunning] = createSignal<boolean>(timerEnd > 0);
export const [tasksDone, setTasksDone] = createSignal<boolean[]>(loadFlags('tasks', [false, true, false, false, false]));
/** Habit h on day d is at index h * 7 + d. */
export const [habitDays, setHabitDays] = createSignal<boolean[]>(loadFlags('habits', [
  true, false, true, true, false, false, false,
  true, true, true, false, true, false, false,
  false, true, false, false, true, false, false,
]));

/** A copy of `list` with item i flipped (signals compare by identity, so never mutate in place). */
function flipped(list: boolean[], i: i32): boolean[] {
  const copy = list.slice();
  copy[i] = !copy[i];
  return copy;
}
export function toggleTask(i: i32): void { setTasksDone(flipped(tasksDone(), i)); saveFlags('tasks', tasksDone()); }
export function toggleHabit(habit: i32, day: i32): void { setHabitDays(flipped(habitDays(), habit * 7 + day)); saveFlags('habits', habitDays()); }

function saveTimer(): void {
  storage.set('dashboard.timerEnd', timerEnd > 0 ? `${timerEnd}` : '');
  storage.set('dashboard.timerLeft', `${secondsLeft()}`);
}
/** Start (from 25:00 again once it reached 0) or pause. */
export function toggleTimer(): void {
  if (timerRunning()) {
    setSecondsLeft(secondsUntil(timerEnd));
    timerEnd = 0;
    setTimerRunning(false);
  } else {
    if (secondsLeft() === 0) setSecondsLeft(FOCUS_SECONDS);
    timerEnd = Date.now() + secondsLeft() * 1000;
    setTimerRunning(true);
  }
  saveTimer();
}

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
  if (!timerRunning()) return;
  setSecondsLeft(secondsUntil(timerEnd));
  if (secondsLeft() === 0) { timerEnd = 0; setTimerRunning(false); saveTimer(); }
}
