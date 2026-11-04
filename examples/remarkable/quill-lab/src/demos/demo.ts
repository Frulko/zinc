// What a demo of the lab is. The shell (main.tsx) owns the toolbar and the canvas; a demo only says what the canvas shows.
// `draw` paints the whole canvas every time: the driver compares frames, so only the pixels that changed reach the panel.

export interface Demo {
  title: string;
  /** One sentence shown under the selector: what to watch or try. */
  about: string;
  /** Called when the demo opens and on Recommencer: back to its first state. */
  start: () => void;
  /** Called every frame; true when the canvas must be drawn again. */
  tick: (dt: number) => boolean;
  draw: (x: i32, y: i32, w: i32, h: i32) => void;
}

/** Runs one action every `seconds` until `count` actions ran. */
export class Steps {
  done: i32 = 0;
  wait: number = 0;
  seconds: number;
  count: i32;
  constructor(seconds: number, count: i32) { this.seconds = seconds; this.count = count; }
  reset(): void { this.done = 0; this.wait = 0; }
  /** True when a new step is due: `done` then counts the steps shown. */
  due(dt: number): boolean {
    if (this.done >= this.count) return false;
    this.wait += dt;
    if (this.wait < this.seconds) return false;   // the first step waits too: the opening full refresh goes alone
    this.wait = 0;
    this.done++;
    return true;
  }
}
