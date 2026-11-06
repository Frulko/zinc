// The order of the list. Every listed window has a rank: there is no "never seen" class that falls below all the others, which is how a window just opened or
// unnoticed ends up last. Pure logic, so tests/recency.test.ts can prove each way a window could lose its place.

/** Most recent first. A window keeps its rank until the window server says it is gone. */
export class Recency {
  order: number[] = [];

  touch(id: number): void {
    const at = this.order.indexOf(id);
    if (at === 0) return;
    if (at > 0) this.order.splice(at, 1);
    this.order.unshift(id);
  }

  /**
   * `stacking`: the listed windows, front to back. `existing`: every window the server has, asked just now.
   * A window missing from one sweep keeps its rank (a Space transition, an app that answers late); only a window the server no longer has is forgotten. And `existing`
   * is read at this moment, not with the sweep, so a window focused while the sweep ran is not forgotten for being newer than it.
   * A window with no rank takes its place in the stacking, right behind the window in front of it: one on top whose focus went unseen comes first, not last.
   */
  reconcile(stacking: number[], existing: number[]): void {
    const alive = new Set<number>(existing);
    this.order = this.order.filter((id: number) => alive.has(id));
    let inFront = -1;
    for (const id of stacking) {
      if (this.order.indexOf(id) < 0) {
        const at = inFront < 0 ? 0 : this.order.indexOf(inFront) + 1;
        this.order.splice(at, 0, id);
      }
      inFront = id;
    }
  }

  /** Windows with no rank yet go last. */
  rankOf(id: number): number {
    const at = this.order.indexOf(id);
    return at < 0 ? this.order.length : at;
  }
}

export interface SavedRank { id: number; pid: number }

/** A window id is only unique while its owner lives: after a reboot it can name another window, so an id comes back only with the same process. */
export function restoreOrder(saved: SavedRank[], existing: SavedRank[]): number[] {
  const owners = new Map<number, number>();
  for (const w of existing) owners.set(w.id, w.pid);
  return saved.filter((s: SavedRank) => owners.get(s.id) === s.pid).map((s: SavedRank) => s.id);
}

/**
 * Where the selection starts. The window in use is first, so one press goes to the previous window. When the app in front has no window on the list (Riffle's
 * settings, a filtered window), the first row already is the previous window.
 */
export function firstSelection(firstPid: number, frontPid: number, count: number, reverse: boolean): number {
  if (count === 0) return 0;
  if (reverse) return count - 1;
  return firstPid === frontPid && count > 1 ? 1 : 0;
}

/** The list during a hold: what is shown stays where it is, whatever the ranks do. Gone windows leave, new ones join at the end. */
export function keepingOrder(shown: number[], current: number[]): number[] {
  const present = new Set<number>(current);
  const kept = shown.filter((id: number) => present.has(id));
  const placed = new Set<number>(kept);
  return kept.concat(current.filter((id: number) => !placed.has(id)));
}

/** The first row after the wheel turned by `steps` rows (+ goes down the list). */
export function scrolledStart(start: number, steps: number, count: number, rows: number): number {
  return Math.max(0, Math.min(start + steps, Math.max(0, count - rows)));
}
/** The highlight stays among the rows shown: a release goes to what is highlighted, and that must be on screen. */
export function selectionInView(selected: number, start: number, rows: number): number {
  return Math.max(start, Math.min(selected, start + rows - 1));
}
/** Just after going to a window, the focus reports of what was happening before it come in, and the app may report its previous window first. Only the window gone to counts. */
export function focusIsStale(id: number, raisedId: number, sinceRaiseMs: number, settleMs: number): boolean {
  return sinceRaiseMs < settleMs && id !== raisedId;
}

/** The rows shown when the list is longer than the panel: the selection stays visible, and moves as little of the list as it can. */
export function visibleStart(selected: number, count: number, rows: number, previousStart: number): number {
  if (count <= rows) return 0;
  let start = previousStart;
  if (selected < start) start = selected;
  else if (selected >= start + rows) start = selected - rows + 1;
  return Math.min(start, count - rows);
}
