// A pocket Chataigne for when the real one is not running: it hears what the app sends and answers through the
// same route() as the network, after a short delay:
//   - meters follow the faders with a little movement (20 messages per second per channel);
//   - GO / STOP answer with the cue name, toggles are echoed back as feedback;
//   - chat answers everything; "go", "stop", "blackout" and "full" act on the show, as the chat keywords of the
//     Zinc module script (chataigne-module/zinc.js) do in the real Chataigne.
import { channels } from './state';
import { route } from './incoming';

const CUES: string[] = ['Preset', 'Doors open', 'Walk-in', 'Sunrise', 'Speech', 'Blackout'];
const METER_PERIOD: number = 0.05;   // s between meter updates

/** A message the simulator will "send" at `at` (simulator time, s). */
class Reply {
  constructor(public at: number, public address: string, public numbers: number[], public strings: string[]) {}
}

let active = false, clock: number = 0, nextMeter: number = 0, cue: i32 = 0;
let pending: Reply[] = [];

function later(delay: number, address: string, numbers: number[], strings: string[]): void {
  pending.push(new Reply(clock + delay, address, numbers, strings));
}
function cueLabel(): string { return `Cue ${cue + 1} · ${CUES[cue]}`; }
function goNext(): void {
  cue = (cue + 1) % CUES.length;
  later(0.15, '/zinc/cue/name', [], [cueLabel()]);
  later(0.15, '/zinc/cue/running', [1], []);
}
function stopCue(): void {
  later(0.1, '/zinc/cue/name', [], [`${cueLabel()} (stopped)`]);
  later(0.1, '/zinc/cue/running', [0], []);
}
function allFaders(v: number): void {
  for (const c of channels) later(0.2, `/zinc/fader/${c.index}`, [v], []);
}

/** Chataigne's side of the conversation: a few whole words act on the show, anything else is acknowledged. */
function answer(text: string): string {
  const words = text.toLowerCase().split(' ');
  if (words.includes('blackout')) { allFaders(0); return 'Blackout: all faders to 0.'; }
  if (words.includes('full')) { allFaders(1); return 'Full: all faders to 100 %.'; }
  if (words.includes('stop')) { stopCue(); return 'Stopping the cue.'; }
  if (words.includes('go')) { goNext(); return `Going: ${CUES[cue]}.`; }
  if (words.includes('hello') || words.includes('hi')) return 'Hello from Chataigne! Faders, GO and chat are wired.';
  return `Got "${text}". Try "go", "stop", "blackout" or "full".`;
}

export function startSimulator(): void {
  active = true; pending = []; cue = 0;
  later(0.3, '/zinc/cue/name', [], [cueLabel()]);
  later(0.6, '/zinc/chat', [], ['Simulator on: I answer like Chataigne with the Zinc module. Say hi, or type "go".']);
}
export function stopSimulator(): void { active = false; pending = []; }

/** Called by link.send() instead of the network while the simulator is on. */
export function hear(address: string, numbers: number[], strings: string[]): void {
  if (!active) return;
  if (address === '/zinc/cue/go') goNext();
  else if (address === '/zinc/cue/stop') stopCue();
  else if (address.startsWith('/zinc/toggle/')) later(0.05, address, numbers, []);
  else if (address === '/zinc/chat' && strings.length > 0) later(0.8, '/zinc/chat', [], [answer(strings[0])]);
}

/** Advances the simulator by dt seconds: due replies, then meters. */
export function tickSimulator(dt: number): void {
  if (!active) return;
  clock += dt;
  const due = pending.filter((r: Reply) => r.at <= clock);
  if (due.length > 0) pending = pending.filter((r: Reply) => r.at > clock);
  for (const r of due) route(r.address, r.numbers, r.strings);
  if (clock < nextMeter) return;
  nextMeter = clock + METER_PERIOD;
  for (const c of channels) {
    const wobble = 0.8 + 0.2 * Math.abs(Math.sin(clock * (2.1 + c.index * 0.7) + c.index));
    route(`/zinc/meter/${c.index}`, [c.fader() * wobble], []);
  }
}
