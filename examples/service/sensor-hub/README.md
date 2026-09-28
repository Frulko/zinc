# sensor-hub

A headless Zinc daemon: no window, no `zinc:gfx`. It reads a sensor every second, serves the latest values as
JSON over HTTP, publishes each sample to MQTT (when a broker is configured), and exposes metrics to
`zinc:telemetry`. It is the worked example for [docs/guide/04-headless-services.md](../../../docs/guide/04-headless-services.md).

## Run

```sh
zinc run examples/service/sensor-hub                 # sim (Node)
zinc run examples/service/sensor-hub --target macos  # native binary
curl localhost:3000/readings
```

Configuration is environment-only (no config file to ship):

| var | default | meaning |
| --- | --- | --- |
| `PORT` | 3000 | HTTP port |
| `MQTT_HOST` | *(empty)* | broker host; empty disables MQTT |
| `MQTT_PORT` | 1883 | broker port |
| `MQTT_TOPIC` | `sensors/hub` | publish topic |

```sh
PORT=8080 MQTT_HOST=localhost zinc run examples/service/sensor-hub --target macos
ZINC_LOG_FORMAT=json ./sensor-hub                    # structured logs (one JSON object per line)
ZINC_TELEMETRY=udp://127.0.0.1:9999 ./sensor-hub &  zinc monitor   # live metrics
```

## HTTP endpoints

| path | response |
| --- | --- |
| `GET /` | endpoint list + sample count |
| `GET /readings` | latest reading `{seq,tempC,humidity}` |
| `GET /history` | up to 120 recent readings |
| `GET /healthz` | `{"ok":true}` (liveness probe) |

## Ship it as a service

```sh
zinc export --target linux examples/service/sensor-hub   # dist/sensor-hub-linux with a systemd unit
scp -r dist/sensor-hub-linux server:/tmp/ && ssh server 'cd /tmp/sensor-hub-linux && ./deploy.sh'
```

The exported directory carries `sensor-hub.service` (`Restart=on-failure`) and `deploy.sh`. On ESP32 the same
source builds as firmware (`zinc export --target esp32`) with the fake sensor; swap `sample()` for a real
`zinc:gpio` / I2C read or a native module. See the guide for the sensor, MQTT, telemetry and hardening details.
