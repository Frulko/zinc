# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.ts` und speichere.
- Lerne den Szenen-Stil, eine Lektion nach der anderen: https://frulko.github.io/zinc/de/docs/learn/13-a-stage-and-a-sprite/
- Die vier Wege, ein Programm zu schreiben: https://frulko.github.io/zinc/de/docs/start/styles/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Eine App aus der Vorlage `stage`: eine Szene aus Objekten (`zinc:stage`), so wie ActionScript 3 (Flash) und Haxe/OpenFL sie schreiben. Eine `Stage`
hält Sprites; jedes Sprite ist eine Klasse, die sich in ihren eigenen Koordinaten zeichnet (`onDraw`), in `onUpdate` weiterrückt und anmeldet, wo
sie einen Tipp oder ein Ziehen annimmt. Eine Spalte und eine Zeile ordnen sie an. Solange sich nichts ändert, wird nichts gezeichnet, und so bleibt es auf einem Tablet von 2011 leichtgewichtig.

```sh
zinc run     # tap a colour, drag the sticker
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| Datei | Was sie tut |
|---|---|
| `src/main.ts` | die Szene: eine Kopfzeile (ein Titel und vier farbige Buttons) über einem Brett, das einen Sticker hält, den du ziehst |

Jede Klasse und Funktion: https://frulko.github.io/zinc/de/docs/reference/stage/. Eine größere App, auf diese Weise für alte Tablets geschrieben:
`examples/music-tree` im Zinc-Repository.
