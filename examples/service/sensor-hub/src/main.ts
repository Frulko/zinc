// sensor-hub: a headless daemon. Reads sensors on a timer, serves the latest values as JSON over HTTP,
// publishes each sample to MQTT (when a broker is configured), and exposes metrics to zinc:telemetry.
//
//   zinc run examples/service/sensor-hub                 # sim (Node)
//   zinc run examples/service/sensor-hub --target macos  # native
//   PORT=8080 MQTT_HOST=localhost ./sensor-hub           # exported binary, env-configured
//   ZINC_LOG_FORMAT=json ./sensor-hub                    # structured logs for journald/Loki
//
// No screen, no zinc:gfx: the event loop stays alive because serve() and setInterval() have work to do.
import { serve, Request, Reply } from 'zinc:net';
import { MqttClient } from 'zinc:mqtt';
import * as telemetry from 'zinc:telemetry';
import * as sys from 'zinc:sys';

interface Reading { seq: i32; t: f64; tempC: f64; humidity: f64 }

const PORT: i32 = intEnv('PORT', 3000);
const MQTT_HOST = sys.env('MQTT_HOST');            // "" disables MQTT
const MQTT_PORT: i32 = intEnv('MQTT_PORT', 1883);
const TOPIC = orElse(sys.env('MQTT_TOPIC'), 'sensors/hub');

let seq: i32 = 0;
let latest: Reading = { seq: 0, t: 0, tempC: 0, humidity: 0 };
let samples: i32 = 0;
const history: Reading[] = [];
let mqtt: MqttClient | null = null;
let mqttUp = false;

function intEnv(name: string, def: i32): i32 {
  const v = sys.env(name);
  return v.length > 0 ? (parseInt(v, 10) as i32) : def;
}
function orElse(v: string, def: string): string { return v.length > 0 ? v : def; }

// A deterministic fake sensor (replace with a native module or zinc:gpio / I2C read on real hardware).
function sample(): Reading {
  const t = sys.clock() / 1000;
  const tempC = 21 + Math.sin(t * 0.3) * 4 + (Math.random() - 0.5);
  const humidity = 50 + Math.cos(t * 0.2) * 8;
  return { seq: ++seq, t, tempC, humidity };
}

function toJson(r: Reading): string {
  return `{"seq":${r.seq},"tempC":${r.tempC.toFixed(2)},"humidity":${r.humidity.toFixed(1)}}`;
}

function tick(): void {
  latest = sample();
  samples++;
  history.push(latest);
  if (history.length > 120) history.shift();
  telemetry.gauge('sensor.tempC', latest.tempC);
  telemetry.gauge('sensor.humidity', latest.humidity);
  telemetry.counter('sensor.samples', 1);
  if (mqtt !== null && mqttUp) mqtt.publish(TOPIC, toJson(latest));
  console.debug('sample', latest.seq, latest.tempC.toFixed(2), 'C');
}

// zinc:telemetry: gauges sampled at 10 Hz, plus these exposed values (see `zinc monitor`).
telemetry.expose('tempC', () => latest.tempC);
telemetry.expose('samples', () => samples);

// Optional MQTT: connect once, keep running whether or not the broker is up (publish is a no-op until connected).
if (MQTT_HOST.length > 0) {
  const c = new MqttClient(MQTT_HOST, MQTT_PORT, 'sensor-hub');
  mqtt = c;
  c.connect().then(() => { mqttUp = true; console.info('mqtt connected', MQTT_HOST, MQTT_PORT); });
  // a rejected connect() logs and leaves mqttUp false; the HTTP API keeps serving
}

// HTTP JSON API. Bind is 0.0.0.0 (see docs/guide/08-security.md — put a reverse proxy or firewall in front).
serve(PORT, (req: Request): Reply => {
  const json = (status: i32, body: string): Reply => ({ status, contentType: 'application/json', body });
  if (req.path === '/healthz') return json(200, '{"ok":true}');
  if (req.path === '/readings') return json(200, toJson(latest));
  if (req.path === '/history') return json(200, '[' + history.map(toJson).join(',') + ']');
  if (req.path === '/') return json(200, '{"endpoints":["/readings","/history","/healthz"],"samples":' + samples + '}');
  return json(404, '{"error":"not found"}');
});

// Read a sensor every second. This timer, plus the HTTP listener, keeps the event loop alive with no window.
tick();
setInterval(tick, 1000);

console.info('sensor-hub listening on http://0.0.0.0:' + PORT, MQTT_HOST.length > 0 ? '(mqtt ' + MQTT_HOST + ')' : '(mqtt off)');
