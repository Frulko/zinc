# badge

A scrolling name badge for a Raspberry Pi with a [Pimoroni Scroll pHAT](../../../../docs/boards.md#pimoroni-scroll-phat)
(11x5 LEDs): your name, then the Pi's IP address, refreshed every 30 seconds. Handy on a headless Pi: plug it in,
read the address, `ssh` in.

| file | what |
| --- | --- |
| `src/main.ts` | the marquee (3x5 font, seamless loop) |
| `src/ip.ts` | the address from `hostname -I` (Linux) or `ipconfig getifaddr en0` (macOS), via `zinc:process` |
| `zinc.json` | `"board": "pimoroni-scroll-phat"`: 11x5, display `scrollphat` |

```sh
zinc run examples/boards/scrollphat/badge -- Ada                           # macOS emulator, name "Ada"
zinc deploy examples/boards/scrollphat/badge --target rpi1 --device pi@raspberrypi.local   # installs a systemd service
```

The name is the first program argument, or `NAME` in `src/main.ts` (the systemd service starts it without arguments).
