// What is kept between runs (zinc:storage: a file on the tablet and on desktops; ZINC_STORAGE names another one).
import * as storage from 'zinc:storage';
import { TodoList } from './todo';

const TODO = '{{id}}.todo', SKETCH = '{{id}}.sketch';
const FIRST = '0 Tick me with the pen\n0 Sketch something on the other page\n1 Install the app';

export function loadTodo(): TodoList { const t = storage.get(TODO); return TodoList.decode(t === '' ? FIRST : t); }
export function saveTodo(l: TodoList): void { storage.set(TODO, l.encode()); }
export function loadSketch(): string { return storage.get(SKETCH); }
export function saveSketch(json: string): void { storage.set(SKETCH, json); }
