# 4. Headless services

A headless Zinc program has no window and no `zinc:gfx`. The event loop stays alive as long as there is work to do —
an open server socket, a poller, a pending timer or microtask — so a daemon is just a program that opens a listener
and/or arms a timer and never runs out of work. When there is nothing left, the loop returns and the program exits.

The worked example is [`examples/service/sensor-hub`](../../examples/service/sensor-hub): it reads a sensor every
second, serves the values as JSON over HTTP, publishes to MQTT when configured, and exports metrics to
`zinc:telemetry`. Run it:

```sh
zinc run examples/service/sensor-hub                 # sim (Node)
zinc run examples/service/sensor-hub --target macos  # native
curl localhost:3000/readings                         # {"seq":…,"tempC":…,"humidity":…}
```

## HTTP server

`zinc:net` gives you `serve(port, handler)` — a minimal HTTP/1.1 server whose handler runs on the event loop (no
threads, one connection at a time drained by the poller). Bind is `0.0.0.0` (`ZINC_BIND=127.0.0.1` restricts it, e.g.
behind a reverse proxy). Requests are limited: 16 KiB of headers, a 1 MiB body (`ZRT_HTTP_MAX_BODY`), 32 open
connections, 10 s to send a request, 2 s for a client to take a reply; see [security](08-security.md) about exposure.

```ts
import { serve, Request, Reply } from 'zinc:net';
serve(3000, (req: Request): Reply => {
  if (req.path === '/healthz') return { status: 200, contentType: 'application/json', body: '{"ok":true}' };
  return { status: 404, contentType: 'application/json', body: '{"error":"not found"}' };
});
```

`fetch(url, init?)` is the client side (libcurl on hosts, `esp_http_client` on ESP32). Only `http:` and `https:` URLs
are fetched, following at most 20 redirects. A request times out after `timeoutMs` (default 120000; connecting takes
at most 30 s). A response body larger than `maxBytes` (default: a quarter of the heap, at most 64 MiB) is refused with
`fetch failed: response too large`. The handler receives
`method`, `path`, `body`; there is no routing framework — branch on `req.path` yourself.

## MQTT, OSC, telemetry

```ts
import { MqttClient } from 'zinc:mqtt';           // MQTT 3.1.1, QoS 0
const c = new MqttClient('broker', 1883, 'client-id');
c.connect().then(() => c.publish('sensors/hub', '{"t":21.4}'));
c.subscribe('cmd/#', (topic, payload) => console.log(topic, payload));

import { send, listen } from 'zinc:osc';           // OSC 1.0 over UDP
send('127.0.0.1', 9000, '/level', [0.8]);
listen(9001, (m) => console.log(m.address, m.numbers));
```

`zinc:telemetry` streams JSON lines (perf, logs, metrics, exposed state) to UDP/stdout/file; `zinc monitor` renders
them live. Enable with the `ZINC_TELEMETRY` env var (no code change) or `telemetry.connect(...)`:

```ts
import * as telemetry from 'zinc:telemetry';
telemetry.gauge('sensor.tempC', t);
telemetry.counter('sensor.samples', 1);
telemetry.expose('tempC', () => latest);           // sampled at 10 Hz into state snapshots
```

```sh
ZINC_TELEMETRY=udp://127.0.0.1:9999 zinc run examples/service/sensor-hub --target macos &
zinc monitor          # fps/metrics/exposed vars, live
```

## Timers

`setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` work headless — the loop wakes for the next due timer.
A `setInterval` is enough to keep a daemon alive with no listener.

## Logging

`console.log/info/debug/warn/error/trace` map to leveled output; `warn`/`error`/`trace` go to stderr. Set
`ZINC_LOG_FORMAT=json` for one JSON object per line (`{"time","level","message"}`), ready for journald/Loki:

```sh
ZINC_LOG_FORMAT=json ./sensor-hub
# {"time":361126276.226,"level":"INFO","message":"sensor-hub listening on http://0.0.0.0:3000 (mqtt off)"}
```

## Signals and shutdown

On POSIX hosts (macos, linux, rpi1, rmpp), `sys.onSignal` runs a handler on the event loop when a signal arrives. The
handler replaces the default action, which would terminate the program:

```ts
import * as sys from 'zinc:sys';
import { stop } from 'zinc:net';
sys.onSignal('SIGTERM', () => {       // systemctl stop, docker stop
  console.log('draining…');
  stop();                             // no new connections; the loop ends when the last work is done
});
sys.onSignal('SIGINT', () => { sys.exit(130); });   // Ctrl-C
```

- **Delivery.** The OS handler only sets a flag; a poller calls your callbacks between tasks. This means a handler can
  do anything a timer callback can.
- **Liveness.** Handlers do not keep the program alive, the same as `process.on('SIGINT')` in Node.
- **Names.** `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGUSR1`, `SIGUSR2`, `SIGQUIT`, `SIGWINCH`, `SIGALRM`, `SIGCHLD`,
  `SIGPIPE`, `SIGCONT` and `SIGTSTP`. `SIGKILL` cannot be caught.
- **Sending.** `sys.kill(pid, 'SIGTERM')` sends a signal, and `sys.pid()` is this process.
- **Other targets.** ESP32, PS1, PS2 and wasm have no signals: there `onSignal` does nothing.

Fatal faults (SIGSEGV, SIGBUS, SIGFPE…) keep going to the crash policy below. `sys.exit(code)` still ends the process
at once.

## Process, files, sockets

| Need | Module |
|---|---|
| Arguments, environment, working directory, pid, stdout without a newline, stdin | `zinc:sys`: `args`, `env` / `setEnv` / `unsetEnv` / `envKeys`, `cwd` / `chdir`, `pid`, `write` / `writeErr`, `isatty`, `onStdin(cb)` (chunks, `''` at EOF) |
| Files and directories | `zinc:fs`: text and bytes, `stat` / `lstat`, `readDir` (with types), `mkdir(p, true)` (mkdir -p), `remove(p, true)` (rm -rf), `rename`, `copyFile`, `realpath`, `mkdtemp` / `tmpdir`, `symlink` / `readlink`, `chmod`, `watch` (polling, 100 ms) |
| Machine information | `zinc:os`: `hostname`, `homedir`, `tmpdir`, `arch`, `type`, `release`, `uptime`, `loadavg`, `totalmem` / `freemem`, `cpus`, `networkInterfaces`, `userInfo` |
| Child processes | `zinc:process` ([docs](../plugins/process.md)): spawn with stdin / stdout / stderr pipes, kill, exit code |
| TCP / UDP / Unix sockets, DNS, WebSocket | `zinc:socket` ([docs](../plugins/socket.md)) |
| Paths | `zinc:path`: POSIX `join`, `resolve`, `relative`, `dirname`, `basename`, `extname`, `parse`, `format` (Node's results) |
| SQL database | `zinc:sqlite` ([docs](../plugins/sqlite.md)) |
| Web APIs (fetch, URL, crypto, events…) | globals ([chapter 9](09-web-apis.md)) |

## Running as a systemd service

`zinc export --target linux` (or `rpi1`) produces `dist/<name>-<target>/` with the executable, a `run.sh`, a
`<name>.service` unit (`Restart=on-failure`, `RestartSec=2`) and a `deploy.sh` that installs it root-owned in
`/opt/<name>`, installs the unit and starts it. The unit runs the program unprivileged (`DynamicUser=yes`, no
capabilities, read-only system, private /tmp): its working directory and `zinc:storage` file are in
`/var/lib/<name>` (`StateDirectory`), and devices (framebuffer, input, GPIO, SPI, I2C) are reached through the groups
the device has (`SupplementaryGroups`, filtered by `deploy.sh`). Details and how to relax it:
[chapter 8](08-security.md#deploying-on-linux-and-raspberry-pi).

```sh
zinc export --target linux examples/service/sensor-hub
dist/sensor-hub-linux/deploy.sh me@server        # copies, installs the unit, enable --now
# or, or by hand on the box:
sudo cp sensor-hub.service /etc/systemd/system/ && sudo systemctl enable --now sensor-hub
journalctl -u sensor-hub -f                       # pair with ZINC_LOG_FORMAT=json in the unit's Environment=
```

## Watchdog / restart policy

Two independent layers:

- **systemd** restarts the process if it exits non-zero (`Restart=on-failure`). This is your production watchdog.
- **`zinc.json` `"crash"`** decides what a *crash inside the program* does before the process ends:
  `exit` (default — die, let systemd restart), `redbox` (draw the error and wait; on a headless service `redbox`
  behaves as `restart`), or `restart` (re-run init/teardown in place; three crashes within five seconds gives up with
  exit 101). For a daemon, `"crash": "restart"` recovers from transient panics without a process bounce; `exit` +
  systemd is the simplest robust choice.

## Resource budgets

The heap is a fixed TLSF region sized by the profile (`macos`/`linux` 512 MiB, `rpi1` 64 MiB, `esp32` 160 KiB);
override with `zinc.json` `targets.<id>.heap`. Watch live usage with `sys.liveObjects()` / `sys.allocations()`, or
expose them via telemetry. Build with `--debug` to get ASan + a leak report while developing (see [testing](06-testing.md)).

## On ESP32 as firmware

The same source builds as firmware — `net` (fetch), `mqtt`, `osc`, `telemetry`, `storage` (NVS), `fs` (SPIFFS) and
`gpio` (`driver/gpio`) all have ESP32 backends. Swap the fake `sample()` for a real GPIO/I2C read or a native module.
WiFi credentials go in `zinc.json` `targets.esp32.wifi` (`{ssid, password}`); note that `esp_wifi` station bring-up
is not implemented yet and there is no HTTP *server* on ESP32 (fetch/MQTT/OSC clients only) — see
[ADR 0011](../decisions/0011-target-modules.md) for exactly what is wired and what is a stub.

```sh
zinc build examples/service/sensor-hub --target esp32     # ESP-IDF firmware (built in docker)
zinc export --target esp32 examples/service/sensor-hub    # + flash.sh (esptool)
```

## Signals between objects (zinc:signals)

Qt's signals and slots, typed and without a meta-object system: an object exposes `Signal<T>` fields, anyone
connects a function, `emit` calls the slots in connection order.

```ts
import { Signal, Trigger } from 'zinc:signals';

class Thermometer {
  readonly reading = new Signal<number>();   // a signal with a value
  readonly failed = new Trigger();           // a signal without one
}
const t = new Thermometer();
const c = t.reading.connect((celsius: number) => console.log(`${celsius} °C`));
t.reading.emit(21.5);          // direct: the slots run now (Qt::DirectConnection)
t.reading.emitQueued(22);      // queued: on the next microtask (Qt::QueuedConnection)
const next = await t.reading.next();   // a promise of the next value
c.disconnect();                // or `using c = t.reading.connect(...)` to disconnect at the end of the scope
```

A slot disconnected during an emit is not called afterwards; one connected during an emit waits for the next one;
`once()` connects for a single emit. In a UI, `fromSignal(signal, initial)` from `zinc:ui/solid` turns it into a
reactive accessor (disconnected with its owner). `zinc:events`' `Emitter` remains the tool for values coming from
native threads (listeners run as microtasks).

Next: [plugins](05-plugins.md). Web platform APIs: [chapter 9](09-web-apis.md).
