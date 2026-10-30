// zinc:worker's typed wire (tests/t0/worker_wire.sh): every type a message carries crosses both ways and comes back equal; a receiver with
// its own subset type; a number as the whole message.
import { Worker, MessageEvent } from 'zinc:worker';
import { All, Back, Inner } from './types';

function show(a: All): string {
  const inner = (x: Inner): string => x.name + '/' + x.score;
  const grid = a.grid.map((r: i32[]): string => '[' + r.join(',') + ']').join('');
  return 'n=' + a.n + ' i=' + a.i + ' u=' + a.u + ' b=' + a.b + ' s=' + a.s + ' bytes=' + a.bytes.join(',') + ' nums=' + a.nums.join(',') +
    ' grid=' + grid + ' names=' + a.names.join('|') + ' maybeN=' + (a.maybeN === null ? 'null' : '' + a.maybeN) +
    ' maybeS=' + (a.maybeS === null ? 'null' : a.maybeS) + ' maybeI=' + (a.maybeI === null ? 'null' : inner(a.maybeI)) +
    ' maybeB=' + (a.maybeB === null ? 'null' : '' + a.maybeB) + ' inner=' + inner(a.inner) + ' inners=' + a.inners.map(inner).join(',') +
    ' opt=' + (a.opt === null || a.opt === undefined ? 'none' : '' + a.opt) + ' optS=' + (a.optS === null || a.optS === undefined ? 'none' : a.optS);
}

const full: All = {
  n: -1.5, i: -2147483648, u: 4294967295, b: true, s: 'héllo ✓', bytes: [0, 7, 255], nums: [0.25, -3, 1e300], grid: [[1, 2], [], [-3]],
  names: ['a', '', 'ü'], maybeN: 42.5, maybeS: 'yes', maybeI: { name: 'm', score: 9 }, maybeB: false,
  inner: { name: 'in', score: 1 }, inners: [{ name: 'x', score: 2 }, { name: 'y', score: -4.5 }], opt: 3, optS: 'o',
};
const empty: All = {
  n: 0, i: 0, u: 0, b: false, s: '', bytes: [], nums: [], grid: [], names: [], maybeN: null, maybeS: null, maybeI: null, maybeB: null,
  inner: { name: '', score: 0 }, inners: [],
};

const echo = new Worker<All, Back>(new URL('./echo.ts', import.meta.url));
const sub = new Worker<All, string>(new URL('./sub.ts', import.meta.url));
const num = new Worker<number, number>(new URL('./num.ts', import.meta.url));
let left = 4;
const done = (): void => { left--; if (left === 0) { echo.terminate(); sub.terminate(); num.terminate(); } };
echo.onmessage = (e: MessageEvent<Back>) => {
  const want = show(e.data.seen === 1 ? full : empty);
  const got = show(e.data.echo);
  console.log('echo ' + e.data.seen + (got === want ? ' same' : ' DIFFERS\n  sent ' + want + '\n  got  ' + got));
  if (e.data.seen === 1) console.log('  ' + got);
  done();
};
sub.onmessage = (e: MessageEvent<string>) => { console.log(e.data); done(); };
num.onmessage = (e: MessageEvent<number>) => { console.log('num ' + e.data); done(); };
echo.postMessage(full);
echo.postMessage(empty);
sub.postMessage(full);
num.postMessage(21.25);
