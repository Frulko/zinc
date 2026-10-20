// The life of one turn's process, apart from what it prints: start, the CLI's end-of-turn line, a stop asked by the
// user (Escape or the Stop button), the exit. A stop sends SIGINT, which every CLI takes as "interrupt and save the
// session", then SIGTERM and SIGKILL if the process is still there after a grace period each; a second stop does not
// wait. Timers and signals are given from outside, so tests drive it without a process (tests/turn.test.ts).

export const IDLE = 0;       // no process of this chat runs (or one that ended its answer is exiting)
export const RUNNING = 1;    // the CLI is answering
export const STOPPING = 2;   // a stop was asked: waiting for the exit

export const SIGINT = 2, SIGKILL = 9, SIGTERM = 15;
/** How long each signal of a stop has before the next, harder one. */
export const GRACE_MS = 1500;

export class TurnMachine {
  state: i32 = IDLE;
  /** Bumped by every start: a timer or an exit of an older process finds a newer number and does nothing. */
  gen: i32 = 0;
  private kill: (signal: i32) => void = (signal: i32) => { };
  private readonly later: (ms: number, f: () => void) => void;
  private readonly changed: (state: i32) => void;

  /** `later(ms, f)` runs f after ms; `changed(state)` hears every transition. */
  constructor(later: (ms: number, f: () => void) => void, changed: (state: i32) => void) {
    this.later = later; this.changed = changed;
  }

  /** A turn starts with `kill(signal)` for its process. False while another one runs or stops. */
  start(kill: (signal: i32) => void): boolean {
    if (this.state !== IDLE) return false;
    this.gen++;
    this.kill = kill;
    this.set(RUNNING);
    return true;
  }

  /** The CLI printed its end of turn: the next message may start while this process exits. */
  finish(): void { if (this.state === RUNNING) this.set(IDLE); }

  /** Stops the running turn: SIGINT now, SIGTERM then SIGKILL each after GRACE_MS. While stopping: SIGKILL at once. */
  stop(): boolean {
    if (this.state === STOPPING) { this.kill(SIGKILL); return true; }
    if (this.state !== RUNNING) return false;
    const g = this.gen;
    this.set(STOPPING);
    this.kill(SIGINT);
    this.later(GRACE_MS, () => {
      if (this.state !== STOPPING || this.gen !== g) return;
      this.kill(SIGTERM);
      this.later(GRACE_MS, () => { if (this.state === STOPPING && this.gen === g) this.kill(SIGKILL); });
    });
    return true;
  }

  /** The process of turn `gen` exited. */
  exited(gen: i32): void { if (gen === this.gen && this.state !== IDLE) this.set(IDLE); }

  private set(s: i32): void { this.state = s; this.changed(s); }
}
