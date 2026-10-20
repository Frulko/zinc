import { MqttClient } from 'zinc:mqtt';
import * as sys from 'zinc:sys';
// two clients through a broker: wildcard filters, retained messages, QoS 1, and a refused connection
async function main(): Promise<void> {
  const port = parseInt(sys.args()[0]);
  const a = new MqttClient('127.0.0.1', port, 'a');
  const b = new MqttClient('localhost', port, 'b');
  await a.connect();
  await b.connect();
  const got: string[] = [];
  b.subscribe('home/+/temp', (t, p) => { got.push(t + '=' + p); });
  b.subscribe('all/#', (t, p) => { got.push(t + '=' + p); });
  sys.poll(100);
  a.publish('home/kitchen/temp', '21.5');
  a.publish('home/kitchen/hum', 'no');
  a.publish('all/x/y', 'deep', false, 1);
  a.publish('all/r', 'kept', true);
  for (let i: i32 = 0; i < 40 && got.length < 3; i++) sys.poll(25);
  for (const g of got) console.log(g);
  a.close();
  b.close();
  const bad = new MqttClient('127.0.0.1', 1, 'c');
  try { await bad.connect(); } catch (e) { console.log('refused:', (e as Error).message); }
}
main();
