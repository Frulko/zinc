---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Vier Wege, ein Programm zu schreiben

Mit Zinc bringst du auf vier Arten etwas auf den Bildschirm. Sie laufen auf derselben Engine, im selben Fenster, mit denselben Befehlen
(`zinc new`, `zinc run`, `zinc dev`); sie unterscheiden sich darin, wie du über den Bildschirm denkst. Wähle den Weg, der sich für dich natürlich anfühlt, oder den,
der zu dem passt, was du machst. Du kannst sie mischen, und du kannst später wechseln: Die Sprache, der Sound, die Dateien und das Netzwerk sind in
allen vieren gleich.

| | Zeichnen | Szene | Canvas | Oberfläche |
| --- | --- | --- | --- | --- |
| Modul | `zinc:gfx` | `zinc:stage` | `zinc:canvas` | `zinc:ui` |
| Wie | Processing, p5.js, LÖVE | ActionScript 3 (Flash), Haxe und OpenFL | das `<canvas>` des Webs | React, Solid, React Native |
| Du schreibst | eine Funktion, die in jedem Frame das ganze Bild zeichnet | Objekte, die sich jeweils selbst zeichnen, in einem Baum | dieselbe Frame-Funktion, mit den Canvas-Aufrufen des Webs | die Elemente des Bildschirms, einmal, in JSX |
| Gut für | Spiele, Animationen, Kunst, ein erstes Programm | Apps und Spiele auf alten Tablets, Objekte, die du antippst und ziehst | Web-Canvas-Code, Vektorzeichnungen, Diagramme | Apps, Formulare, Listen, Einstellungen, Werkzeuge |
| Starte mit | `zinc new game` | `zinc new stage` | `zinc new canvas` | `zinc new desktop-app` |
| Lektionen | [1 bis 6](../learn/README.md#the-lessons) | [13 bis 16](../learn/13-a-stage-and-a-sprite.md) | [17 bis 20](../learn/17-paths-and-fills.md) | [7 bis 12](../learn/07-components.md) |

## Dasselbe Programm, viermal

Ein Ball springt durch das Fenster. Ein Klick (oder ein Tipp) auf den Ball ändert seine Farbe und gibt einen Punkt auf den Punktestand oben links.
Hier ist es in jedem Stil. Die vier Programme sehen gleich aus:

![Ein goldener Ball auf dunklem Hintergrund, "Score: 2" oben links](img/bounce.png)

Jede Version ist ein kleines Projekt in [`docs/start/samples/`](samples/) und läuft wie eine Lektion: `zinc run docs/start/samples/drawing`
(oder `scene`, `canvas`, `interface`). Jedes gibt eine Zeile aus, wenn du den Ball triffst:

```text
hit: score 1, the ball is blue
hit: score 2, the ball is gold
```

### Zeichnen (`zinc:gfx`)

[`samples/drawing/src/main.ts`](samples/drawing/src/main.ts):

```ts
import { onFrame, clear, rrect, font, drawText, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const label = font('sans', 20);

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  // a press on the ball: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown) {
    const dx = pointerX() - x, dy = pointerY() - y;
    if (dx * dx + dy * dy <= R * R) {
      color = (color + 1) % COLORS.length;
      score++;
      console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
    }
  }
  wasDown = down;

  // draw the whole picture again
  clear(0x1c1b20);
  rrect(x - R, y - R, 2 * R, 2 * R, R, COLORS[color], 255);
  drawText(label, 16, 12, `Score: ${score}`, 0xffffff, 255, 0);
});
```

- Alles lebt in Variablen: wo der Ball ist, seine Geschwindigkeit, seine Farbe, der Punktestand.
- Eine Funktion läuft etwa 60-mal pro Sekunde. Sie bewegt den Ball, schaut auf die Maus und malt dann das ganze Fenster neu, vom
  Hintergrund aufwärts.
- Niemand sagt dem Programm Bescheid, wenn geklickt wird: Es fragt in jedem Frame `pointerDown()` ab und vergleicht mit dem Frame davor
  (`wasDown`), um den Moment zu erkennen, in dem die Taste gedrückt wurde. Dann misst es den Abstand zur Mitte des Balls.

### Szene (`zinc:stage`)

[`samples/scene/src/main.ts`](samples/scene/src/main.ts):

```ts
import { onFrame, rrect, font, drawText, width, height } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const label = font('sans', 20);

class Score extends Sprite {
  points: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(label, 0, 0, `Score: ${this.points}`, 0xffffff, 255, 0);
  }
}

class Ball extends Sprite {
  vx: number = 150;           // its speed, in pixels per second
  vy: number = 110;
  color: i32 = 0;             // which colour of COLORS it has
  override onUpdate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > width() - this.width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height() - this.height) this.vy = -this.vy;
    uiState.dirty = true;     // it moved: draw the next frame
  }
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, COLORS[this.color], 255);           // (0, 0) is the ball's own corner
    registerTapZone('ball', 0, 0, w, h, () => this.hit());
  }
  hit(): void {
    this.color = (this.color + 1) % COLORS.length;
    score.points++;
    console.log(`hit: score ${score.points}, the ball is ${NAMES[this.color]}`);
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
const score = new Score('score');
score.x = 16;
score.y = 12;
const ball = new Ball('ball');
ball.x = 70;                  // the corner: the centre is at 100, 80
ball.y = 50;
ball.width = 60;
ball.height = 60;
stage.addChild(ball);
stage.addChild(score);
onFrame((dt: number) => stage.frame(dt));
```

- Der Ball und der Punktestand sind Objekte, jedes eine Klasse mit eigenen Feldern. Die Bühne (Stage) hält sie, so wie eine Bühne Schauspieler hält.
- Jedes Objekt zeichnet sich in seinen eigenen Koordinaten: `(0, 0)` ist die obere linke Ecke des Balls, egal wo der Ball ist. Zinc verschiebt
  die Zeichnung an die richtige Stelle.
- Der Ball sagt beim Zeichnen, wo man ihn antippen kann (`registerTapZone`), und gibt die Funktion an, die aufgerufen werden soll. Die Bühne findet die Zone
  unter dem Finger und ruft `hit()` auf.
- `uiState.dirty = true` fordert ein neues Bild an. Eine Szene, in der sich nichts bewegt, zeichnet überhaupt nichts, und deshalb mögen alte Tablets sie.

### Canvas (`zinc:canvas`)

[`samples/canvas/src/main.ts`](samples/canvas/src/main.ts):

```ts
import { onFrame, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const COLORS = ['#f27aa6', '#5ec2f2', '#e8b06a', '#7bd389'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const ctx = new CanvasRenderingContext2D();

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  ctx.begin(0, 0, width(), height());          // the canvas is the whole window
  ctx.fillStyle = '#1c1b20';
  ctx.fillRect(0, 0, width(), height());

  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  // a press inside the ball's path: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown && ctx.isPointInPath(pointerX(), pointerY())) {
    color = (color + 1) % COLORS.length;
    score++;
    console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
  }
  wasDown = down;
  ctx.fillStyle = COLORS[color];
  ctx.fill();

  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';
  ctx.fillText(`Score: ${score}`, 16, 12);
  ctx.end();
});
```

- Dieselbe Frame-Funktion wie im Zeichenstil; die Zeichenaufrufe sind die des Webs: `fillStyle`, `beginPath`, `arc`, `fill`, `fillText`.
  Code aus einer Webseite oder einem MDN-Tutorial liest sich genauso.
- `ctx.begin(0, 0, width(), height())` macht das ganze Fenster zum Canvas; es gibt keine Seite, kein `<canvas>`-Element und kein JSX.
- Farben sind CSS-Strings (`'#f27aa6'`, `'white'`, `'rgba(0, 0, 0, 0.5)'`).
- Der Klick wird wie im Zeichenstil aus `zinc:gfx` gelesen. Der Canvas beantwortet mit `isPointInPath` die Frage "Liegt dieser Punkt in der Form, die ich
  gerade gebaut habe?".

### Oberfläche (`zinc:ui`)

[`samples/interface/src/main.tsx`](samples/interface/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';

const COLORS = ['bg-[#f27aa6]', 'bg-[#5ec2f2]', 'bg-[#e8b06a]', 'bg-[#7bd389]'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
const [x, setX] = createSignal<number>(100);   // the centre of the ball
const [y, setY] = createSignal<number>(80);
const [color, setColor] = createSignal<i32>(0);
const [score, setScore] = createSignal<i32>(0);
let vx = 150, vy = 110;       // its speed, in pixels per second

function move(dt: number): void {
  setX(x() + vx * dt);
  setY(y() + vy * dt);
  if (x() < R || x() > width() - R) vx = -vx;
  if (y() < R || y() > height() - R) vy = -vy;
}

function hit(): void {
  setColor((color() + 1) % COLORS.length);
  setScore(score() + 1);
  console.log(`hit: score ${score()}, the ball is ${NAMES[color()]}`);
}

function App(): i32 {
  return <View className="w-full h-full">
    <View className={`absolute w-[60px] h-[60px] rounded-full ${COLORS[color()]}`}
      style={{ left: x() - R, top: y() - R }} onClick={hit} />
    <Text className="absolute text-xl text-white" style={{ left: 16, top: 12 }}>{`Score: ${score()}`}</Text>
  </View>;
}

render(App, 0x1c1b20, move);
```

- Der Bildschirm wird einmal beschrieben: eine Box, die das Fenster füllt und eine runde Box (den Ball) und einen Text (den Punktestand) enthält. Das Aussehen
  kommt von `className`, wie bei Tailwind im Web.
- Die Werte, die der Bildschirm zeigt, sind Signale: `setX`, `setColor`, `setScore` ändern sie, und der Ball und der Text folgen von
  selbst. Nichts wird von Hand gezeichnet.
- `onClick={hit}` am Ball: Zinc ruft `hit` auf, wenn der Ball gedrückt und losgelassen wird. Das dritte Argument von `render` wird in
  jedem Frame aufgerufen, hier, um den Ball zu bewegen.
- Eine Oberfläche glänzt bei Textfeldern, Listen, Buttons und Seiten; ein springender Ball ist der schwierigste Fall für sie, und sie braucht trotzdem nur wenige Zeilen.

### Was sich von einem zum anderen ändert

| | Zeichnen | Szene | Canvas | Oberfläche |
| --- | --- | --- | --- | --- |
| Wo der Ball ist | zwei Variablen | `x` und `y` des Sprites | zwei Variablen | zwei Signale |
| Wie der Klick gefunden wird | der Abstand zur Mitte | eine Tipp-Zone, die der Ball angemeldet hat | `isPointInPath` | `onClick` an der Box des Balls |
| Was in einem Frame gezeichnet wird | alles | nur, wenn sich etwas geändert hat | alles | nur, wenn sich ein Signal geändert hat |
| Zeilen | 36 | 49 | 43 | 34 |

## Jeder Stil im Detail

### Zeichnen, wie Processing

**Gut für** ein erstes Programm, Spiele, Animationen, generative Kunst, Visualisierungen; für Leute, die Processing, p5.js, LÖVE oder Pico-8 kennen.

**Wie du denkst:** ein Daumenkino. In jedem Frame beginnst du mit einer leeren Seite und zeichnest alles dorthin, wo es jetzt ist: den Hintergrund,
dann die Formen, dann den Text obenauf. Was sich ändert, lebt in deinen Variablen; etwas zu bewegen heißt, eine Zahl zu ändern.

**Wie Ereignisse zu deinem Code kommen:** Du fragst nach. `pointerX()`, `pointerY()` und `pointerDown()` sagen, wo die Maus oder der erste Finger ist,
`isDown(Btn.Left)`, ob eine Taste oder ein Gamepad-Button gehalten wird, `keyCount()` und `keyName(i)`, welche Tasten seit dem letzten Frame gekommen sind.
Um einen Klick zu sehen, vergleichst du mit dem Frame davor. Nichts ruft dich auf außer dem Frame.

**Auf alten Geräten:** Jeder Frame kostet, was er zeichnet, jedes Mal, auch wenn sich nichts bewegt. Formen, Bilder und ein wenig Text werden
überall schnell neu gezeichnet, so funktionieren Spiele; rufe `keep()` in einem Frame auf, in dem sich nichts geändert hat, um das letzte Bild kostenlos noch einmal zu zeigen.

### Szene, wie ActionScript 3 und Haxe

**Gut für** Apps und Spiele aus vielen Objekten: Karten, die du ziehst, Buttons, die du antippst, Listen, die scrollen, Seiten, die hereingleiten; für Leute, die
Flash-Spiele oder -Apps gemacht haben oder Haxe/OpenFL, Starling oder Pixi kennen. Es ist der Stil, den die Demos von Zinc auf alten Tablets benutzen (der HP TouchPad, das
Nexus 7, ein Raspberry Pi 3: [`examples/music-tree`](../../examples/music-tree/src/main.ts)).

**Wie du denkst:** ein Puppentheater. Jedes Objekt ist eine Klasse, die ihren Platz in ihrem Elternobjekt (`x`, `y`), ihre Größe, ihre Kinder kennt,
weiß, wie sie sich zeichnet (`onDraw`) und was sie in jedem Frame tut (`onUpdate`). Ein Kind bewegt sich mit seinem Elternobjekt. Eine Zeile oder eine Spalte kann
die Kinder für dich anordnen.

**Wie Ereignisse zu deinem Code kommen:** Ein Objekt sagt beim Zeichnen, welches Rechteck einen Tipp (`registerTapZone`) oder ein Ziehen
(`registerDragZone`) annimmt, und gibt die Funktion an, die aufgerufen werden soll. `stage.frame(dt)` findet die oberste Zone unter dem Finger und ruft sie auf. Die Tasten werden
wie im Zeichenstil aus `zinc:gfx` gelesen.

**Auf alten Geräten:** der leichteste der vier. Es wird nichts gezeichnet, solange sich nichts geändert hat (`uiState.dirty`), es gibt kein Stylesheet,
das angewendet werden müsste, und keinen Elementbaum zum Vergleichen; ein ruhender Bildschirm kostet also fast nichts, und ein bewegter kostet, was er zeichnet.

### Canvas, auf die Art des Webs

**Gut für** Leute, die das Canvas des Webs kennen, für Code, der aus einer Webseite oder einem JavaScript-Tutorial übernommen wurde, für Vektorzeichnungen mit Kurven,
Strichen und Farbverläufen, für Diagramme.

**Wie du denkst:** ein Stift mit Einstellungen. Du wählst eine Farbe (`fillStyle`), eine Linienbreite (`lineWidth`), baust dann einen Pfad
(`moveTo`, `lineTo`, `arc`, `bezierCurveTo`) und füllst ihn mit `fill` oder zeichnest ihn mit `stroke`. `translate`, `rotate` und `scale` bewegen das Papier unter dem Stift;
`save` und `restore` stellen es zurück. Die Einstellungen bleiben, bis du sie änderst, sogar im nächsten Frame, wie im Web.

**Wie Ereignisse zu deinem Code kommen:** wie im Zeichenstil, aus `zinc:gfx`; es gibt kein `addEventListener`. `isPointInPath(x, y)` sagt,
ob ein Punkt im gerade gebauten Pfad liegt, was Treffertests auf jeder Form einfach macht.

**Auf alten Geräten:** Jede Kurve wird zu vielen kleinen Segmenten, und jede Form wird mit glatten Kanten (16 Samples pro Pixel) gefüllt, die
Farbverläufe werden Pixel für Pixel berechnet. Ein ganzes Fenster voller Kurven und Farbverläufe in jedem Frame ist für ein Tablet von 2011 die schwerste Arbeit der vier. Halte den
bewegten Teil klein und zeichne, was sich nicht bewegt, einmal in ein Offscreen-`Canvas`, das du mit `drawImage` zeigst
([zinc:canvas](../plugins/canvas2d.md#drawing-targets)).

### Oberfläche, wie React und Solid

**Gut für** Apps: Formulare, Listen, Einstellungen, Werkzeuge, Dashboards, alles mit Textfeldern und Buttons; für Leute, die React, Solid,
React Native oder HTML und CSS mit Tailwind kennen.

**Wie du denkst:** eine Beschreibung. Du sagst einmal, was der Bildschirm enthält, als Boxen in Boxen (`<View>`, `<Text>`, `<Button>`,
`<Image>`), und wie sie aussehen (`className="p-4 rounded-xl bg-white"`). Werte, die sich ändern, sind Signale; ändere eines, und jeder Text und
Stil, der es liest, folgt. Das Layout platziert alles: Du gibst selten ein x oder ein y an.

**Wie Ereignisse zu deinem Code kommen:** durch Attribute an den Elementen: `onClick`, `onPointerDown`, `onKeyDown`, `onInput` ... Zinc ruft deine
Funktion mit dem auf, was passiert ist ([die Ereignisse](../reference/ui-events.md)). Textfelder, Fokus, die Tastatur, Scrollen und Screenreader
sind gleich mit dabei.

**Auf alten Geräten:** die meiste Arbeit pro Element: ein Flexbox-Layout, Styles, Text-Shaping, ein Elementbaum im Speicher. Sie ist die
richtige Wahl für einen Desktop, einen Raspberry Pi 4 oder ein Handy der letzten fünf Jahre; auf einem älteren Tablet schreibst du denselben Bildschirm als Szene
([`examples/GUIDELINES.md`](../../examples/GUIDELINES.md)).

## Wie sie sich mischen

- **Eine Zeichnung in einer Oberfläche.** `<Canvas className="grow" onDraw={fn} />` ist eine Box der Oberfläche, die du selbst zeichnest:
  `fn(x, y, w, h)` bekommt ihren Platz und ihre Größe und zeichnet mit `zinc:gfx`. [Lektion 11](../learn/11-drawing-in-an-interface.md) setzt auf diese Weise eine
  Blume neben Buttons.
- **Ein Canvas in einer Oberfläche.** Dasselbe `<Canvas onDraw>`, mit einem Canvas-Kontext: `ctx.begin(x, y, w, h)` am Anfang von `fn`,
  `ctx.end()` am Ende ([zinc:canvas](../plugins/canvas2d.md)).
- **Ein Canvas in einer Zeichnung.** In einer Frame-Funktion können sich `zinc:gfx`-Aufrufe und ein Canvas-Kontext abwechseln: `ctx.begin(x, y, w, h)`
  gibt dem Kontext seine Box, und was du nach `ctx.end()` zeichnest, kommt obendrauf.
- **Zeichnen und Canvas in einer Szene.** Das `onDraw` eines Sprites zeichnet mit `zinc:gfx` in seinen eigenen Koordinaten; ein Canvas-Kontext funktioniert dort
  auch: `ctx.begin(0, 0, w, h)` zeichnet in den Koordinaten des Sprites und bewegt sich mit ihm.
- **Eine Bühne ist das ganze Fenster**, und das `render` einer Oberfläche ebenso: Ein Programm wählt eins von beiden für seinen Bildschirm. Zeichnen und Canvas
  passen in beide.

Unsicher? Beginne mit dem Zeichenstil und [den Lektionen](../learn/README.md): Jeder andere Stil nutzt, was sie lehren. Um zu wählen, welche
Art von Programm du machen willst (ein Spiel, eine App, ein Server, ein Board), lies [Wähle deine Programmart](choose.md).
