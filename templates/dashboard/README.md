# {{name}}

A live dashboard made from the `dashboard` template, on `zinc:ui/nuxt`.

```sh
zinc run      # the dashboard, fed by the mock source
zinc test     # the series and the source (tests/)
zinc build    # a native executable in build/
```

| File | What it does |
|---|---|
| `src/source.ts` | where the numbers come from: `MockSource` (a seeded random walk, four samples a second) behind the `Source` interface |
| `src/series.ts` | a rolling window of samples with its last, min, max and mean |
| `src/charts.ts` | the line and bar charts, drawn into a `<Canvas>` |
| `src/main.tsx` | the page: stat cards, the charts, the alerts, pause / resume |

To show real data, write a class with `poll(dt: number): Sample[]` (from `zinc:net` fetch, `zinc:mqtt`, a serial port...) and pass it to `start()` in
`src/main.tsx` instead of the mock.
