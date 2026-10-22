---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 19. Eine Animation

**Das wirst du sehen:** eine Windmühle auf grünem Gras. Ihre vier roten Flügel drehen sich gleichmäßig, eine Vierteldrehung pro Sekunde, und weiße
Wolken ziehen über den blauen Himmel und kommen links wieder herein, wenn sie rechts hinausgehen.

![Eine Windmühle mit vier roten Flügeln vor einer Wolke, auf grünem Gras](img/19-animation.png)

## Der Code

Das Projekt liegt in [`samples/19-animation`](samples/19-animation/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TURN_SPEED = Math.PI / 2;   // the blades turn a quarter of a turn per second
let angle = 0;                    // how far the blades have turned, in radians
let cloudX = 0;                   // how far the clouds have moved
let time = 0;
let told = false;

function cloud(x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, 2 * Math.PI);
  ctx.arc(x + 30, y - 12, 32, 0, 2 * Math.PI);
  ctx.arc(x + 64, y, 24, 0, 2 * Math.PI);
  ctx.fill();
}

onFrame((dt: number) => {
  time += dt;
  angle += TURN_SPEED * dt;
  cloudX = (cloudX + 40 * dt) % 800;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the blades turned ${Math.round((angle * 180) / Math.PI)} degrees.`);
    told = true;
  }

  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#9fd3f5';                    // every frame starts from an empty sky
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 320, 640, 80);

  ctx.fillStyle = 'white';                      // two clouds drift to the right and come back on the left
  cloud(cloudX - 100, 80);
  cloud(((cloudX + 400) % 800) - 100, 130);

  ctx.beginPath();                              // the tower
  ctx.moveTo(300, 320);
  ctx.lineTo(312, 170);
  ctx.lineTo(328, 170);
  ctx.lineTo(340, 320);
  ctx.closePath();
  ctx.fillStyle = '#e9e6df';
  ctx.fill();

  ctx.save();                                   // the blades: move to the hub, turn by the angle, draw four blades
  ctx.translate(320, 170);
  ctx.rotate(angle);
  ctx.fillStyle = '#e63946';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -20);
    ctx.lineTo(10, -120);
    ctx.lineTo(-6, -120);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(320, 170, 9, 0, 2 * Math.PI);
  ctx.fillStyle = '#1d1b18';
  ctx.fill();
  ctx.end();
});
```

Nach einer Sekunde zeigt das Terminal:

```text
After 1.00 seconds the blades turned 90 degrees.
```

## Eine Animation ist ein Bild, immer wieder

Um ein Canvas zu bewegen, gibt es nichts Neues zu lernen: Es ist das Daumenkino aus Lektion 2. In jedem Frame gibt dir `onFrame` `dt`,
die Zeit seit dem letzten Frame; du bewegst deine Zahlen um eine Geschwindigkeit mal `dt` weiter und zeichnest dann das ganze Bild neu, vom Himmel aufwärts.
Das Canvas merkt sich nicht, was es im Frame davor gezeichnet hat (im Web würdest du zuerst `clearRect` aufrufen; hier deckt das `fillRect` des Himmels
alles zu).

Zwei Dinge merkt sich das Canvas **sehr wohl** von einem Frame zum nächsten: seine Einstellungen und seine Transformation. Ein `translate` oder ein `rotate`, das
nicht rückgängig gemacht wird, ist im nächsten Frame noch da, und im übernächsten, und addiert sich: Die Windmühle würde davonfliegen. Deshalb werden die Flügel
zwischen `save()` und `restore()` gezeichnet. Dasselbe gilt für `fillStyle` oder `lineWidth`: Setze, was du brauchst, bevor du zeichnest.

Der Winkel wächst für immer (90 Grad nach einer Sekunde, 900 nach zehn); eine Drehung von 900 Grad sieht genauso aus wie eine von 180, also
muss ihn nichts zurückholen. Die Wolken brauchen das schon: `%` (der Rest einer Division) bringt `cloudX` auf 0 zurück, wenn es
800 erreicht.

## Zeile für Zeile

- `const TURN_SPEED = Math.PI / 2;` eine Vierteldrehung (die Hälfte von `Math.PI`, was eine halbe Umdrehung ist) pro Sekunde.
- `angle += TURN_SPEED * dt;` Die Flügel drehen sich um die Geschwindigkeit mal die Zeit des Frames, also drehen sie sich auf einem langsamen Rechner genauso schnell wie
  auf einem schnellen.
- `cloudX = (cloudX + 40 * dt) % 800;` Die Wolken bewegen sich 40 Pixel pro Sekunde; hinter 800 beginnen sie wieder bei 0.
- `Math.round((angle * 180) / Math.PI)` rechnet für die Meldung Bogenmaß in Grad um: Eine halbe Umdrehung ist `Math.PI` Radiant, 180 Grad.
- `function cloud(x, y)` drei Kreise in einem Pfad, auf einmal gefüllt: eine Wolke. `arc` fügt dem Pfad einen Kreis hinzu, ohne den
  Stift abzuheben, und die Füllung deckt alle drei ab.
- `cloud(cloudX - 100, 80);` Die erste Wolke beginnt 100 Pixel links vom Fenster, sie gleitet also herein, statt aufzutauchen.
- `cloud(((cloudX + 400) % 800) - 100, 130);` Die zweite Wolke liegt 400 Pixel hinter der ersten, auf derselben Schleife.
- `ctx.moveTo(300, 320); ... ctx.closePath();` der Turm: oben schmaler als unten.
- `ctx.translate(320, 170); ctx.rotate(angle);` Die Nabe der Windmühle wird zu `(0, 0)`, um den Winkel gedreht.
- `ctx.moveTo(0, 0); ctx.lineTo(18, -20); ctx.lineTo(10, -120); ctx.lineTo(-6, -120);` ein Flügel, der von der Nabe nach oben zeigt.
  `ctx.rotate(Math.PI / 2)` dreht eine Viertelumdrehung: Die Schleife zeichnet die vier Flügel mit denselben Linien.
- `ctx.restore();` macht das translate und die vier Drehungen auf einmal rückgängig, zurück zur Ecke des Fensters.
- `ctx.arc(320, 170, 9, ...)` die schwarze Nabe, zuletzt gezeichnet, obenauf auf den Flügeln.

## Probier das aus

- Lass den Wind stärker wehen: Verdopple `TURN_SPEED` und die Geschwindigkeit der Wolken.
- Lass die Flügel in die andere Richtung drehen: Subtrahiere statt zu addieren.
- Entferne `ctx.save()` und `ctx.restore()` und führe es aus: Die Verschiebungen und Drehungen addieren sich Frame für Frame, und die Flügel fliegen aus dem
  Fenster.
- Lass einen Klick die Flügel beschleunigen: Lies `pointerDown()` aus `zinc:gfx`, wie auf der [Seite zu den Stilen](../start/styles.md), und addiere bei jedem Drücken zur
  Geschwindigkeit. Bremse sie dann in jedem Frame ein wenig ab: `speed *= 0.99`.
- Mach es Nacht: ein dunkler Himmel, ein Mond (ein Kreis) und ein paar Sterne (kleine `fillRect`s an festen Stellen).

## Weiter

[20. Text und Farbverläufe](20-text-and-gradients.md): ein Poster mit einem Himmel, der von einer Farbe in eine andere übergeht, einer leuchtenden Sonne und
zentriertem Text.
