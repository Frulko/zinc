// zinc:signals — typed signals between objects (Qt's signals / slots, without a meta-object system).
// (zinc:events' Emitter is the other tool: emit() from native threads, listeners as microtasks.)
//
//   class Door { readonly opened = new Signal<string>(); open(who: string): void { this.opened.emit(who); } }
//   const door = new Door();
//   const c = door.opened.connect((who: string) => console.log(`${who} came in`));   // a slot: any function
//   door.open('Ada');                  // direct call, in connection order (Qt::DirectConnection)
//   door.opened.emitQueued('Bob');     // delivered on the next microtask (Qt::QueuedConnection)
//   c.disconnect();                    // or `using c = door.opened.connect(...)`: disconnected at the end of the scope
//
// Rules, kept simple and predictable:
//   - slots run in the order they were connected; one that disconnects (itself or another) during an emit is not
//     called afterwards, and one connected during an emit waits for the next emit;
//   - an exception in a slot stops the emit and propagates to the emitter, like any call;
//   - no cross-thread delivery: Zinc runs logic on one thread; emitQueued defers to the event loop instead.
// For UI state prefer zinc:ui/solid signals (createSignal: automatic dependency tracking); Signal is for events
// between objects and services (a sensor reading, a message received, a job finished). fromSignal() in zinc:ui/solid
// turns a Signal into a reactive accessor.

/** A connection returned by `connect`: `disconnect()` it, or bind it with `using` to disconnect at scope end. */
export class Connection {
  private owner: SignalBase | null;
  readonly id: i32;
  constructor(owner: SignalBase, id: i32) { this.owner = owner; this.id = id; }
  get connected(): boolean { return this.owner !== null; }
  disconnect(): void {
    const o = this.owner;
    if (o === null) return;
    this.owner = null;
    o.drop(this.id);
  }
  [Symbol.dispose](): void { this.disconnect(); }
}

/** Slot bookkeeping shared by Signal<T> and Trigger. */
export class SignalBase {
  protected ids: i32[] = [];
  protected onceFlags: boolean[] = [];
  private nextId: i32 = 1;
  protected add(once: boolean): i32 { const id = this.nextId++; this.ids.push(id); this.onceFlags.push(once); return id; }
  /** Removes slot `id` (Connection.disconnect). */
  drop(id: i32): void { const i = this.ids.indexOf(id); if (i >= 0) this.remove(i); }
  protected remove(i: i32): void { this.ids.splice(i, 1); this.onceFlags.splice(i, 1); this.removeSlot(i); }
  protected removeSlot(i: i32): void {}
  /** Number of connected slots. */
  get count(): i32 { return this.ids.length; }
}

/** A signal carrying a value of type T. */
export class Signal<T> extends SignalBase {
  private slots: ((v: T) => void)[] = [];
  /** Connects a slot; it runs on every emit until disconnected. */
  connect(slot: (v: T) => void): Connection { const id = this.add(false); this.slots.push(slot); return new Connection(this, id); }
  /** Connects a slot for the next emit only. */
  once(slot: (v: T) => void): Connection { const id = this.add(true); this.slots.push(slot); return new Connection(this, id); }
  protected removeSlot(i: i32): void { this.slots.splice(i, 1); }
  /** Calls the connected slots now, in connection order. */
  emit(v: T): void {
    const ids = this.ids.slice();   // slots connected during the emit wait for the next one
    for (const id of ids) {
      const i = this.ids.indexOf(id);
      if (i < 0) continue;          // disconnected by an earlier slot
      const slot = this.slots[i];
      if (this.onceFlags[i]) this.remove(i);
      slot(v);
    }
  }
  /** Delivers the value after the current work, on the next microtask (the slots connected at that time run). */
  emitQueued(v: T): void { queueMicrotask(() => this.emit(v)); }
  /** Disconnects every slot. */
  clear(): void { this.ids = []; this.onceFlags = []; this.slots = []; }
  /** A promise of the next emitted value. */
  next(): Promise<T> { return new Promise<T>(resolve => { this.once((v: T) => resolve(v)); }); }
}

/** A signal without a value (a click, a tick, "finished"). */
export class Trigger extends SignalBase {
  private slots: (() => void)[] = [];
  connect(slot: () => void): Connection { const id = this.add(false); this.slots.push(slot); return new Connection(this, id); }
  once(slot: () => void): Connection { const id = this.add(true); this.slots.push(slot); return new Connection(this, id); }
  protected removeSlot(i: i32): void { this.slots.splice(i, 1); }
  emit(): void {
    const ids = this.ids.slice();
    for (const id of ids) {
      const i = this.ids.indexOf(id);
      if (i < 0) continue;
      const slot = this.slots[i];
      if (this.onceFlags[i]) this.remove(i);
      slot();
    }
  }
  emitQueued(): void { queueMicrotask(() => this.emit()); }
  clear(): void { this.ids = []; this.onceFlags = []; this.slots = []; }
  next(): Promise<void> { return new Promise<void>(resolve => { this.once(() => resolve()); }); }
}
