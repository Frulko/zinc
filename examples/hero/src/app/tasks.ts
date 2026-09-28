// The task list shared by the Tasks screen and the Home numbers.
// A task animates in when created (its `life` tween goes 0 → 1) and out before it is removed (1 → 0).
import { createSignal, createMemo } from 'zinc:ui/solid';
import { Tween, Spring, easeOut, easeInOut } from './motion';

export class Task {
  id: i32;
  title: string;
  tag: string;
  done: () => boolean; setDone: (v: boolean) => void;
  life: Tween = new Tween(0);          // row height and opacity: 0 gone, 1 fully in
  check: Spring = new Spring(1, 320, 16);   // the checkbox pops when toggled
  leaving: boolean = false;
  constructor(id: i32, title: string, tag: string, done: boolean) {
    this.id = id; this.title = title; this.tag = tag;
    const [d, sd] = createSignal<boolean>(done); this.done = d; this.setDone = sd;
  }
}

let nextId: i32 = 1;
export const [tasks, setTasks] = createSignal<Task[]>([]);
export const [filter, setFilter] = createSignal<i32>(0);   // 0 all, 1 active, 2 done

export const doneCount = createMemo<i32>(() => tasks().filter((t: Task) => t.done() && !t.leaving).length, 0);
export const totalCount = createMemo<i32>(() => tasks().filter((t: Task) => !t.leaving).length, 0);
export const visibleTasks = createMemo<Task[]>(() => {
  const f = filter();
  return tasks().filter((t: Task) => f === 0 || (f === 1 ? !t.done() : t.done()));
}, []);

export function addTask(title: string, tag: string = 'Personal', done: boolean = false, delay: number = 0): void {
  const t = new Task(nextId++, title, tag, done);
  const list = tasks().slice();
  list.unshift(t);
  setTasks(list);
  t.life.to(1, 0.45, easeOut, null, delay);
}
export function toggleTask(t: Task): void {
  t.setDone(!t.done());
  t.check.snap(0.6);
  t.check.to(1);
}
export function removeTask(t: Task, delay: number = 0): void {
  if (t.leaving) return;
  t.leaving = true;
  t.life.to(0, 0.35, easeInOut, () => setTasks(tasks().filter((x: Task) => x !== t)), delay);
}
export function clearDone(): i32 {
  let n: i32 = 0;
  for (const t of tasks()) if (t.done() && !t.leaving) removeTask(t, 0.06 * n++);
  return n;
}

export function seedTasks(): void {
  for (const t of tasks()) t.life.snap(0);
  setTasks([]);
  const seed: string[] = ['Ship the Zinc hero demo', 'Design', 'Record a 60 fps capture', 'Media', 'Try the Playground on a Pi', 'Hardware',
    'Write the release notes', 'Docs', 'Review the physics step', 'Code', 'Water the plants', 'Personal'];
  for (let i = seed.length - 2; i >= 0; i -= 2) addTask(seed[i], seed[i + 1], i === 2 || i === 8, 0.05 * (seed.length - i) / 2);
}
