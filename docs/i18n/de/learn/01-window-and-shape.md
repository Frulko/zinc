---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 1. Ein Fenster und eine Form

**Das wirst du sehen:** ein Fenster mit hellem Hintergrund, ein violettes Rechteck in der oberen linken Ecke und ein rosa Kreis in
der Mitte.

![Ein violettes Rechteck und ein rosa Kreis auf hellem Hintergrund](img/01-window-and-shape.png)

## Der Code

Ein Zinc-Programm ist ein Ordner mit zwei Dateien. Das Projekt liegt in
[`samples/01-window-and-shape`](samples/01-window-and-shape/).

`zinc.json` beschreibt das Projekt:

```json
{
  "name": "window-and-shape",
  "entry": "src/main.ts",
  "app": { "id": "com.example.learn.shape", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts` ist das Programm:

```ts
import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';

console.log(`The window is ${width()} by ${height()} pixels.`);

onFrame((dt: number) => {
  clear(0xf3f1ec);
  rect(40, 40, 160, 100, 0x5746e0);
  rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);
});
```

Führe es aus:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Das Fenster öffnet sich, und das Terminal zeigt `The window is 640 by 400 pixels.`

## Zeile für Zeile

**`zinc.json`**

- `"name"`: der Name des Programms. Der Titel des Fensters benutzt ihn.
- `"entry"`: die Datei, in der das Programm beginnt.
- `"app"`: Angaben zur App. `"id"` ist ein Name, den keine andere App benutzt, rückwärts geschrieben wie eine Webadresse (`com.example...`).
  `"window"` gibt die Größe des Fensters in Pixeln an: 640 breit, 400 hoch.

**`src/main.ts`**

- `import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';`
  Zinc bringt Module mit: Mengen fertiger Funktionen. `zinc:gfx` ist das Modul, das zeichnet. Diese Zeile holt sechs seiner
  Funktionen, damit das Programm sie benutzen kann. Du importierst nur, was du brauchst.
- `console.log(...)` gibt eine Zeile im Terminal aus. Zwischen den Backquotes wird `${width()}` durch den Wert von
  `width()` ersetzt: die Breite des Fensters, 640. Ausgeben ist der einfachste Weg zu sehen, was dein Programm gerade tut.
- `onFrame((dt: number) => { ... });`
  Das ist das Herz des Programms. Du gibst `onFrame` eine Funktion (der Teil von `(dt: number) =>` bis zur schließenden `}`).
  Zinc ruft sie für jeden Frame auf, etwa 60-mal pro Sekunde, so oft, wie sich der Bildschirm aktualisiert. Jeder Aufruf zeichnet das ganze
  Bild neu. Hier ändert sich das Bild nie, du siehst also ein Standbild; die nächste Lektion bringt es in Bewegung.
  `dt` ist die Zeit seit dem letzten Frame. `: number` sagt, dass `dt` eine Zahl ist: Zinc prüft die Typen deiner Werte,
  bevor das Programm läuft.
- `clear(0xf3f1ec);` malt das ganze Fenster in einer Farbe. Farben sind Zahlen, geschrieben als `0xRRGGBB`: zwei Ziffern für Rot,
  zwei für Grün, zwei für Blau, von `00` (nichts) bis `ff` (voll). `0xf3f1ec` ist ein warmes helles Grau. Es ist derselbe Code wie
  `#f3f1ec` im Web, mit `0x` statt `#` davor.
- `rect(40, 40, 160, 100, 0x5746e0);` zeichnet ein gefülltes Rechteck. Die Zahlen sind der Reihe nach: x, y, Breite, Höhe, Farbe.
  x zählt Pixel vom linken Rand des Fensters, y zählt Pixel vom oberen Rand nach unten. Die obere linke Ecke
  dieses Rechtecks ist also 40 Pixel vom linken und 40 vom oberen Rand entfernt, und es ist 160 breit und 100 hoch.
- `rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);` zeichnet ein Rechteck mit abgerundeten Ecken.
  Nach x, y, Breite und Höhe kommen der Radius der Ecken (60) und die Farbe, dann die Deckkraft: 255 ist deckend,
  0 ist unsichtbar, 128 ist halb durchsichtig. Ein Quadrat von 120 mit Ecken von 60 (der halben Größe) ist ein Kreis.
  `width() / 2` ist die Mitte des Fensters; minus 60 (der halbe Kreis) setzt den Mittelpunkt des Kreises genau dorthin.

Die Reihenfolge der Zeichenaufrufe zählt: Was später gezeichnet wird, deckt ab, was vorher gezeichnet wurde. Deshalb kommt `clear` zuerst.

## Probier das aus

- Ändere die Farbe des Hintergrunds in `0x1c1b20` (fast schwarz).
- Verschiebe das Rechteck in die untere rechte Ecke. Tipp: `width() - 200` ist 200 Pixel vom rechten Rand entfernt.
- Mach den Kreis größer (denk daran: Der Radius ist die halbe Größe). Gib ihm dann eine Breite von 200 und lass den Rest: Er
  wird zu einer Pille.
- Gib dem Kreis eine Deckkraft von 128 und schiebe ihn über das Rechteck, um hindurchzusehen.
- Füge `line(0, 0, width(), height(), 0x1d1b18);` hinzu (nimm `line` in die Importzeile auf): eine dünne Linie quer durch das Fenster.
- Ändere die Fenstergröße in `zinc.json`. Der Kreis bleibt in der Mitte, weil der Code `width()` und `height()` benutzt.

## Weiter

[2. Farben und Bewegung](02-colours-and-movement.md): Dinge sanft in Bewegung bringen, auf jedem Rechner gleich schnell.
