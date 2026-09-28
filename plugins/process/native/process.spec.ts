// zinc:process native side. Children are started with posix_spawnp and three non-blocking pipes; a zrt::Poller reads
// them on the event loop (no thread) and reaps exits. Lists travel as strings joined with \u001f.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Starts `cmd` (PATH lookup) with \u001f-joined args and KEY=VALUE env overrides; cwd '' = inherited.
   *  Returns a handle, -1 on failure (see error()). */
  spawn(cmd: string, args: string, cwd: string, env: string): i32;
  /** Why the last spawn failed. */
  error(): string;
  pid(h: i32): i32;
  /** Writes to the child's stdin (blocks until written); false when stdin is closed. */
  write(h: i32, data: string): boolean;
  closeStdin(h: i32): void;
  /** Sends a signal (15 = SIGTERM, 9 = SIGKILL). */
  kill(h: i32, signal: i32): void;
  /** kind 0: stdout chunk, 1: stderr chunk, 2: exit (data = exit code, 128 + signal when killed); the handle is
   *  free after its exit event. */
  onEvent(cb: (h: i32, kind: i32, data: string) => void): void;
}
export default requireNative<Spec>('Process');
