// The to-do list model: plain data and pure functions returning new arrays (class components replace their state
// instead of mutating it, so a re-render sees the change).

export interface Todo {
  id: i32;
  text: string;
  done: boolean;
}

export const INITIAL_TODOS: Todo[] = [
  { id: 1, text: 'Compile Inferno to C++', done: true },
  { id: 2, text: 'Run without a JS engine', done: false },
];

/** The list with one item's `done` flipped. */
export function toggled(todos: Todo[], id: i32): Todo[] {
  return todos.map((t: Todo) => t.id === id ? { id: t.id, text: t.text, done: !t.done } : t);
}

/** The list with `count` new tasks appended, numbered from `firstId`. */
export function withNewTasks(todos: Todo[], firstId: i32, count: i32): Todo[] {
  const next = todos.slice();
  for (let k = 0; k < count; k++) next.push({ id: firstId + k, text: `Task ${firstId + k}`, done: false });
  return next;
}

export function remaining(todos: Todo[]): i32 {
  return todos.filter((t: Todo) => !t.done).length;
}
