// zinc:midi through virtual ports, with no instrument: a virtual output is opened as an input and every message sent is received byte for
// byte; then the other way through a virtual input; the port lists change as the ports come and go. The same output from RtMidi on the real
// MIDI system and from the stand-in. MIDI_PORT names the ports (unique per run on the real system, where every program sees them).
import { inputs, outputs, openInput, openOutput, createInput, createOutput, watchPorts, unwatchPorts } from 'zinc:midi';
import { env } from 'zinc:sys';

const NAME = env('MIDI_PORT') === '' ? 'zinc-test' : env('MIDI_PORT');
const sleep = (ms: i32): Promise<void> => new Promise<void>(resolve => { setTimeout(resolve, ms); });
async function until(what: string, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 250 && !ok(); i++) await sleep(20);
  if (!ok()) console.log('TIMEOUT waiting for', what);
}

async function main(): Promise<void> {
  try { openInput(NAME); } catch (e) { console.log((e as Error).message.replace(NAME, 'NAME')); }
  try { openOutput(NAME); } catch (e) { console.log((e as Error).message.replace(NAME, 'NAME')); }
  let changes = 0, sawIn = false, sawOut = false;
  watchPorts((ins: string[], outs: string[]) => { changes++; if (ins.includes(NAME)) sawIn = true; if (outs.includes(NAME + ' in')) sawOut = true; });

  // out of a virtual output, into an input opened on it
  const source = createOutput(NAME);
  await until('the virtual output among the inputs', () => inputs().includes(NAME));
  const listener = openInput(NAME);
  const got: u8[][] = [];
  const events: string[] = [];
  listener.onMessage((bytes: u8[]) => { got.push(bytes); });
  listener.onNote((note: i32, velocity: i32, channel: i32) => { events.push(`note ${note} velocity ${velocity} channel ${channel}`); });
  listener.onControl((controller: i32, value: i32, channel: i32) => { events.push(`control ${controller} value ${value} channel ${channel}`); });
  listener.onClock(() => { events.push('clock'); });
  await sleep(100);   // CoreMIDI connects a new input a moment after openPort returns

  const sysex: u8[] = [0xf0, 0x7d];
  for (let i = 0; i < 300; i++) sysex.push(i % 128);
  sysex.push(0xf7);
  const sent: boolean[] = [
    source.noteOn(60), source.noteOff(60), source.noteOn(72, 1, 10), source.send([0x90, 72, 0]), source.control(7, 127, 16), source.clock(),
    source.start(), source.stop(), source.send([0xc1, 5]), source.send([0xe2, 0, 64]), source.send(sysex), source.noteOn(200, -5, 99),
  ];
  console.log('sent:', sent.every((ok: boolean) => ok), sent.length, 'empty message:', source.send([]));
  await until('12 messages', () => got.length >= 12);
  for (const m of got) console.log(m.length > 8 ? `${m.length} bytes, system exclusive equal: ${JSON.stringify(m) === JSON.stringify(sysex)}` : JSON.stringify(m));
  for (const e of events) console.log(e);

  // the other way: into a virtual input, from an output opened on it
  const sink = createInput(NAME + ' in');
  const heard: u8[][] = [];
  sink.onMessage((bytes: u8[]) => { heard.push(bytes); });
  await until('the virtual input among the outputs', () => outputs().includes(NAME + ' in'));
  const player = openOutput(NAME + ' in');
  await sleep(100);
  player.noteOn(64, 90, 2);
  player.allNotesOff();
  await until('17 messages on the virtual input', () => heard.length >= 17);
  console.log('virtual input:', JSON.stringify(heard[0]), heard.length, JSON.stringify(heard[16]));

  await until('the watcher', () => sawIn && sawOut);
  console.log('ports seen coming:', sawIn, sawOut, changes >= 1);
  source.close(); listener.close(); player.close(); sink.close();
  console.log('closed:', source.isOpen, listener.isOpen, source.noteOn(60), player.send([0xf8]));
  await until('the ports to go', () => !inputs().includes(NAME) && !outputs().includes(NAME + ' in'));
  console.log('ports gone:', !inputs().includes(NAME), !outputs().includes(NAME + ' in'));
  unwatchPorts();
}
main();
