// zinc-test: requires net process
// zinc:osc/full on loopback, two endpoints on ports the system gives: every type sent is received equal, a bundle (with a bundle in it) arrives
// with its time tag, address patterns select handlers, malformed datagrams give nothing.
import { open, Message, Bundle, TimeTag, Arg, timeTag, encode, decode, matches } from 'zinc:osc/full';

function show(a: Arg): string {
  const tt = a.time;
  if (a.type === 's') return 's:' + a.text;
  if (a.type === 'b') return a.bytes.length > 8 ? `b:${a.bytes.length} bytes` : 'b:' + JSON.stringify(a.bytes);
  if (a.type === 't') return tt === null ? 't:none' : `t:${tt.seconds}.${tt.fraction}`;
  return a.type + ':' + a.num;
}
function line(m: Message): string {
  const tt = m.time;
  return m.address + ' ' + m.args.map((a: Arg) => show(a)).join(' ') + (tt === null ? '' : ` @${tt.seconds}.${tt.fraction}${tt.immediate ? ' now' : ''}`);
}
function same(a: Message, b: Message): boolean { return line(a) === line(b) && a.args.length === b.args.length; }

async function main(): Promise<void> {
  const rx = await open(0, '127.0.0.1');
  const tx = await open(0, '127.0.0.1');
  console.log('ports:', rx.port > 0, tx.port > 0, rx.port !== tx.port);

  const got: Message[] = [];
  let wake: (() => void) | null = null;
  rx.onAny((m: Message) => { got.push(m); const w = wake; if (w !== null) w(); });
  const until = (n: i32): Promise<void> => new Promise<void>(resolve => {
    const check = (): void => { if (got.length >= n) { wake = null; resolve(); } };
    wake = check;
    check();
  });
  const patterns: string[] = [];
  rx.on('/all', (m: Message) => { patterns.push('exact ' + m.address); });
  rx.on('/light/*/level', (m: Message) => { patterns.push('handler pattern ' + m.address); });
  rx.on('/fader/3', (m: Message) => { patterns.push('sender pattern ' + m.address + ' -> /fader/3'); });
  rx.on('/never', (m: Message) => { patterns.push('wrong ' + m.address); });

  // every type, with the values at the edges of each
  const blob: u8[] = [];
  for (let i = 0; i < 257; i++) blob.push(i % 256);
  const all = new Message('/all')
    .int(0).int(-1).int(2147483647).int(-2147483648)
    .float(0).float(0.5).float(-2.75).float(3.4028234663852886e38).float(1e-40).float(0.1).float(Infinity)
    .double(1 / 3).double(-1.7976931348623157e308).double(5e-324).double(123456789.125)
    .string('').string('abc').string('abcd').string('héllo ✓')
    .blob([]).blob([1]).blob([1, 2, 3, 4]).blob(blob)
    .timeTag(new TimeTag()).timeTag(new TimeTag(4294967295, 4294967295)).timeTag(timeTag(1760000000500))
    .bool(true).bool(false).nil();
  console.log('sent', tx.send('127.0.0.1', rx.port, all));
  await until(1);
  console.log(line(got[0]));
  console.log('every type equal:', same(all, got[0]), got[0].args.length, 'from', got[0].from, got[0].port === tx.port);
  console.log('the 257-byte blob:', JSON.stringify(got[0].args[22].bytes) === JSON.stringify(blob));
  console.log('time tag of 1760000000500 ms:', timeTag(1760000000500).unixMs);

  // a bundle with a bundle in it: four datagram-mates, each with the tag of its own bundle
  const inner = new Bundle(new TimeTag(3969000000, 2147483648)).add(new Message('/light/7/level').float(0.25));
  const bundle = new Bundle().add(new Message('/fader/[1-4]').int(64)).add(new Message('/cue').string('go')).addBundle(inner);
  tx.sendBundle('127.0.0.1', rx.port, bundle);
  await until(4);
  for (let i = 1; i < 4; i++) console.log(line(got[i]));
  for (const p of patterns) console.log(p);

  // the bytes on the wire, against the example of the OSC 1.0 specification and Python's struct (see the .out)
  console.log('wire:', JSON.stringify(encode(new Message('/oscillator/4/frequency').float(440))));
  console.log('wire:', JSON.stringify(encode(new Message('/n').int(-2).float(-2.75).float(1e-40).float(0.1).double(1 / 3).double(5e-324).blob([7]))));

  // the codec alone: what a careless or hostile sender may put in a datagram
  const good = encode(new Message('/x').int(7).string('s').blob([9, 9, 9]));
  let survived = 0;
  for (let cut = 0; cut < good.length; cut++) survived += decode(good.slice(0, cut)).length;   // only '/x' with its tags left out decodes
  console.log('truncated:', survived, 'whole:', decode(good).length, 'junk:', decode([1, 2, 3, 4, 5]).length, 'empty:', decode([]).length);
  const huge = encode(new Message('/x').blob([1, 2, 3, 4]));
  huge[8] = 255;   // a blob that claims 4 GiB
  console.log('blob longer than the datagram:', decode(huge).length);
  let nest: u8[] = encode(new Message('/deep'));
  for (let i = 0; i < 40; i++) { const b: u8[] = [35, 98, 117, 110, 100, 108, 101, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, (nest.length >> 8) & 255, nest.length & 255]; for (const c of nest) b.push(c); nest = b; }
  console.log('40 bundles deep:', decode(nest).length);

  const cases: string[][] = [
    ['/a/b', '/a/b', 'y'], ['/a/b', '/a/c', 'n'], ['/a/*', '/a/b', 'y'], ['/a/*', '/a/b/c', 'n'], ['/*/c', '/a/c', 'y'], ['/a/b*', '/a/b', 'y'],
    ['/a/?', '/a/b', 'y'], ['/a/?', '/a/bc', 'n'], ['/a/[a-c]x', '/a/bx', 'y'], ['/a/[a-c]x', '/a/dx', 'n'], ['/a/[!a-c]', '/a/d', 'y'], ['/a/[!a-c]', '/a/b', 'n'],
    ['/a/{foo,bar}/z', '/a/bar/z', 'y'], ['/a/{foo,bar}', '/a/baz', 'n'], ['/a/*{1,2}', '/a/ch2', 'y'], ['/a/[bc', '/a/b', 'n'], ['/a', '/a/b', 'n'], ['/a/*b*c', '/a/xbybzc', 'y'],
  ];
  let wrong = 0;
  for (const c of cases) if (matches(c[0], c[1]) !== (c[2] === 'y')) { wrong++; console.log('pattern', c[0], 'on', c[1], 'should be', c[2]); }
  console.log('patterns:', cases.length - wrong, 'of', cases.length);

  rx.close();
  console.log('closed:', tx.send('127.0.0.1', 9, new Message('/gone')), rx.port);
  tx.close();
  console.log('closed:', tx.send('127.0.0.1', 9, new Message('/gone')));
}
main();
