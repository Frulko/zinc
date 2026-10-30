// What the panels of Zinc Inspector share: the connection to the program attached, the status line, the view shown, and small helpers.
import { createSignal } from 'zinc:ui/solid';
import { Cdp } from './model';

/** The connection to the attached program (null while none is). */
export class Conn { c: Cdp | null = null; }
export const conn = new Conn();

export const [status, setStatus] = createSignal<string>('');
export const [view, setView] = createSignal<string>('info');   // info | elements | screen | network | storage | sources | performance
/** The program attached was started by zinc dev: styles and storage can be changed (Zinc.getInfo). */
export const [devRun, setDevRun] = createSignal<boolean>(false);

/** A method of the attached program, its parameters as JSON text; the result (or the error object), {} when none is attached. */
export async function call(method: string, params: string): Promise<any> {
  if (conn.c === null) return JSON.parse('{}');
  return await (conn.c as Cdp).call(method, params);
}
/** The message of an error result ('' when the call succeeded). */
export function errorOf(r: any): string { return r.message !== undefined && r.code !== undefined ? '' + r.message : ''; }

export function sleep(ms: number): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }
/** Polls every 20 ms, 5 s at most. */
export async function until(f: () => boolean): Promise<boolean> {
  for (let k = 0; k < 250; k++) { if (f()) return true; await sleep(20); }
  return false;
}
// The panes' sizes, set by their splitters and kept for the session: the program list, the right column, the console.
export const [sideW, setSideW] = createSignal<number>(240);
export const [rightW, setRightW] = createSignal<number>(320);
export const [consoleH, setConsoleH] = createSignal<number>(160);
