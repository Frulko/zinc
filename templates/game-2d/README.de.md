# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.ts` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Ein 2D-Spiel aus der Vorlage `game-2d`: Sammle die Münzen, bevor die Zeit abläuft.

```sh
zinc run      # play: arrows / WASD or a gamepad, or hold the pointer where to go; Enter, Space or a click to start
zinc test     # the rules of the game (tests/world.test.ts)
zinc build    # a native executable in build/
```

| Datei | Was sie tut |
|---|---|
| `src/main.ts` | die Frame-Schleife: führt die aktuelle Szene aus und wechselt zu der, die sie nennt |
| `src/scenes.ts` | die Szenen Titel, Spiel und Game over (Zeichnen und Eingabe) |
| `src/world.ts` | die Regeln ohne Zeichnen: Bewegung, Münzen, Punktestand, Zeit (das prüfen die Tests) |
| `src/save.ts` | der beste Punktestand, gespeichert mit `zinc:storage` |
| `assets/*.svg` | die Sprites: Die Regel `sprite` in `zinc.json` packt sie in eine Textur, einen Atlas, gezeichnet mit `zinc:sprite`: `atlas('sprites').frame('player.svg').draw(x, y)` (auch PNG- und Aseprite-Dateien, siehe docs/plugins/sprite.md) |
| `assets/coin.wav` | der Klang einer eingesammelten Münze, abgespielt mit `zinc:audio`: `load('coin.wav').play()` (WAV, FLAC, MP3 oder OGG; `loop` und `volume` für Musik) |
| `zinc.json` `loading` | der Ladebildschirm: ein Balken, der gezeichnet wird, während die Assets laden, bevor `src/main.ts` startet, und in den Titel übergeht; nicht gezeigt, wenn sie innerhalb eines Frames laden (`"screen"` nimmt `"bar"`, `"default"`: den Splash mit Balken, oder ein eigenes Modul, siehe docs/plugins/loader.md) |
