# oled-clock

A clock written as a JSX component (React model, `useState` / `useEffect`) on a 128x64 SSD1306 OLED, like
react-ssd1306. The UI is laid out and rendered like any `zinc:ui` screen; the display driver converts it to 1-bit
pixels. On macOS the OLED appears in an emulator window.

## Run it

```sh
zinc run examples/led/oled-clock                  # macOS: SSD1306 emulator
zinc run examples/led/oled-clock --target esp32   # firmware: I2C on SDA 21 / SCL 22
zinc build examples/led/oled-clock --target rpi1  # Raspberry Pi: /dev/i2c-1
```

The ESP32 build has no network clock, so it shows the uptime; hosts show UTC. No controls.

## What to look at

| File | Role |
| --- | --- |
| `src/main.tsx` | the `Clock` component (host `View` / `Text` tags, a seconds bar sized with `style={{ width }}`), and the frame loop feeding it the time |
| `src/time.ts` | seconds of the day to hours / minutes / seconds, two-digit formatting |
| `zinc.json` | the SSD1306 display per target (I2C pins, device path) |
