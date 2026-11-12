import { advertise, stop, Link } from './ble';
import { step, timerCount, adCycle } from './ble-fake';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
const RS = '\u001e', FS = '\u001f';
let opened: i32 = 0, closed: i32 = 0;
function start(): void { advertise('Zinc', (l: Link): void => { opened++; }, (l: Link, text: string): void => {}, (l: Link): void => { closed++; }); }
start(); const first = adCycle();check(timerCount() === 1, 'start timer');
let rejected = false;
try { start(); } catch (e) { rejected = true; }
check(rejected && adCycle() === first, 'second advertisement replaced accepted cycle');
step('advertisement' + FS + first.toString() + FS + 'ready' + RS);
step('open' + FS + '11' + FS + 'peer' + FS + 'Peer' + RS);
check(opened === 1, 'open peer');
stop();check(closed === 1 && timerCount() === 0, 'stop');
start(); const second = adCycle();check(second !== first, 'identity recycled');
step('advertisement' + FS + first.toString() + FS + 'failed' + FS + '6f6c64' + RS);
check(timerCount() === 1, 'old failure stopped new advertisement');
step('advertisement' + FS + second.toString() + FS + 'failed' + FS + '6661696c6564' + RS);
check(timerCount() === 0, 'registration failure left timer alive');
start();check(timerCount() === 1, 'restart after failure');stop();
check(timerCount() === 0, 'restart cleanup');
console.log('BLE peripheral lifecycle ok');
