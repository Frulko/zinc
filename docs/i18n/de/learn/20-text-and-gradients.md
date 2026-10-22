---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 20. Text und Farbverläufe

**Das wirst du sehen:** ein Poster für ein Sommerfest. Der Himmel geht von Rosa oben zu hellem Gelb unten über, eine weiche gelbe
Sonne leuchtet in der Mitte, *Summer Fair* steht groß und zentriert da, das Datum sitzt in einer weißen Pille direkt darunter, und zwei kleine
Zeilen nehmen die unteren Ecken ein.

![Ein Poster: "Summer Fair" über einem Himmel von Rosa zu Gelb mit leuchtender Sonne, das Datum in einer weißen Pille](img/20-text-and-gradients.png)

## Der Code

Das Projekt liegt in [`samples/20-text-and-gradients`](samples/20-text-and-gradients/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TITLE = 'Summer Fair';
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());

  // the sky: a linear gradient from the top of the window to the bottom
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#ff9a8b');
  sky.addColorStop(0.6, '#ffc3a0');
  sky.addColorStop(1, '#ffe8c2');
  ctx.fillGradient = sky;                    // on the web: ctx.fillStyle = sky
  ctx.fillRect(0, 0, 640, 400);

  // the sun: a radial gradient, yellow in the middle, fading out at the edge
  const glow = ctx.createRadialGradient(320, 250, 30, 320, 250, 150);
  glow.addColorStop(0, 'rgba(255, 236, 140, 1)');
  glow.addColorStop(1, 'rgba(255, 236, 140, 0)');
  ctx.fillGradient = glow;
  ctx.beginPath();
  ctx.arc(320, 250, 150, 0, 2 * Math.PI);
  ctx.fill();

  // the title, centred: textAlign says which point of the text x is
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(TITLE, 320, 130);

  // a label in a pill: measureText says how wide the text is, the pill is drawn around it
  ctx.font = '20px sans-serif';
  const words = 'Saturday, 10 am to 6 pm';
  const w = ctx.measureText(words).width;
  ctx.beginPath();
  ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(words, 320, 180);

  // two corners: x is where the text starts (left) or where it ends (right)
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#7b2cbf';
  ctx.textAlign = 'left';
  ctx.fillText('Town square', 24, 370);
  ctx.textAlign = 'right';
  ctx.fillText('Free entry', 616, 370);

  if (!told) {
    ctx.font = 'bold 56px sans-serif';
    console.log(`The title is ${Math.round(ctx.measureText(TITLE).width)} pixels wide, the label ${Math.round(w)}.`);
    told = true;
  }
  ctx.end();
});
```

Das Terminal zeigt (die Zahlen hängen ein wenig von der Schrift ab):

```text
The title is 347 pixels wide, the label 229.
```

## Farbverläufe

Ein **Farbverlauf** (Gradient) ist eine Farbe, die sich auf dem Weg ändert. Du machst einen, gibst ihm Farben an Punkten entlang seiner Länge und malst dann
damit:

- `ctx.createLinearGradient(x0, y0, x1, y1)` ändert sich entlang einer Linie, von (x0, y0) nach (x1, y1). Von (0, 0) nach (0, 400) geht es von oben nach
  unten.
- `ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)` ändert sich von einem Kreis zu einem anderen: hier vom kleinen Kreis mit Radius 30 zum
  großen mit Radius 150, beide um den Mittelpunkt der Sonne.
- `addColorStop(offset, colour)` setzt eine Farbe an eine Stelle entlang des Verlaufs: `0` ist der Anfang, `1` das Ende, `0.6` ein Stück hinter
  der Mitte. Zwischen zwei Stopps gehen die Farben ineinander über. Eine Farbe kann durchsichtig sein: `rgba(255, 236, 140, 0)` ist dasselbe Gelb mit einer
  Deckkraft von 0, sodass die Sonne in den Himmel ausblendet.

Im Web würdest du `ctx.fillStyle = sky` schreiben. Zinc schreibt `ctx.fillGradient = sky`, weil in Zinc ein Feld einen Typ hat und
`fillStyle` ein Text ist. Wenn du `fillStyle` wieder auf eine Farbe setzt (`ctx.fillStyle = 'white'`), endet der Verlauf, wie im Web.

## Text

`ctx.fillText(text, x, y)` schreibt Text in der Farbe von `fillStyle`. Drei Einstellungen sagen, wie:

- `ctx.font` wird wie in CSS geschrieben: `'bold 56px sans-serif'` (fett, 56 Pixel hoch, die serifenlose Schrift, die mit Zinc kommt) oder
  `'20px monospace'`.
- `ctx.textAlign` sagt, welcher Punkt des Textes `x` ist: `'left'` (oder `'start'`, der Standard) sein Anfang, `'center'` seine Mitte,
  `'right'` sein Ende. Mit `textAlign = 'center'` und `x = 320` wird also ein Text in einem Fenster von 640 Pixeln zentriert, egal wie lang er ist.
- `ctx.textBaseline` sagt, welche Linie des Textes `y` ist: `'alphabetic'` (der Standard) die Linie, auf der die Buchstaben sitzen, `'top'` die Oberkante,
  `'middle'` die Mitte. `'middle'` ist der einfache Weg, Text in einer Box zu zentrieren: `y` ist die Mitte der Box.

`ctx.measureText(text).width` sagt, wie breit ein Text mit der aktuellen Schrift sein wird, bevor du ihn zeichnest: hier, um die weiße Pille so zu bemessen,
dass das Datum mit 18 Pixeln auf jeder Seite hineinpasst.

## Zeile für Zeile

- `const sky = ctx.createLinearGradient(0, 0, 0, 400);` ein Verlauf von der Oberkante des Fensters zur Unterkante.
- `sky.addColorStop(0, '#ff9a8b'); sky.addColorStop(0.6, '#ffc3a0'); sky.addColorStop(1, '#ffe8c2');` Rosa oben, Pfirsich ein
  Stück unter der Mitte, helles Gelb unten.
- `ctx.fillGradient = sky; ctx.fillRect(0, 0, 640, 400);` das ganze Fenster, mit dem Verlauf gemalt.
- `ctx.createRadialGradient(320, 250, 30, 320, 250, 150);` innerhalb des Radius 30 die erste Farbe, jenseits von 150 die letzte, dazwischen ein Übergang.
- `ctx.arc(320, 250, 150, 0, 2 * Math.PI); ctx.fill();` die Scheibe, auf die das Leuchten gemalt wird: so groß wie der äußere Kreis des Verlaufs, sodass
  ihr Rand völlig durchsichtig ist und nicht zu sehen.
- `ctx.font = 'bold 56px sans-serif'; ctx.fillText(TITLE, 320, 130);` der Titel, seine Mitte bei x = 320, auf der Linie
  y = 130 sitzend.
- `const w = ctx.measureText(words).width;` die Breite des Datums in der 20-Pixel-Schrift.
- `ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);` die Pille: so breit wie der Text plus 18 Pixel auf jeder Seite, 40 hoch, runde
  Enden (ein Radius von der halben Höhe).
- `ctx.textBaseline = 'middle'; ctx.fillText(words, 320, 180);` das Datum, in der Pille in beide Richtungen zentriert: 180 ist die Mitte der Pille
  (160 + 40 / 2).
- `ctx.textAlign = 'left'; ctx.fillText('Town square', 24, 370);` beginnt 24 Pixel vom linken Rand.
  `ctx.textAlign = 'right'; ctx.fillText('Free entry', 616, 370);` endet 24 Pixel vom rechten Rand.

## Probier das aus

- Mach den Himmel zu einem Sonnenuntergang: ein linearer Verlauf von links nach rechts, `createLinearGradient(0, 0, 640, 0)`, von Orange zu Violett.
- Male den Titel mit einem Verlauf: `ctx.fillGradient = ...` vor seinem `fillText`. Zinc zeichnet Text in der ersten Farbe des Verlaufs
  (ein Unterschied zum Web, aufgelistet auf [der Seite zu zinc:canvas](../plugins/canvas2d.md#deviations-from-the-web)).
- Füge unter der ersten eine zweite Pille hinzu, *Free entry*, ebenfalls mit `measureText` bemessen.
- Schreibe deinen Namen unten in die Mitte, mit `textAlign = 'center'`.
- Lass die Sonne pulsieren: Gib dem radialen Verlauf einen äußeren Radius von `150 + 20 * Math.sin(time)`, mit einer `time`, die um `dt` wächst.

## Wie es weitergeht

Du kannst mit dem Canvas des Webs zeichnen: Pfade, Füllungen und Umrisse, Transformationen, Animationen, Text und Farbverläufe.

- [Die Seite zu zinc:canvas](../plugins/canvas2d.md): jede Funktion, ein Offscreen-`Canvas`, dessen Pixel zwischen Frames erhalten bleiben, Bilder und
  die Unterschiede zum Web.
- `zinc new canvas` macht eine Skizze zum Weiterbauen: ein Himmel mit Farbverlauf, ein drehender Stern, Blasen dort, wo du klickst.
- [`examples/canvas/sketch`](../../examples/canvas/sketch/main.tsx) im Repository: eine Uhr, ein Feuerwerk und Formen, gezeichnet in Canvases
  innerhalb einer Oberfläche.
- [Zeichne es mit dem Canvas des Webs](../start/beyond.md#draw-it-with-the-webs-canvas): ein Diagramm, mit diesen Aufrufen gezeichnet, in einer
  Box einer Oberfläche, neben seinen Buttons.
- [Vier Wege, ein Programm zu schreiben](../start/styles.md): wie sich das Canvas mit den anderen Stilen mischt. [Zurück zum Anfang des
  Lernpfads](README.md).
