// zinc:hot — the program side of zinc dev's Fast Refresh (ZN-742, docs/reports/zinc-next-fast-refresh.md).
// Loaded first, and only in hot mode (ZINC_HOT=1, set by zinc dev): no other build has it. `import.meta.hot` in a module is that module's
// record, `hotModule('<its path>')`; outside hot mode every `if (import.meta.hot) { ... }` is removed from the program.
//
//   if (import.meta.hot) {
//     import.meta.hot.accept();                                   // this module can be swapped on its own
//     import.meta.hot.dispose(() => clearInterval(timer));        // undo its top-level effects before its new code runs
//   }
//
// The swap (src/dev) calls beforeUpdate with the modules it re-evaluates, runs their new init functions, then calls afterUpdate.

type Callback = () => void;
type UpdateCallback = (modules: string[]) => void;

/** One module's `import.meta.hot` (Vite's API, the part Zinc needs: no `data`, no `invalidate`). */
export class HotModule {
  readonly path: string;
  accepted: boolean = false;
  acceptors: Callback[] = [];
  disposers: Callback[] = [];
  before: UpdateCallback[] = [];
  after: UpdateCallback[] = [];
  constructor(path: string) { this.path = path; }
  /** The module is a boundary: a change to it re-runs it alone; `cb` runs once its new code ran. */
  accept(cb?: Callback): void {
    this.accepted = true;
    if (cb) this.acceptors.push(cb);
  }
  /** `cb` runs before the module's new code replaces it: stop its timers, remove its listeners. */
  dispose(cb: Callback): void { this.disposers.push(cb); }
  /** 'beforeUpdate' or 'afterUpdate': `cb` gets the paths of the modules each update re-evaluates. */
  on(event: string, cb: UpdateCallback): void {
    if (event === 'beforeUpdate') this.before.push(cb);
    else if (event === 'afterUpdate') this.after.push(cb);
    else throw new Error(`import.meta.hot.on: no event '${event}' (beforeUpdate, afterUpdate)`);
  }
  /** Removes a listener `on` added. */
  off(event: string, cb: UpdateCallback): void {
    const list = event === 'beforeUpdate' ? this.before : this.after;
    const i = list.indexOf(cb);
    if (i >= 0) list.splice(i, 1);
  }
}

const records = new Map<string, HotModule>();

/** The record of the module at `path`, what its `import.meta.hot` is. */
export function hotModule(path: string): HotModule {
  let r = records.get(path);
  if (r === null) {
    r = new HotModule(path);
    records.set(path, r);
  }
  return r;
}

/** Before an update: every 'beforeUpdate' listener, then the dispose hooks of the modules about to be re-evaluated, whose records start over. */
export function beforeUpdate(modules: string[]): void {
  for (const r of records.values()) for (const cb of r.before.slice()) cb(modules);   // a listener may remove others (zinc:ui/solid)
  for (const path of modules) {
    const r = records.get(path);
    if (r === null) continue;
    for (const cb of r.disposers) cb();
    records.delete(path);
  }
}

/** After the new code of `modules` ran: their accept callbacks, then every 'afterUpdate' listener. */
export function afterUpdate(modules: string[]): void {
  for (const path of modules) {
    const r = records.get(path);
    if (r !== null) for (const cb of r.acceptors) cb();
  }
  for (const r of records.values()) for (const cb of r.after.slice()) cb(modules);
}
