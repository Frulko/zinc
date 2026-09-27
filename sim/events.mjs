// zinc:events for sim: listeners run as microtasks, like runtime/mod/events.h
export class Emitter {
  constructor() { this.ls = []; }
  on(cb) { this.ls.push(cb); }
  emit(v) { for (const f of this.ls) queueMicrotask(() => f(v)); }
}
