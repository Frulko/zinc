# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.ts` und speichere.
- Lerne den Canvas-Stil, eine Lektion nach der anderen: https://frulko.github.io/zinc/de/docs/learn/17-paths-and-fills/
- Die vier Wege, ein Programm zu schreiben: https://frulko.github.io/zinc/de/docs/start/styles/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Eine Skizze aus der Vorlage `canvas`: Sie zeichnet mit der Canvas-API des Webs (`zinc:canvas`), sodass sich Canvas-Code aus einer Webseite oder einem
Tutorial mit wenigen Änderungen übernehmen lässt. Es gibt keine Seite und kein `<canvas>`-Element: Das `onFrame` von `zinc:gfx` ruft deine Funktion etwa 60-mal pro
Sekunde auf, und `ctx.begin(0, 0, width(), height())` ... `ctx.end()` macht das ganze Fenster zum Canvas.

```sh
zinc run     # a turning star on a gradient sky; click to blow bubbles
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| Datei | Was sie tut |
|---|---|
| `src/main.ts` | die Frame-Schleife: ein Himmel mit Farbverlauf, ein Stern, gedreht mit `translate` und `rotate`, Blasen, die aufsteigen und verblassen, Text |

Zwei Schreibweisen unterscheiden sich vom Web: Ein Farbverlauf wird mit `ctx.fillGradient = g` gesetzt (nicht mit `ctx.fillStyle = g`), und der Zeiger wird
aus `zinc:gfx` gelesen (`pointerX()`, `pointerY()`, `pointerDown()`) statt mit `addEventListener`. Jede Funktion und die anderen Unterschiede:
https://frulko.github.io/zinc/docs/plugins/canvas2d/
