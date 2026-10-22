---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 18. Transformationen

**Das wirst du sehen:** zwei Bahnhofsuhren, die zehn nach zehn zeigen, eine große rechts und eine kleine Kopie oben links, jede mit
sechzig Strichen, einem Stundenzeiger, einem Minutenzeiger und einem roten Sekundenzeiger.

![Eine große und eine kleine Uhr, beide auf zehn nach zehn](img/18-transforms.png)

## Der Code

Das Projekt liegt in [`samples/18-transforms`](samples/18-transforms/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const HOURS = 10, MINUTES = 10;
let told = false;

// One hand, drawn straight up from the centre, after turning by `turn` (0 to 1: a whole turn).
function hand(turn: number, length: number, thickness: number, color: string): void {
  ctx.save();                                   // remember the transform...
  ctx.rotate(turn * 2 * Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(0, -length);
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();                                // ...and go back to it
}

// A clock of radius 150 around (0, 0): wherever the transform puts (0, 0).
function clock(): void {
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d1b18';
  ctx.stroke();

  for (let i = 0; i < 60; i++) {                // 60 ticks: draw one at the top, turn by a sixtieth, again
    ctx.beginPath();
    ctx.moveTo(0, -136);
    ctx.lineTo(0, i % 5 === 0 ? -112 : -126);
    ctx.lineWidth = i % 5 === 0 ? 6 : 2;
    ctx.stroke();
    ctx.rotate((2 * Math.PI) / 60);
  }                                             // 60 sixtieths: a whole turn, back where it started

  hand((HOURS + MINUTES / 60) / 12, 70, 10, '#1d1b18');
  hand(MINUTES / 60, 110, 6, '#1d1b18');
  hand(0.25, 120, 2, '#e63946');
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#e63946';
  ctx.fill();
}

// Where the transform puts (0, 0), and how much it scales: e and f, and a (a is the scale when nothing is turned).
function tell(where: string): void {
  const m = ctx.getTransform();
  console.log(`${where}, (0, 0) is at ${m.e}, ${m.f} and the scale is ${m.a.toFixed(2)}.`);
}

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#f3f1ec';
  ctx.fillRect(0, 0, 640, 400);

  ctx.save();
  ctx.translate(410, 200);                      // (0, 0) is now the middle of the big clock
  clock();
  if (!told) tell('In the big clock');
  ctx.restore();

  ctx.save();
  ctx.translate(110, 110);                      // the small clock: move, then make everything smaller
  ctx.scale(0.45, 0.45);
  clock();
  if (!told) tell('In the small clock');
  ctx.restore();

  if (!told) tell('After restore');
  ctx.end();
  told = true;
});
```

Das Terminal zeigt:

```text
In the big clock, (0, 0) is at 410, 200 and the scale is 1.00.
In the small clock, (0, 0) is at 110, 110 and the scale is 0.45.
After restore, (0, 0) is at 0, 0 and the scale is 1.00.
```

## Das Papier bewegen

Sechzig Striche mit `Math.cos` und `Math.sin` um einen Kreis zu zeichnen, funktioniert, ist aber viel Rechnerei. Ein Canvas hat einen einfacheren Weg:
Statt den Stift zu bewegen, **bewegst du das Papier**. Eine Transformation ändert, wo alles landet, was danach gezeichnet wird:

- `ctx.translate(x, y)` verschiebt das Papier: `(0, 0)` liegt jetzt dort, wo vorher `(x, y)` war.
- `ctx.rotate(angle)` dreht das Papier um `(0, 0)`, um einen Winkel im Bogenmaß (eine ganze Umdrehung ist `2 * Math.PI`), im Uhrzeigersinn.
- `ctx.scale(sx, sy)` macht alles größer oder kleiner: `0.45` ist ein bisschen weniger als die Hälfte. Auch Linienbreiten schrumpfen.

Sie addieren sich: `translate(110, 110)` und dann `scale(0.45, 0.45)` setzt `(0, 0)` auf (110, 110) und zeichnet mit 45 %. Die Uhr wird also einmal
um `(0, 0)` geschrieben, als wäre sie allein auf der Seite; wo sie landet und wie groß sie wird, wird entschieden, bevor man sie aufruft.

Die Striche nutzen das: Zeichne einen Strich gerade nach oben, drehe das Papier um ein Sechzigstel einer Umdrehung, zeichne denselben Strich noch einmal, sechzigmal. Nach
sechzig Drehungen um ein Sechzigstel ist das Papier wieder dort, wo es angefangen hat.

`ctx.save()` merkt sich die Transformation (und die Farben und Linieneinstellungen); `ctx.restore()` geht zurück zu dem, was gespeichert wurde. Jeder Zeiger
dreht das Papier um seinen eigenen Winkel, zwischen einem `save` und einem `restore`, sodass der nächste Zeiger vom aufrechten Papier ausgeht. Saves können
in Saves stehen, wie der Zeiger in der Uhr: Jedes `restore` macht das letzte `save` rückgängig.

`ctx.getTransform()` gibt die Transformation als sechs Zahlen, `a` bis `f`: `e` und `f` sind, wo `(0, 0)` landet, `a` und `d` der Maßstab, wenn
nichts gedreht ist. Das Programm gibt sie aus, um die drei Zustände zu zeigen.

## Zeile für Zeile

- `const HOURS = 10, MINUTES = 10;` die Zeit, die die Uhren zeigen.
- `function hand(turn, length, thickness, color)` zeichnet einen Zeiger. `turn` geht von 0 (gerade nach oben, zwölf Uhr) bis 1 (eine ganze
  Umdrehung).
- `ctx.rotate(turn * 2 * Math.PI);` dreht das Papier um diesen Anteil einer ganzen Umdrehung.
- `ctx.moveTo(0, 16); ctx.lineTo(0, -length);` eine Linie von ein wenig unterhalb der Mitte bis `length` Pixel darüber. Auf dem Papier
  ist sie immer gerade nach oben; die Drehung lässt sie auf die Stunde zeigen.
- `function clock()` zeichnet eine ganze Uhr um `(0, 0)`: das Zifferblatt, die Striche, die Zeiger und die rote Mitte.
- `ctx.lineTo(0, i % 5 === 0 ? -112 : -126);` jeder fünfte Strich (`i % 5 === 0`: `i` durch 5 geteilt lässt keinen Rest) ist länger und
  dicker: die Stunden.
- `hand((HOURS + MINUTES / 60) / 12, ...)` der Stundenzeiger: 10 Stunden und 10 Minuten sind 10,17 Stunden, von 12 für eine Umdrehung.
- `hand(MINUTES / 60, ...)` der Minutenzeiger: 10 Minuten von 60. `hand(0.25, ...)` der Sekundenzeiger bei einem Viertel: 15 Sekunden.
- `ctx.save(); ctx.translate(410, 200); clock(); ... ctx.restore();` die große Uhr, mit ihrer Mitte bei (410, 200).
- `ctx.translate(110, 110); ctx.scale(0.45, 0.45);` die kleine Uhr: dieselbe `clock()`, verschoben und verkleinert. Die Reihenfolge zählt: Das
  translate gilt in Fensterpixeln; das scale verkleinert dann, was danach kommt.
- `if (!told) tell('After restore');` Nach dem letzten `restore` ist das Papier wieder normal: `(0, 0)` ist die Ecke des Fensters.

## Probier das aus

- Füge eine dritte Uhr hinzu, auf dem Kopf: `ctx.rotate(Math.PI)` nach ihrem `translate`.
- Zeige die echte Zeit: `const now = new Date();`, dann `now.getHours()`, `now.getMinutes()`, `now.getSeconds()`, und bewege den
  Sekundenzeiger mit `now.getSeconds() / 60`.
- Mach die große Uhr breiter als hoch: `ctx.scale(1.3, 1)` nach ihrem `translate`. Sieh, was mit den Strichen passiert.
- Vergiss ein `ctx.restore()` in `hand` und schau hin: Jeder Zeiger dreht sich von dort aus, wo der davor aufgehört hat.
- Schreibe Zahlen auf das Zifferblatt: in der Schleife, bei jedem fünften Strich, `ctx.fillText(...)` (Lektion 20 zeigt, wie du die Schrift setzt und Text
  zentrierst).

## Weiter

[19. Eine Animation](19-animation.md): eine Windmühle, deren Flügel sich drehen, und Wolken, die vorbeiziehen, Frame für Frame.
