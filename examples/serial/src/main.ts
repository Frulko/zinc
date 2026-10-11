// serial: plots the numbers a board prints, one per line (arduino/plot/plot.ino: Serial.println(analogRead(A0))). It takes the first USB serial
// port, or SERIAL_PORT=/dev/cu.usbmodem14101; SERIAL_BAUD=115200 for another speed than 9600. Unplug the board and plug it back: it reconnects.
// With no board, a simulated run (ZINC_NATIVE=sim) plots a wave through the simulator's 'loopback' port.
import { onFrame, clear, line, text, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { open, list, SerialPort } from 'zinc:serial';

const BAUD: i32 = env('SERIAL_BAUD') === '' ? 9600 : parseInt(env('SERIAL_BAUD'));
const values: number[] = [];
let port: SerialPort | null = null;
let status = '';
let echo = false;       // the port gives back what we write: we play the board ourselves
let retry = 0, clock = 0;

function connect(): void {
  const found = list();
  const usb = found.filter((p: string) => p.toLowerCase().includes('usb') || p.includes('ttyACM'));
  const path = env('SERIAL_PORT') !== '' ? env('SERIAL_PORT') : usb.length > 0 ? usb[0] : found.includes('loopback') ? 'loopback' : '';
  if (path === '') { status = 'no board found: plug one in, or set SERIAL_PORT'; return; }
  try {
    const p = open(path, BAUD);
    p.onLine((text: string) => {
      const v = parseFloat(text);
      if (isNaN(v)) return;   // a board also prints words
      if (values.length === 0) console.log('serial: first value', v);
      values.push(v);
      if (values.length > width() - 16) values.shift();
    });
    p.onClose((unplugged: boolean) => { port = null; status = unplugged ? `${path} was unplugged` : `${path} closed`; console.log('serial:', unplugged ? 'unplugged' : 'closed'); });
    port = p;
    echo = path === 'loopback';
    status = `${path} at ${BAUD} baud`;
    console.log('serial: open', echo ? path : 'a port');
  } catch (e) {
    status = (e as Error).message;
  }
}

onFrame((dt: number) => {
  clock += dt;
  const p = port;
  if (p === null) { retry -= dt; if (retry <= 0) { retry = 1; connect(); } }
  else if (echo) p.write(`${Math.round(512 + 400 * Math.sin(clock * 3))}\n`);

  clear(0x101820);
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi === lo) hi = lo + 1;
  const top = 40, bottom = height() - 12;
  for (let i = 1; i < values.length; i++) {
    const y0 = bottom - (values[i - 1] - lo) / (hi - lo) * (bottom - top), y1 = bottom - (values[i] - lo) / (hi - lo) * (bottom - top);
    line(8 + i - 1, y0, 8 + i, y1, 0x40e0a0);
  }
  text(8, 8, status, 0x8090a0, 1);
  if (values.length > 0) text(8, 20, `${values[values.length - 1]}   min ${lo}  max ${hi}`, 0xffffff, 1);
});
