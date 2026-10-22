# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.tsx` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Eine Desktop-App aus der Vorlage `desktop-app`, auf `zinc:ui/nuxt` (Komponenten im Look von Nuxt UI).

```sh
zinc run      # the app
zinc test     # the router and the settings (tests/)
zinc build    # a native executable in build/
```

| Datei | Was sie tut |
|---|---|
| `src/main.tsx` | die Hülle: eine einklappbare Seitenleiste, die Navigationsleiste mit dem App-Menü, die aktuelle Seite |
| `src/router.ts` | die Seiten und der Verlauf (zurück), ohne UI: getestet |
| `src/settings.ts` | die Einstellungen (Name, dunkler Modus) und wie sie mit `zinc:storage` gespeichert werden: getestet |
| `src/pages/*.tsx` | Home, Notes (eine Liste, die zwischen den Läufen erhalten bleibt), Settings |

`src/desktop.ts` setzt das Anwendungsmenü (File, Edit, View mit Tastenkürzeln, Window: die macOS-Menüleiste, anderswo vom UI-Kit gezeichnet) und ein
Icon im System-Tray, wo die Plattform eines hat; die Seite Settings sagt, was diese Plattform bietet. Das File-Menü der Navigationsleiste enthält dieselben
Aktionen innerhalb des Fensters.
