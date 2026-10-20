// zinc:serial on the stand-in (native/serial.sim.ts), as a deterministic run binds it: the 'loopback' port gives back what is written.
import { open, list } from 'zinc:serial';

console.log('list:', JSON.stringify(list()));
try { open('/dev/cu.usbmodem1'); } catch (e) { console.log((e as Error).message); }
const port = open('loopback', 115200, '7e2');
let lines = 0;
port.onData((bytes: u8[]) => { console.log('data:', bytes.length, 'bytes'); });
port.onLine((line: string) => {
  console.log('line:', JSON.stringify(line));
  if (++lines === 3) port.close();
});
port.onClose((unplugged: boolean) => { console.log('closed, unplugged:', unplugged, 'open:', port.isOpen, 'write:', port.write('x')); });
port.write('one\ntwo\r\nthr');
port.writeBytes([101, 101, 10, 104, 97, 108, 102]);   // "ee\n", then a line that never ends
