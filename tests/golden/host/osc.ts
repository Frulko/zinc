import { listen, send, close } from 'zinc:osc';
import * as sys from 'zinc:sys';
// loopback: a message keeps its number and string arguments in order of type; integers stay exact, fractions go through f32
const got: string[] = [];
listen(19321, (m) => {
  got.push(m.address + ' ' + JSON.stringify(m.numbers) + ' ' + JSON.stringify(m.strings));
});
send('127.0.0.1', 19321, '/a/b', [1, -2, 0.5], ['hi', 'there']);
send('localhost', 19321, '/empty', []);
for (let i: i32 = 0; i < 20 && got.length < 2; i++) sys.poll(25);
for (const g of got) console.log(g);
close();
