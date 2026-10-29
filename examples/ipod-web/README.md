# ipod-web

A command-line program that serves a small web page showing the iPods plugged into this machine and their specs: model,
generation, capacity, storage used, firmware, serial number, checksum, USB product. It is the first piece of an iPod daemon on a
Raspberry Pi or a C.H.I.P. that a Mac app (or a Subsonic client) would drive over the network.

It is **read only**: it calls `ipod.detect()` every 3 s, which reads the mounted volumes and the system's USB list. It never
opens an iPod's database and never writes to the iPod.

## Run it

```sh
zinc run examples/ipod-web                  # then open http://localhost:8686
zinc run examples/ipod-web -- --port 9000
curl localhost:8686/pod.json                # the same data as JSON
```

The page reloads itself every 5 s, so an iPod plugged in or pulled out shows on its own.

## Layout of `src/`

- `main.ts`: the port from the arguments, the server, the scan timer.
- `state.ts`: the last scan (`detect()`).
- `page.ts`: the HTML page and the JSON, built from the same rows.
- `services/web.ts`: the routes (`/`, `/pod.json`, 404).
- `constants.ts`: the port and the timings.

## Notes

- Linux (Pi, C.H.I.P.): the plugin needs glib, libplist, taglib and libusb (`docs/plugins/ipod.md`). An HFS+ iPod mounts read
  only there, which this program does not mind.
- Test: `tests/t1/ipod_web.sh` serves a fake iPod (a folder with its `SysInfo`) and checks the page, the JSON and a 404.
