# Weather station

A tiny Zinc project used as the sample workspace of the **zed-editor** example. It reads a day of sensor
readings, computes a few statistics and prints a coloured report.

## Run it

```sh
zinc run examples/zed-editor/sample --target sim
```

## Layout

| Path | What |
| --- | --- |
| `src/main.ts` | entry point: the report |
| `src/lib/stats.ts` | mean, min / max, a moving average |
| `src/lib/format.ts` | units and ANSI colours |
| `src/lib/forecast.ts` | *work in progress*: it does not type-check yet |
| `src/ui/Dashboard.tsx` | the same numbers as a `zinc:ui` screen |
| `data/readings.json` | the sample readings |

> Tip: open the file finder with **⌘P** and type `dash` to jump to the dashboard.

- [ ] chart the humidity
- [x] colour the temperature by range
