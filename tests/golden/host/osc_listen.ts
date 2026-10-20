import { listen, close } from 'zinc:osc';
import * as sys from 'zinc:sys';
// a listener fed by an external sender (tests/t0/osc.sh): a bundle with a timetag, a nested bundle, T/F/d/h/r/b arguments and a garbage datagram
let n: i32 = 0;
listen(19322, (m) => {
  console.log(m.address + ' ' + JSON.stringify(m.numbers) + ' ' + JSON.stringify(m.strings));
  n++;
});
for (let i: i32 = 0; i < 100 && n < 4; i++) sys.poll(25);
close();
