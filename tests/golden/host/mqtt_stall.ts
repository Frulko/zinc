import { MqttClient } from 'zinc:mqtt';
import * as sys from 'zinc:sys';
// A broker that accepts the TCP connection and never answers (ZN-610): the TLS handshake cannot complete, and connect() must reject within
// connectTimeoutMs with why, never hang.
async function main(): Promise<void> {
  const c = new MqttClient('127.0.0.1', parseInt(sys.args()[0]), 'stall-client', true);
  c.connectTimeoutMs = 1000;
  try {
    await c.connect();
    console.log('connected?');
  } catch (e) {
    console.log((e as Error).message);
  }
}
main();
