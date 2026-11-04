// Points on a canvas: a click selects (shift adds), a drag moves the selection, arrows step it. No drawing and no platform here.
export interface EditablePoint { x: number; y: number; set: (x: number, y: number) => void }

export class PointEditor {
  selection: i32[] = [];

  isSelected(index: i32): boolean { return this.selection.indexOf(index) >= 0; }

  clear(): void { this.selection = []; }

  /** Replaces the selection, or with `add` toggles the point in it. */
  pick(index: i32, add: boolean): void {
    if (!add) {
      if (!this.isSelected(index)) this.selection = [index];
      return;
    }
    const at = this.selection.indexOf(index);
    if (at >= 0) this.selection.splice(at, 1);
    else this.selection.push(index);
  }

  move(points: EditablePoint[], dx: number, dy: number): void {
    for (const index of this.selection) {
      if (index < points.length) points[index].set(points[index].x + dx, points[index].y + dy);
    }
  }

  /** The next point (or the previous one), alone in the selection. */
  step(count: i32, backwards: boolean): void {
    if (count === 0) return;
    const current: i32 = this.selection.length > 0 ? this.selection[0] : -1;
    this.selection = [(current + (backwards ? count - 1 : 1)) % count];
  }
}

/** The point under (x, y), -1 when none. Distances in pixels of a canvas of (w, h). */
export function hitPoint(points: EditablePoint[], x: number, y: number, w: number, h: number, radius: number): i32 {
  for (let i: i32 = 0; i < points.length; i++) {
    if (Math.hypot((points[i].x - x) * w, (points[i].y - y) * h) < radius) return i;
  }
  return -1;
}
