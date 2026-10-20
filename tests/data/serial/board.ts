// zinc:serial against a pseudo-terminal (tests/data/serial/fake_board.py holds the other end and plays the board): lines and raw bytes both ways,
// a write larger than the port takes at once, then the other end goes away.
import { open, list } from 'zinc:serial';
import { env } from 'zinc:sys';

console.log('list:', list().every((p: string) => p.startsWith('/dev/')));
try { open('/dev/zinc-no-such-port'); } catch (e) { console.log((e as Error).message); }
try { open(env('SERIAL_PORT'), 9600, '9N1'); } catch (e) { console.log((e as Error).message.replace(env('SERIAL_PORT'), 'PORT')); }
try { open(env('SERIAL_PORT'), 9600, '8X1'); } catch (e) { console.log((e as Error).message.replace(env('SERIAL_PORT'), 'PORT')); }
try { open('/dev/null'); } catch (e) { console.log((e as Error).message); }

const port = open(env('SERIAL_PORT'), 115200);
let seen = 0, sum = 0;
port.onData((bytes: u8[]) => { for (const v of bytes) { sum = (sum + v * (seen % 7 + 1)) % 65521; seen++; } });
port.onLine((line: string) => {
  if (line === 'ping') { console.log('line: ping'); port.write('pong\n'); }
  else if (line.startsWith('text ')) { console.log('line:', line); port.write(line.toUpperCase() + '\r\n'); }
  else if (line === 'bytes') {
    const all: u8[] = [];
    for (let i = 0; i < 256; i++) all.push(i);
    console.log('line: bytes', port.writeBytes(all));
  } else if (line === 'big') {
    const big: u8[] = [];
    for (let i = 0; i < 200000; i++) big.push((i * 7) % 251);
    const ok = port.writeBytes(big);
    console.log('line: big', ok, 'waiting to go out:', port.pending > 0);
  } else if (line === 'count') { console.log('received', seen, 'bytes, checksum', sum); port.write('counted\n'); }
});
port.onClose((unplugged: boolean) => { console.log('closed, unplugged:', unplugged, 'open:', port.isOpen, 'write:', port.write('x')); });
console.log('open:', port.isOpen, port.baud, port.setSignals(true, true));
port.write('ready\n');
