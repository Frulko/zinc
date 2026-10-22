# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.tsx` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Ein Live-Dashboard aus der Vorlage `dashboard`, auf `zinc:ui/nuxt`.

```sh
zinc run      # the dashboard, fed by the mock source
zinc test     # the series and the source (tests/)
zinc build    # a native executable in build/
```

| Datei | Was sie tut |
|---|---|
| `src/source.ts` | woher die Zahlen kommen: `MockSource` (ein Random Walk mit festem Seed, vier Messwerte pro Sekunde) hinter dem Interface `Source` |
| `src/series.ts` | ein gleitendes Fenster von Messwerten mit letztem Wert, Minimum, Maximum und Mittelwert |
| `src/charts.ts` | das Linien- und das Balkendiagramm, gezeichnet in ein `<Canvas>` |
| `src/main.tsx` | die Seite: Statistikkarten, die Diagramme, die Warnungen, Pause / Fortsetzen |

Um echte Daten zu zeigen, schreibe eine Klasse mit `poll(dt: number): Sample[]` (aus `zinc:net` fetch, `zinc:mqtt`, einer seriellen Schnittstelle ...) und gib sie in
`src/main.tsx` statt des Mocks an `start()`.
