// The stop state machine (src/services/turn.ts): Escape sends SIGINT, then SIGTERM and SIGKILL after a grace each;
// the exit frees the chat for the next message; an older process's timers and exit never touch a newer turn.
import * as assert from 'zinc:assert';
import { TurnMachine, IDLE, RUNNING, STOPPING, SIGINT, SIGTERM, SIGKILL, GRACE_MS } from '../src/services/turn';

const timers: (() => void)[] = [];
const states: i32[] = [];
const m = new TurnMachine((ms: number, f: () => void) => { assert.equal(ms, GRACE_MS); timers.push(f); }, (s: i32) => states.push(s));
let sent: i32[] = [];
const kill = (s: i32): void => { sent.push(s); };

// a stop escalates while the process stays
assert.ok(m.start(kill), 'starts when idle');
assert.equal(m.state, RUNNING);
assert.ok(!m.start(kill), 'a second turn waits for the first');
assert.ok(m.stop(), 'stops a running turn');
assert.equal(m.state, STOPPING);
assert.deepEqual(sent, [SIGINT]);
assert.ok(!m.start(kill), 'no new turn while the old one stops');
timers.shift()!();
assert.deepEqual(sent, [SIGINT, SIGTERM]);
timers.shift()!();
assert.deepEqual(sent, [SIGINT, SIGTERM, SIGKILL]);
m.exited(m.gen);
assert.equal(m.state, IDLE);

// the next message works; a process that exits within the grace gets nothing more
sent = [];
assert.ok(m.start(kill), 'the next turn starts after the exit');
const g2 = m.gen;
m.stop();
m.exited(g2);
assert.equal(m.state, IDLE);
timers.shift()!();
assert.deepEqual(sent, [SIGINT], 'no SIGTERM once it exited');
assert.equal(timers.length, 0);

// a second stop does not wait
sent = [];
m.start(kill);
m.stop();
assert.ok(m.stop(), 'stop again while stopping');
assert.deepEqual(sent, [SIGINT, SIGKILL]);
m.exited(m.gen);
timers.length = 0;

// the CLI's end of turn frees the chat at once; the late exit of that process does not end the next turn
m.start(kill);
const g4 = m.gen;
m.finish();
assert.equal(m.state, IDLE);
assert.ok(m.start(kill), 'starts while the previous process exits');
m.exited(g4);
assert.equal(m.state, RUNNING, 'an older exit is ignored');
assert.ok(!m.stop() === false);
m.exited(m.gen);
assert.equal(m.state, IDLE);
assert.ok(!m.stop(), 'nothing to stop when idle');
assert.equal(states[0], RUNNING);
console.log('turn: ok');
