import { equal, ok, deepEqual } from 'zinc:assert';
import {
  LogBuffer,
  TerminalBuffer,
  CurveKey,
  evaluateCurve,
  orderedKeys,
  moveCurveKey,
  insertCurveKey,
  nextToolSerial,
  sampleGradient,
  trimClip,
  editTimelineClip,
  connectNodes,
  ToolNode,
  FlameIndex,
  FlameSpan,
  HexSelection,
  NibblePhase,
  LevelState,
  MeterPhase,
  MeterClock,
  MeterClockPhase,
} from '../../../lib/std/kit/tool-model';
const log = new LogBuffer(2, 80);
const first = log.append('one');
log.append('two', 'warning');
log.append('three');
equal(log.records.length, 2);
ok(log.records[0].id > first);
equal(log.filtered('THR', '').length, 1);
equal(log.filtered('', 'warning').length, 1);
equal(log.count('warning'), 1);
equal(log.count('error'), 0);
log.append('x'.repeat(300));
ok(log.records.reduce((sum: number, record) => sum + record.text.length + record.level.length, 0) <= 80);
const serial = log.append('ok');
log.clear();
ok(log.append('again') > serial);
const terminal = new TerminalBuffer(3, 30, 2);
terminal.write('old\rnew\u001b[3');
terminal.write('1m!\u001b[0m\n123\bX\tY');
equal(terminal.lines[0].cells[3].foreground, 'ansi:1');
equal(terminal.text(), 'new!\n12X     Y');
terminal.write('\u001b[38;2;1;');
terminal.write('2;3mR\u001b[48;5;196mB');
equal(terminal.lines[1].cells[9].foreground, '#010203');
equal(terminal.lines[1].cells[10].background, '#ff0000');
terminal.write('\r\u001b[2Kdone\nnext\nlast');
equal(terminal.lines.length, 3);
equal(terminal.text(), 'done\nnext\nlast');
terminal.write('\u001b]8;;https://bad.invalid\u001b\\!\u001b[2J');
equal(terminal.text(), '');
terminal.write('x'.repeat(3000));
ok(terminal.text().length <= 30);
terminal.remember('a');
terminal.remember('b');
terminal.remember('c');
equal(terminal.history.join(','), 'b,c');
const keys: CurveKey[] = [
  { id: 'a', time: 0, value: 0, mode: 'linear' },
  { id: 'b', time: 1, value: 1, mode: 'linear' },
];
equal(evaluateCurve(keys, -2), 0);
equal(evaluateCurve(keys, 2), 1);
equal(evaluateCurve(keys, 0.5), 0.5);
keys[0].mode = 'step';
equal(evaluateCurve(keys, 0.999), 0);
equal(evaluateCurve(keys, 1), 1);
keys[0].mode = 'smooth';
for (let i = 0; i <= 100; i++) ok(evaluateCurve(keys, i / 100) >= 0 && evaluateCurve(keys, i / 100) <= 1);
keys[0].mode = 'free';
keys[0].outTime = 3;
keys[0].outValue = 0;
keys[1].inTime = -1;
keys[1].inValue = 1;
ok(Number.isFinite(evaluateCurve(keys, 0.5)));
equal(nextToolSerial('curve-', 0, ['curve-1', 'curve-2']), 3);
ok(insertCurveKey(keys, 'duplicate', 0, 2, 0, 1) === keys, 'no duplicate key times');
equal(insertCurveKey(keys, 'middle', 0.25, 0.2, 0, 1).length, 3);
const handles: CurveKey[] = [
  { id: 'first', time: 0, value: 0, mode: 'free', outTime: 0.4, outValue: 0.2 },
  { id: 'last', time: 1, value: 1, mode: 'linear', inTime: 0.8, inValue: 1 },
];
const shifted = moveCurveKey(handles, 'first', 0.9, 0.5, 0, 1),
  handle = shifted[0].outTime;
ok(handle !== undefined && handle <= shifted[1].time, 'moving a key shortens its handle');
const moved = moveCurveKey(keys, 'a', 2, 0.25, 0, 2, 0.1);
ok(moved[0].time < moved[1].time);
equal(
  sampleGradient(
    [
      { id: 'a', position: 0, color: '#00000000' },
      { id: 'b', position: 1, color: '#ffffff' },
    ],
    0.5,
  ),
  '#80808080',
);
const clip = trimClip({ id: 'c', start: 2, end: 8, offset: 1, duration: 10, label: 'clip' }, 'start', 4);
equal(clip.offset, 3);
equal(clip.end, 8);
equal(trimClip(clip, 'end', 99).end, 11);
const clips = [
  { id: 'a', label: 'a', start: 0, end: 2, offset: 0, duration: 10 },
  { id: 'b', label: 'b', start: 3, end: 5, offset: 2, duration: 10 },
];
equal(editTimelineClip(clips, 'a', 'move', 99, 10)[0].end, 3);
equal(editTimelineClip(clips, 'b', 'start', 0, 10)[1].start, 2);
const nodes: ToolNode[] = [
  { id: 'a', label: 'a', x: 0, y: 0, pins: [{ id: 'out', label: 'out', type: 'float', output: true }] },
  { id: 'b', label: 'b', x: 1, y: 1, pins: [{ id: 'in', label: 'in', type: 'float', output: false }] },
];
const links = connectNodes(nodes, [], 'a', 'out', 'b', 'in', '1');
equal(links.length, 1);
equal(connectNodes(nodes, links, 'a', 'out', 'b', 'in', '2').length, 1);
ok(connectNodes(nodes, links, 'b', 'in', 'a', 'out', '3') === links, 'invalid connection preserves typed identity');
deepEqual(connectNodes(nodes, links, 'b', 'in', 'a', 'out', '3'), links);
const index = new FlameIndex([
  { id: 'a', label: 'a', start: 0, duration: 100, depth: 0 },
  { id: 'b', label: 'b', start: 5, duration: 2, depth: 1 },
  { id: 'c', label: 'tiny', start: 5, duration: 0.00001, depth: 1 },
]);
equal(index.visible(6, 8, 10).length, 2);
equal(index.visible(99, 100, 10).length, 1);
const dense: FlameSpan[] = [];
for (let i = 0; i < 2000; i++)
  dense.push({ id: String(i), label: 'tiny', start: i / 100, duration: 0.000001, depth: 0 });
dense.push({ id: 'wide', label: 'wide', start: 5, duration: 2, depth: 0 });
equal(new FlameIndex(dense).visible(0, 20, 1).length, 1);
equal(index.hit(6, 0)?.id, 'a');
const hex = new HexSelection();
let bytes = [0x12, 0x34];
bytes = hex.edit(bytes, 'a');
equal(bytes[0], 0xa2);
equal(hex.phase, NibblePhase.Low);
bytes = hex.edit(bytes, 'b');
equal(bytes[0], 0xab);
equal(hex.cursor, 1);
equal(bytes.length, 2);
hex.move(99, bytes.length, true);
equal(hex.cursor, 1);
equal(hex.copy(bytes, false), '34');
hex.move(0, bytes.length, false);
hex.move(1, bytes.length, true);
equal(hex.copy(bytes, false), 'ab 34');
const meter = new LevelState();
meter.sample([1, 0.1], 0);
equal(meter.peaks[0], 0);
ok(Math.abs(meter.peaks[1] + 20) < 0.000001);
ok(meter.clips[0]);
meter.sample([0, 0], 1000);
equal(meter.holds[0], 0);
meter.sample([0, 0], 2000);
equal(meter.holds[0], -20);
meter.reset();
equal(meter.clips[0], false);
meter.sample([0, 0], 10000);
equal(meter.phase, MeterPhase.Rest);
meter.transition(MeterPhase.Disposed);
meter.sample([1], 11000);
equal(meter.phase, MeterPhase.Disposed);
const clock = new MeterClock();
clock.transition(MeterClockPhase.Scheduled);
const epoch = clock.generation;
clock.transition(MeterClockPhase.Idle);
clock.transition(MeterClockPhase.Scheduled);
ok(clock.generation > epoch);
clock.transition(MeterClockPhase.Disposed);
clock.transition(MeterClockPhase.Scheduled);
equal(clock.phase, MeterClockPhase.Disposed);
console.log('tool models: ok');
