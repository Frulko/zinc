---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 17. Pfade und Füllungen

**Das wirst du sehen:** ein Haus auf grünem Gras unter blauem Himmel: cremefarbene Wände mit braunem Umriss, ein rotes Dach, eine Tür mit
runden Ecken, ein Fenster mit Kreuz, ein Weg, der sich durch das Gras schlängelt, und eine gelbe Sonne.

![Ein Haus mit rotem Dach, einer Tür, einem Fenster und einem gekrümmten Weg, unter blauem Himmel mit gelber Sonne](img/17-paths-and-fills.png)

Teil 4 zeichnet mit dem **Canvas des Webs**: dem `CanvasRenderingContext2D`, den Webseiten benutzen, um in ein `<canvas>` zu zeichnen. Wenn du
einem Canvas-Tutorial auf MDN gefolgt bist oder in JavaScript Diagramme gezeichnet hast, kennst du diese Aufrufe schon. In Zinc gibt es keine Seite und kein
`<canvas>`-Element: Das Fenster ist das Canvas, und die Frame-Schleife aus Teil 1 ruft deine Zeichnung auf. Es nutzt das Modul `zinc:canvas`.

## Der Code

Das Projekt liegt in [`samples/17-paths-and-fills`](samples/17-paths-and-fills/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());   // the canvas is the whole window

  // the sky and the grass: rectangles
  ctx.fillStyle = '#bde0fe';
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 300, 640, 100);

  // the sun: a full circle
  ctx.beginPath();
  ctx.arc(540, 80, 44, 0, 2 * Math.PI);
  ctx.fillStyle = 'gold';
  ctx.fill();

  // the walls of the house, filled then outlined
  ctx.fillStyle = '#f4e1c1';
  ctx.fillRect(220, 180, 200, 140);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5c4033';
  ctx.strokeRect(220, 180, 200, 140);

  // the roof: a path of three points, closed
  ctx.beginPath();
  ctx.moveTo(200, 184);
  ctx.lineTo(320, 90);
  ctx.lineTo(440, 184);
  ctx.closePath();
  ctx.fillStyle = '#c0392b';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!told) {
    console.log(`Is 320, 140 in the roof? ${ctx.isPointInPath(320, 140)}. And 120, 140? ${ctx.isPointInPath(120, 140)}.`);
  }

  // the door: a rectangle with round corners
  ctx.beginPath();
  ctx.roundRect(295, 240, 50, 80, 10);
  ctx.fillStyle = '#8e5a3c';
  ctx.fill();

  // a window: two lines make the cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(245, 210, 40, 40);
  ctx.strokeRect(245, 210, 40, 40);
  ctx.beginPath();
  ctx.moveTo(265, 210);
  ctx.lineTo(265, 250);
  ctx.moveTo(245, 230);
  ctx.lineTo(285, 230);
  ctx.lineWidth = 2;
  ctx.stroke();

  // a path in the grass: a curve
  ctx.beginPath();
  ctx.moveTo(320, 320);
  ctx.quadraticCurveTo(300, 360, 360, 400);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d9c5a0';
  ctx.stroke();

  ctx.end();
  told = true;
});
```

Das Terminal zeigt:

```text
Is 320, 140 in the roof? true. And 120, 140? false.
```

## Ein Stift mit Einstellungen

Das Canvas zeichnet wie ein Stift, den du vor jeder Linie einstellst:

1. **Wähle die Farbe.** `ctx.fillStyle` ist die Farbe, die Formen füllt, `ctx.strokeStyle` die Farbe der Umrisse,
   `ctx.lineWidth` wie dick Umrisse sind. Farben werden wie im Web geschrieben: `'#c0392b'`, `'gold'`, `'rgb(255, 120, 60)'`,
   `'rgba(0, 0, 0, 0.5)'` (halb durchsichtig).
2. **Baue einen Pfad.** `ctx.beginPath()` beginnt einen neuen. `moveTo(x, y)` hebt den Stift ab und setzt ihn an einem Punkt wieder auf; `lineTo(x, y)`
   zeichnet eine gerade Linie zu einem anderen; `arc(x, y, radius, start, end)` ein Stück Kreis; `quadraticCurveTo` und `bezierCurveTo`
   Kurven; `rect` und `roundRect` ganze Rechtecke; `closePath()` geht zurück zum ersten Punkt. Noch ist nichts zu sehen: Ein Pfad ist nur ein
   Plan.
3. **Male ihn.** `ctx.fill()` füllt das Innere des Pfads mit `fillStyle`; `ctx.stroke()` zeichnet seinen Umriss mit `strokeStyle`
   und `lineWidth`. Du kannst beides auf demselben Pfad tun.

Rechtecke sind so häufig, dass sie Kurzformen haben, die keinen Pfad brauchen: `fillRect(x, y, w, h)` und `strokeRect(x, y, w, h)`.

Die Einstellungen bleiben, bis du sie änderst: Nach `ctx.lineWidth = 4` ist jeder Umriss 4 Pixel dick, in diesem Frame und in den nächsten
(im Web auch). Deshalb setzt dieses Programm die Linienbreite vor jedem Umriss, der eine andere braucht.

`ctx.begin(0, 0, width(), height())` und `ctx.end()` sind Zincs eigene: Sie sagen "das Canvas ist für diesen Frame das ganze Fenster".
Alles, was du zeichnest, steht zwischen den beiden.

## Zeile für Zeile

- `import { onFrame, width, height } from 'zinc:gfx';` die Frame-Schleife und die Größe des Fensters, aus Teil 1. `zinc:canvas` zeichnet
  nur.
- `const ctx = new CanvasRenderingContext2D();` der Kontext: der Stift und seine Einstellungen. Im Web würdest du
  `canvas.getContext('2d')` schreiben; hier machst du ihn selbst, einmal.
- `ctx.fillStyle = '#bde0fe'; ctx.fillRect(0, 0, 640, 400);` malt das ganze Fenster hellblau: Jeder Frame beginnt beim
  Himmel, so wie `clear` in Teil 1.
- `ctx.arc(540, 80, 44, 0, 2 * Math.PI);` ein Kreis um (540, 80) mit dem Radius 44: ein Bogen vom Winkel 0 bis zu einer ganzen Umdrehung,
  `2 * Math.PI`. `fill()` macht daraus eine Scheibe.
- `ctx.strokeRect(220, 180, 200, 140);` der Umriss der Wände, über das gefüllte Rechteck gezeichnet. Ein Umriss ist auf der
  Kante zentriert: Die Hälfte seiner 4 Pixel fällt nach innen, die Hälfte nach außen.
- `ctx.moveTo(200, 184); ctx.lineTo(320, 90); ctx.lineTo(440, 184); ctx.closePath();` das Dach: ein Dreieck, von der linken
  Ecke nach oben zur Spitze, hinunter zur rechten Ecke und zurück.
- `ctx.lineJoin = 'round';` die Ecken eines Umrisses: `'miter'` (spitz, der Standard), `'round'` oder `'bevel'` (abgeschnitten).
- `ctx.isPointInPath(320, 140)` fragt, ob ein Punkt im aktuellen Pfad liegt, hier im Dach. So weiß ein Canvas-Programm,
  dass ein Klick auf einer Form gelandet ist (die [Seite zu den Stilen](../start/styles.md#canvas-zinccanvas) benutzt es an einem Ball).
- `ctx.roundRect(295, 240, 50, 80, 10);` ein Rechteck mit Ecken vom Radius 10, einem neuen Pfad hinzugefügt.
- `ctx.moveTo(265, 210); ctx.lineTo(265, 250); ctx.moveTo(245, 230); ctx.lineTo(285, 230);` ein Pfad mit zwei getrennten Linien:
  `moveTo` hebt den Stift dazwischen ab. Ein `stroke()` zeichnet beide.
- `ctx.quadraticCurveTo(300, 360, 360, 400);` eine Kurve vom aktuellen Punkt (320, 320) zu (360, 400), auf dem Weg zu
  (300, 360) hingezogen, wie ein Magnet sie ziehen würde.
- `ctx.lineCap = 'round';` die Enden einer offenen Linie: `'butt'` (am Ende flach abgeschnitten, der Standard), `'round'` oder `'square'`.
- `told = true;` die Zeile wird nur im ersten Frame ausgegeben.

## Probier das aus

- Male die Sonne mit einem dicken orangen Umriss: `ctx.lineWidth = 6; ctx.strokeStyle = 'orange'; ctx.stroke();` nach ihrem `fill()`.
- Zeichne ein zweites Fenster rechts von der Tür.
- Füge dem Dach einen Schornstein hinzu: ein `fillRect`, das vor dem Dach gezeichnet wird, sodass das Dach seinen unteren Teil verdeckt.
- Zeichne mit einer Schleife einen Zaun entlang des Grases: `for (let x = 10; x < 640; x += 30) ctx.fillRect(x, 280, 8, 40);`.
- Ersetze die quadratische Kurve durch `ctx.bezierCurveTo(260, 350, 420, 370, 360, 400)`: zwei Magnete, ein S-förmiger Weg.
- Jede Funktion des Kontexts und die wenigen Unterschiede zum Web stehen auf [der Seite zu zinc:canvas](../plugins/canvas2d.md).

## Weiter

[18. Transformationen](18-transforms.md): das Papier unter dem Stift verschieben, drehen und verkleinern und eine Uhr zeichnen.
