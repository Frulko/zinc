// What the editor's bottom bar shows: this device, and what it is busy with.
import { fleetState } from './fleet';
import * as mapping from 'zinc:mapping';
import * as os from 'zinc:os';
import { mediaBytes, mediaCount } from './mediaStore';

export interface Task { kind: string; name: string; done: number; total: number }   // total 0: its length is not known

const tasks: Task[] = [];
let frameRate = 0;

export function setFrameRate(fps: number): void { frameRate = fps; }

export function beginTask(kind: string, name: string, total: number): Task {
  const task: Task = { kind, name, done: 0, total: isNaN(total) ? 0 : total };
  tasks.push(task);
  return task;
}

export function endTask(task: Task): void {
  const at = tasks.indexOf(task);
  if (at >= 0) tasks.splice(at, 1);
}

export function deviceJson(name: string, address: string): string {
  return JSON.stringify({
    name, address,
    system: `${os.type()} ${os.release()}, ${os.arch()}`,
    fps: Math.round(frameRate),
    freeMemory: os.freemem(), totalMemory: os.totalmem(),
    load: os.loadavg()[0],
    uptime: os.uptime(),
    layers: mapping.layerCount(),
    mediaFiles: mediaCount(), mediaBytes: mediaBytes(),
    tasks,
    fleet: fleetState(),
  });
}
