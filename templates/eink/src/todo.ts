// The to-do list, without UI: what tests/todo.test.ts checks. Items are saved as lines "1 text" (ticked) or "0 text".
export class Todo {
  text: string; done: boolean;
  constructor(text: string, done: boolean) { this.text = text; this.done = done; }
}

export class TodoList {
  items: Todo[] = [];
  add(text: string): boolean { const t = text.trim(); if (t === '') return false; this.items.push(new Todo(t, false)); return true; }
  toggle(i: i32): void { if (i >= 0 && i < this.items.length) this.items[i].done = !this.items[i].done; }
  left(): i32 { let n = 0; for (const t of this.items) if (!t.done) n++; return n; }
  /** Removes the ticked items; how many went. */
  clearDone(): i32 { const before = this.items.length; this.items = this.items.filter((t: Todo): boolean => !t.done); return before - this.items.length; }
  encode(): string { return this.items.map((t: Todo): string => `${t.done ? 1 : 0} ${t.text.replace('\n', ' ')}`).join('\n'); }
  static decode(text: string): TodoList {
    const l = new TodoList();
    for (const line of text.split('\n')) if (line.length > 2 && (line.startsWith('0 ') || line.startsWith('1 '))) l.items.push(new Todo(line.slice(2), line.startsWith('1')));
    return l;
  }
}
