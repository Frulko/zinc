import { MqttClient } from 'zinc:mqtt';
import * as sys from 'zinc:sys';
// MQTT over TLS (ZN-089): the broker's certificate is checked against the test CA; a client that does not trust it is refused.
async function main(): Promise<void> {
  const c = new MqttClient('127.0.0.1', parseInt(sys.args()[0]), 'tls-client', true);
  await c.connect();
  const got: string[] = [];
  c.subscribe('secure/#', (t, p) => { got.push(t + '=' + p); });
  sys.poll(100);
  c.publish('secure/a', 'hello over tls');
  for (let i: i32 = 0; i < 40 && got.length < 1; i++) sys.poll(25);
  console.log(got);
  c.close();
}
main();
