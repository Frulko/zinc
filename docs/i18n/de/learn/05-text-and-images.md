---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 5. Text und Bilder

**Das wirst du sehen:** ein Titel oben in der Mitte, eine Rakete, die auf und ab wippt, und zwei Zeilen kleineren Text
unten, von denen eine die Sekunden zählt.

![Eine Rakete unter dem Titel "Hello, space"](img/05-text-and-images.png)

## Der Code

Das Projekt liegt in [`samples/05-text-and-images`](samples/05-text-and-images/). Es hat einen dritten Teil: einen Ordner `assets`
mit dem Bild `rocket.svg`. `zinc.json` nennt diesen Ordner:

```json
{
  "name": "text-and-images",
  "entry": "src/main.ts",
  "assets": "assets",
  "app": { "id": "com.example.learn.text", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts`:

```ts
import { onFrame, clear, font, drawText, textWidth, lineHeight, image, imageWidth, imageHeight, drawImage, width, height } from 'zinc:gfx';

const title = font('sans-bold', 40);
const body = font('sans', 18);
const rocket = image('rocket.svg');   // the file assets/rocket.svg

console.log(`The rocket picture is ${imageWidth(rocket)} by ${imageHeight(rocket)} pixels.`);

let time = 0;

onFrame((dt: number) => {
  time += dt;
  clear(0x1c1b20);

  // A title in the middle: measure it, then start half of what is left from the left edge.
  const words = 'Hello, space';
  const w = textWidth(title, words, 0);
  drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);

  // Two lines of smaller text, one under the other.
  const left = 40;
  let y = height() - 2 * lineHeight(body) - 30;
  drawText(body, left, y, 'Pictures come from the assets folder.', 0xbcb6ab, 255, 0);
  y += lineHeight(body);
  drawText(body, left, y, `Flight time: ${Math.floor(time)} s`, 0xbcb6ab, 255, 0);

  // The picture, bobbing up and down, drawn at twice its size.
  const size = imageWidth(rocket) * 2;
  const bob = Math.sin(time * 3) * 10;
  drawImage(rocket, (width() - size) / 2, height() / 2 - size / 2 + bob, size, size, 255, 0);
});
```

Das Terminal zeigt `The rocket picture is 96 by 96 pixels.`

## Schriften

Bevor du schreibst, forderst du eine Schrift an: eine Familie und eine Größe in Pixeln, einmal, am Anfang. Zinc gibt eine Zahl zurück, die
für diese Schrift steht, und jeder Textaufruf benutzt diese Zahl. Die Familien, die mit Zinc kommen:

| Familie | Sieht aus wie |
|---|---|
| `'sans'` | schlichte Buchstaben (Inter) |
| `'sans-bold'` | dasselbe, fett |
| `'mono'` | jeder Buchstabe so breit wie die anderen, für Code (JetBrains Mono) |

Eine eigene Schrift: Lege eine `.ttf`-Datei in `assets` und rufe `loadFont('MyFont.ttf', 32)` auf.

## Zeile für Zeile

- `const title = font('sans-bold', 40);` eine fette Schrift, 40 Pixel hoch. `body` ist eine normale mit 18.
- `const rocket = image('rocket.svg');` ein Bild aus dem Ordner `assets`, über seinen Dateinamen. PNG und SVG funktionieren. Wie bei einer
  Schrift bekommst du eine Zahl, die für das Bild steht. Fehlt die Datei, ist die Zahl `-1`, und es wird nichts gezeichnet.
- `imageWidth(rocket)`, `imageHeight(rocket)`: die Größe des Bildes in Pixeln.
- `const w = textWidth(title, words, 0);` wie breit die Wörter in dieser Schrift sein werden, bevor du sie zeichnest. Das letzte
  Argument ist zusätzlicher Abstand zwischen den Buchstaben, 0 für keinen.
- `drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);` schreibt die Wörter. Die Argumente: die Schrift, x und
  y der oberen linken Ecke des Textes, die Wörter, die Farbe, die Deckkraft, der zusätzliche Abstand zwischen den Buchstaben.
  `(width() - w) / 2` zentriert den Text: Was von der Breite übrig bleibt, wird halbiert und auf beide Seiten verteilt.
- `lineHeight(body)` ist die Höhe einer Zeile in dieser Schrift, mit dem Abstand zwischen den Zeilen. Das Programm beginnt zwei Zeilen
  und einen Rand über dem unteren Rand und geht dann für die zweite Zeile eine Zeilenhöhe nach unten.
- `` `Flight time: ${Math.floor(time)} s` `` baut den Text in jedem Frame neu. `Math.floor` schneidet ab, was nach dem Komma kommt,
  sodass sich die Zahl einmal pro Sekunde ändert.
- `drawImage(rocket, x, y, size, size, 255, 0);` zeichnet das Bild in eine Box: x, y, Breite, Höhe, Deckkraft und der
  Radius abgerundeter Ecken (0: eckige Ecken). Die Box ist doppelt so groß wie das Bild, es wird also doppelt so groß gezeichnet. Ein SVG-Bild
  ist eine Zeichnung, keine Punkte, es bleibt also scharf.
- `Math.sin(time * 3) * 10` lässt die Rakete 10 Pixel auf und ab gehen, dreimal schneller als eine Sekunde.

## Probier das aus

- Schreibe deinen Namen unter den Titel, ebenfalls zentriert.
- Lass den Titel einblenden: eine Deckkraft von `Math.min(255, time * 100)`.
- Schreibe einen langen Satz und brich ihn selbst um: Teile ihn in Wörter, miss jedes mit `textWidth` und beginne eine neue Zeile,
  wenn das nächste Wort nicht mehr passt (das *Text*-Beispiel von Atelier macht das).
- Zeichne die Rakete kleiner, viele Male, an zufälligen Stellen: `Math.random() * width()`. Wähle die Stellen einmal vor
  `onFrame`, sonst springen sie in jedem Frame.
- Zeichne dein eigenes Bild in einem beliebigen Vektoreditor (Inkscape, Figma), exportiere es als SVG nach `assets` und zeige es.
- Drehe die Rakete mit den Pfeiltasten: `drawImageRect` nimmt eine Drehung an (die [Referenz](../reference/gfx.md#images)
  zeigt, wie).

## Weiter

[6. Sound](06-sound.md): Töne spielen.
