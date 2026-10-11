// osc: a square that goes where Open Sound Control messages send it. Any OSC software can drive it (TouchOSC, Chataigne, Pure Data, Max,
// SuperCollider, a phone): send to UDP port 9000
//   /shape/xy  x y      two floats from 0 to 1, the position
//   /shape/x   x        one axis at a time (and /shape/y)
//   /shape/color r g b  three floats from 0 to 1
// OSC_PORT=9001 listens elsewhere. OSC_DEMO=1 needs no other software: the program sends itself the messages.
import { onFrame, clear, rect, text, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { open, Message, Osc } from 'zinc:osc/full';

const SIZE = 40;
let x = 0.5, y = 0.5;
let color: u32 = 0xffb000;
let status = 'opening...';
let received = 0;
let self: Osc | null = null;
let angle = 0;

const unit = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v;
const channel = (v: number): u32 => Math.round(unit(v) * 255);

async function start(): Promise<void> {
  const port: i32 = env('OSC_PORT') === '' ? 9000 : parseInt(env('OSC_PORT'));
  try {
    const osc = await open(port);
    status = `listening on UDP ${osc.port}`;
    console.log('osc: listening');
    osc.on('/shape/xy', (m: Message) => { if (m.args.length >= 2) { x = unit(m.args[0].num); y = unit(m.args[1].num); } });
    osc.on('/shape/x', (m: Message) => { if (m.args.length >= 1) x = unit(m.args[0].num); });
    osc.on('/shape/y', (m: Message) => { if (m.args.length >= 1) y = unit(m.args[0].num); });
    osc.on('/shape/color', (m: Message) => {
      if (m.args.length >= 3) color = (channel(m.args[0].num) << 16) | (channel(m.args[1].num) << 8) | channel(m.args[2].num);
    });
    osc.on('/shape/*', (m: Message) => {
      if (received++ === 0) console.log(`osc: first message ${m.address}, the shape is at ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    if (env('OSC_DEMO') !== '') self = osc;
  } catch (e) {
    status = `UDP port ${port} is taken: close the other program or set OSC_PORT`;
    console.log('osc:', status);
  }
}
start();

onFrame((dt: number) => {
  const demo = self;
  if (demo !== null) {   // a circle, sent to ourselves as any other sender would
    angle += dt * 2;
    demo.send('127.0.0.1', demo.port, new Message('/shape/xy').float(0.5 + 0.35 * Math.cos(angle)).float(0.5 + 0.35 * Math.sin(angle)));
  }
  clear(0x101820);
  rect(x * (width() - SIZE), y * (height() - SIZE), SIZE, SIZE, color);
  text(8, 8, status, 0x8090a0, 1);
  text(8, 20, `${received} messages`, 0x8090a0, 1);
});
