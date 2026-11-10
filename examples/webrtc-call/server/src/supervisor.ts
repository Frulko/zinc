import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';
import * as instance from 'zinc:system/instance';
import { Config, command, origin, zinc } from './config';

enum State { Idle, Starting, Running, Backoff, Stopping, Stopped }

export class Supervisor {
  state: State = State.Idle;
  child: proc.Process | null = null;
  retryTimer: i32 = 0;
  killTimer: i32 = 0;
  readonly stopped: Promise<void>;
  resolveStopped: () => void = () => {};

  constructor() {
    this.stopped = new Promise<void>(resolve => { this.resolveStopped = resolve; });
  }

  transition(next: State): void {
    const from = this.state;
    const legal = (from === State.Idle && (next === State.Starting || next === State.Stopping)) ||
      (from === State.Starting && (next === State.Running || next === State.Stopping)) ||
      (from === State.Running && (next === State.Backoff || next === State.Stopping)) ||
      (from === State.Backoff && (next === State.Starting || next === State.Stopping)) ||
      (from === State.Stopping && next === State.Stopped);
    if (!legal) throw new Error('Illegal call-server lifecycle transition');
    this.state = next;
    if (next === State.Stopped) this.resolveStopped();
  }

  start(binary: string, data: string, config: Config): void {
    this.transition(State.Starting);
    const args = ['-http', (config.local ? '127.0.0.1:' : ':') + config.port, '-turn', config.turn,
      '-udp-range', config.udpPort.toString(), '-data', data + '/data', '-groups', data + '/groups', '-static', data + '/static'];
    if (config.local) args.push('-insecure');
    try {
      const child = proc.spawn(binary, args, { cwd: data });
      this.child = child;
      child.closeStdin();
      child.onStdout((line: string) => console.log('galene: ' + line));
      child.onStderr((line: string) => console.error('galene: ' + line));
      child.onExit((code: i32) => {
        this.child = null;
        if (this.state === State.Stopping) {
          clearTimeout(this.killTimer);
          this.transition(State.Stopped);
          return;
        }
        this.transition(State.Backoff);
        console.error('Galène exited (' + code + '); restarting in 2 seconds');
        this.retryTimer = setTimeout(() => { if (this.state === State.Backoff) this.start(binary, data, config); }, 2000);
      });
      this.transition(State.Running);
      console.log('Galène pid ' + child.pid + ': ' + origin(config));
    } catch (error) {
      this.transition(State.Stopping);
      this.transition(State.Stopped);
      throw error;
    }
  }

  stop(): void {
    if (this.state === State.Stopped || this.state === State.Stopping) return;
    this.transition(State.Stopping);
    clearTimeout(this.retryTimer);
    const child = this.child;
    if (child === null) { this.transition(State.Stopped); return; }
    child.kill();
    this.killTimer = setTimeout(() => { if (this.child === child) child.kill(9); }, 3000);
  }
}

export async function supervise(data: string, config: Config): Promise<Supervisor> {
  if (!await instance.lock((cwd: string, argv: string[]) => {})) throw new Error('A call server is already running for this user');
  const binary = await command(zinc(), ['toolchain', 'install', 'galene']);
  const supervisor = new Supervisor();
  sys.onSignal('SIGTERM', () => supervisor.stop());
  sys.onSignal('SIGINT', () => supervisor.stop());
  supervisor.start(binary, data, config);
  return supervisor;
}
