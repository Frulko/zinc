# Native modules, live

One screen, one card per built-in module, each talking to the real implementation: `zinc:sys`, `zinc:storage`
(launch counter that survives restarts), `zinc:fs`, `zinc:net` (the app serves HTTP on :8787 and fetches itself
every second), `zinc:osc` (loopback on :9031), `zinc:mqtt` (connects to a broker on localhost:1883 if one runs,
e.g. `brew services start mosquitto`), `zinc:gpio` (simulated on desktops, real pins on Pi/ESP32), `zinc:events`,
`zinc:telemetry` (`ZINC_TELEMETRY=udp://127.0.0.1:9999` + `zinc monitor`) and `zinc:assets`.

```sh
zinc run examples/modules-showcase               # macOS
zinc run examples/modules-showcase --target rpi1 # Raspberry Pi build (QEMU)
```

Plugins (video, maps, camera, LED displays, mapping, ink…) have their own examples: see `zinc plugins`.
