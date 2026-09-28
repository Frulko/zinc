// The OSC link to Chataigne, over zinc:osc (UDP): where to send, where to listen, and the actions the panels call.
// Each action updates the local state first, then sends, so the UI never waits for the network. With the
// simulator on, nothing touches a socket: messages go to simulator.ts and its answers come back through route().
import { createSignal, createMemo } from 'zinc:ui/solid';
import * as osc from 'zinc:osc';
import { now, Channel, Toggle, setPadX, setPadY, setColor, addChat } from './state';
import { route, lastRx } from './incoming';
import { hear, startSimulator, stopSimulator } from './simulator';

// Chataigne's OSC module listens on 12000 and sends to 9000 by default: the mirror image of ours.
export const [host, setHost] = createSignal<string>('127.0.0.1');
export const [sendPort, setSendPort] = createSignal<i32>(12000);
export const [listenPort, setListenPort] = createSignal<i32>(9000);
export const [listening, setListening] = createSignal<boolean>(false);   // false: port busy (or simulator)
export const [simulated, setSimulatedSignal] = createSignal<boolean>(false);
export const [sent, setSent] = createSignal<i32>(0);

/** Sends one message to Chataigne (or to the simulator). */
export function send(address: string, numbers: number[], strings: string[]): void {
  setSent(sent() + 1);
  if (simulated()) hear(address, numbers, strings);
  else osc.send(host(), sendPort(), address, numbers, strings);
}

/** (Re)opens the listening socket on listenPort(); closes it in simulator mode. */
function listen(): void {
  osc.close();
  setListening(false);
  if (simulated()) return;
  try {
    osc.listen(listenPort(), (m: osc.OscMessage) => route(m.address, m.numbers, m.strings));
    setListening(true);
  } catch (e) {
    console.warn(`chataigne: cannot listen on UDP ${listenPort()} (port busy?)`);
  }
}

export function setSimulated(on: boolean): void {
  setSimulatedSignal(on);
  if (on) startSimulator(); else stopSimulator();
  listen();
}
export function changeListenPort(port: i32): void {
  if (port === listenPort()) return;
  setListenPort(port);
  listen();
}

/** One word for the status badges. UDP has no connection: "Receiving" means a message in the last 2 s.
 *  A memo: it reads the clock every frame but only notifies when the word changes. */
export const linkStatus = createMemo<string>(() => {
  if (simulated()) return 'Simulator';
  if (!listening()) return 'Port busy';
  return lastRx() >= 0 && now() - lastRx() < 2 ? 'Receiving' : 'Listening';
}, '');

/** Tailwind colour of the status dot. */
export function statusColor(status: string): string {
  if (status === 'Receiving') return 'emerald-500';
  if (status === 'Simulator') return 'indigo-500';
  if (status === 'Listening') return 'amber-400';
  return 'red-500';
}

// ---- actions, called by the panels (and by the demo script)
export function sendFader(c: Channel, v: number): void { c.setFader(v); send(`/zinc/fader/${c.index}`, [v], []); }
export function sendToggle(t: Toggle, on: boolean): void { t.setOn(on); send(`/zinc/toggle/${t.index}`, [on ? 1 : 0], []); }
export function go(): void { send('/zinc/cue/go', [], []); }
export function stop(): void { send('/zinc/cue/stop', [], []); }
export function sendXY(x: number, y: number): void { setPadX(x); setPadY(y); send('/zinc/xy', [x, y], []); }
export function sendColor(c: u32): void {
  setColor(c);
  send('/zinc/color', [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255], []);
}
export function sendChat(text: string): void {
  const t = text.trim();
  if (t.length === 0) return;
  addChat(true, t);
  send('/zinc/chat', [], [t]);
}
