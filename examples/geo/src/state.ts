// Geo's state and its actions (zinc:location): the permission, the newest position, the watch and the distance it walked. No drawing here;
// main.tsx subscribes and redraws on each change.
import * as loc from 'zinc:location';

export class GeoState {
  permission: loc.PermissionStatus = loc.permissionStatus();
  position: loc.Position | null = null;
  error: string = '';
  watching: boolean = false;
  walked: number = 0;   // metres since the watch started
  fixes: number = 0;
  private watch: loc.Watch | null = null;
  private listeners: (() => void)[] = [];

  onChange(cb: () => void): void { this.listeners.push(cb); }
  private changed(): void { for (const cb of this.listeners) cb(); }
  private take(r: loc.PositionResult, fromWatch: boolean): void {
    if (r.error !== null) {
      this.error = r.error.message;
      if (r.error.code !== 'timeout') this.stopWatch();
    } else if (r.position !== null) {
      const p = r.position as loc.Position, before = this.position;
      if (fromWatch) {
        if (before !== null && this.fixes > 0) this.walked += loc.distance(before, p);
        this.fixes++;
      }
      this.position = p;
      this.error = '';
    }
    this.permission = loc.permissionStatus();
    this.changed();
  }

  ask(): void {
    loc.requestPermission().then((s: loc.PermissionStatus) => { this.permission = s; this.changed(); });
  }
  locate(): void {
    loc.getCurrentPosition({ timeout: 15000 }).then((r: loc.PositionResult) => this.take(r, false));
  }
  toggleWatch(): void {
    if (this.watching) { this.stopWatch(); this.changed(); return; }
    this.watching = true; this.walked = 0; this.fixes = 0;
    this.watch = loc.watchPosition((r: loc.PositionResult) => this.take(r, true), { distanceFilter: 2 });
    this.changed();
  }
  private stopWatch(): void {
    const w = this.watch;
    if (w !== null) w.stop();
    this.watch = null;
    this.watching = false;
  }
}

export const geo = new GeoState();
