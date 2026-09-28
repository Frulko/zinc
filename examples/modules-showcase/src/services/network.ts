// zinc:net, zinc:osc, zinc:mqtt: the app serves HTTP and fetches itself, sends OSC to its own listener, and talks
// to an MQTT broker on localhost:1883 when one runs (e.g. `brew services start mosquitto`).
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as net from 'zinc:net';
import * as osc from 'zinc:osc';
import { MqttClient } from 'zinc:mqtt';

export const HTTP_PORT: i32 = 8787;
const OSC_PORT: i32 = 9031;
const MQTT_TOPIC = 'zinc/showcase';

export const [httpReply, setHttpReply] = createSignal<string>('…');
export const [oscLast, setOscLast] = createSignal<string>('waiting');
export const [mqttLast, setMqttLast] = createSignal<string>('connecting to 127.0.0.1:1883…');

let hits = 0;

/** HTTP server: answers every request with a counter and the path. */
function serveHttp(): void {
  net.serve(HTTP_PORT, (req: net.Request): net.Reply => {
    hits++;
    return { status: 200, body: `hello #${hits} from ${req.path}`, contentType: 'text/plain' };
  });
}

/** HTTP client: one request to our own server. */
async function pollHttp(): Promise<void> {
  try {
    const reply = await net.fetch(`http://127.0.0.1:${HTTP_PORT}/ping`);
    setHttpReply(`${reply.status} "${await reply.text()}"`);
  } catch (e) {
    setHttpReply(`error: ${e.message}`);
  }
}

function listenOsc(): void {
  osc.listen(OSC_PORT, (m: osc.OscMessage) => {
    setOscLast(`${m.address} ${m.numbers.map((n: number) => n.toFixed(2)).join(' ')}`);
  });
}

async function startMqtt(): Promise<void> {
  const client = new MqttClient('127.0.0.1', 1883, 'zinc-showcase');
  try {
    await client.connect();
    client.subscribe(MQTT_TOPIC, (topic: string, payload: string) => { setMqttLast(`${topic}: ${payload}`); });
    client.publish(MQTT_TOPIC, `hello from ${sys.platform()}`);
  } catch (e) {
    setMqttLast(`no broker (${e.message})`);
  }
}

export function startNetwork(): void {
  serveHttp();
  listenOsc();
  startMqtt();
}

/** Once a second: fetch our own server and send an OSC message to our own listener. */
export function pingNetwork(tick: i32): void {
  pollHttp();
  osc.send('127.0.0.1', OSC_PORT, '/showcase/tick', [tick, Math.sin(tick)]);
}
