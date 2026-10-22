---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 14. Kinder und lokale Koordinaten

**Das wirst du sehen:** eine gelbe Sonne in der Mitte des Fensters. Ein kleiner grauer Planet dreht sich schnell um sie; ein blauer Planet,
die Erde, dreht sich langsam weiter außen, mit ihrem Namen darunter und einem kleinen Mond, der sich um sie dreht.

![Eine gelbe Sonne, ein grauer Planet in ihrer Nähe und die blaue Erde mit ihrem Mond und ihrem Namen](img/14-children-and-local-coordinates.png)

## Der Code

Das Projekt liegt in [`samples/14-children-and-local-coordinates`](samples/14-children-and-local-coordinates/). `src/main.ts`:

```ts
import { onFrame, rrect, font, drawText, textWidth } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, uiState } from 'zinc:stage';

// A sun, a planet or a moon: a disc centred on its own (0, 0), turning around its parent's (0, 0).
class Body extends Sprite {
  color: u32 = 0xffffff;
  radius: number = 10;
  orbit: number = 0;    // how far from the parent's centre, in pixels (0: it does not turn)
  speed: number = 0;    // how fast it turns, in radians per second
  angle: number = 0;

  override onUpdate(dt: number): void {
    if (this.orbit === 0) return;
    this.angle += this.speed * dt;
    this.x = Math.cos(this.angle) * this.orbit;
    this.y = Math.sin(this.angle) * this.orbit;
    uiState.dirty = true;
  }

  override onDraw(w: number, h: number): void {
    rrect(-this.radius, -this.radius, this.radius * 2, this.radius * 2, this.radius, this.color, 255);
  }
}

// A name written under its parent, centred on the parent's (0, 0).
const small = font('sans', 14);
class Name extends Sprite {
  text: string = '';
  override onDraw(w: number, h: number): void {
    drawText(small, -textWidth(small, this.text, 0) / 2, 0, this.text, 0xc9c3e6, 255, 0);
  }
}

function body(name: string, color: u32, radius: number, orbit: number, speed: number): Body {
  const b = new Body(name);
  b.color = color;
  b.radius = radius;
  b.orbit = orbit;
  b.speed = speed;
  b.x = orbit;          // its place before it starts turning
  return b;
}

// Where a node is in the window: its x and y, plus its parent's, plus the parent's parent's...
function windowX(node: DisplayObject): number {
  let x = 0;
  let n: DisplayObject | null = node;
  while (n !== null) {
    x += (n as DisplayObject).x;
    n = (n as DisplayObject).parent;
  }
  return x;
}
function windowY(node: DisplayObject): number {
  let y = 0;
  let n: DisplayObject | null = node;
  while (n !== null) {
    y += (n as DisplayObject).y;
    n = (n as DisplayObject).parent;
  }
  return y;
}

const stage = new Stage();
stage.color = 0x0b1026;

const sun = body('sun', 0xffd166, 40, 0, 0);
sun.x = 320;
sun.y = 200;
const mercury = body('mercury', 0xb8b0a8, 8, 70, 2);
const earth = body('earth', 0x5ec2f2, 16, 150, 0.6);
const moon = body('moon', 0xe9e6df, 6, 34, 3);
const label = new Name('label');
label.text = 'Earth';
label.y = 22;

stage.addChild(sun);
sun.addChild(mercury);
sun.addChild(earth);
earth.addChild(moon);
earth.addChild(label);

function tell(): void {
  console.log(`The moon is at ${Math.round(moon.x)}, ${Math.round(moon.y)} in the earth, ` +
    `at ${Math.round(windowX(moon))}, ${Math.round(windowY(moon))} in the window.`);
}

tell();
let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    tell();
    told = true;
  }
});
```

Das Terminal zeigt, wo der Mond am Anfang ist, dann eine Sekunde später:

```text
The moon is at 34, 0 in the earth, at 504, 200 in the window.
The moon is at -34, 5 in the earth, at 410, 289 in the window.
```

## Ein Baum aus Objekten

Ein Objekt einer Szene kann andere Objekte halten: seine **Kinder**. `sun.addChild(earth)` setzt die Erde in die Sonne, und
`earth.addChild(moon)` den Mond in die Erde. Die Objekte bilden einen Baum, wie Ordner in Ordnern:

```text
stage
└── sun
    ├── mercury
    └── earth
        ├── moon
        └── label ("Earth")
```

`x` und `y` eines Kindes werden **von seinem Elternobjekt** aus gezählt, nicht vom Fenster: Das sind seine lokalen Koordinaten. Der Mond weiß nur:
"Ich bin 34 Pixel rechts vom Mittelpunkt der Erde". Er weiß nicht, wo die Erde ist, und muss es nicht wissen: Wenn sich die Erde
bewegt, bewegt sich alles in ihr mit. So folgt der Mond der Erde um die Sonne, ohne dass es dafür eine Zeile Code gibt, und
so bleibt der Name unter der Erde.

Um zu wissen, wo etwas im Fenster ist, addierst du die Positionen entlang des Baums. Am Anfang ist die Sonne bei 320, 200 im Fenster,
die Erde 150, 0 von der Sonne entfernt, der Mond 34, 0 von der Erde: 320 + 150 + 34 = 504 und 200 + 0 + 0 = 200. Das berechnen `windowX` und
`windowY`, indem sie mit `parent` vom Mond bis zur Bühne hinaufgehen.

Ein Elternobjekt wird vor seinen Kindern gezeichnet, die Kinder liegen also obenauf, und die Kinder in der Reihenfolge, in der sie hinzugefügt wurden.

## Zeile für Zeile

- `class Body extends Sprite` eine Klasse für die Sonne, die Planeten und den Mond: Sie unterscheiden sich nur in ihren Zahlen.
- `orbit`, `speed`, `angle` wie weit von seinem Elternobjekt der Körper kreist, wie schnell und wie weit er sich schon gedreht hat. Ein Winkel ist in Bogenmaß (Radiant): Eine
  ganze Umdrehung ist `2 * Math.PI`, etwa 6,28.
- `if (this.orbit === 0) return;` die Sonne dreht sich nicht: `return` verlässt `onUpdate` sofort.
- `this.x = Math.cos(this.angle) * this.orbit;` und `this.y = Math.sin(this.angle) * this.orbit;` der Punkt bei diesem Winkel auf einem
  Kreis mit dem Radius `orbit` um das `(0, 0)` des Elternobjekts (Lektion 11 benutzte dieselben zwei Zeilen für die Blütenblätter).
- `rrect(-this.radius, -this.radius, this.radius * 2, ...)` Die Scheibe wird um `(0, 0)` gezeichnet, nicht von dort aus: So ist `x`, `y` des Körpers
  sein Mittelpunkt, und ein Kind, das sich um `(0, 0)` dreht, dreht sich um den Mittelpunkt.
- `class Name extends Sprite` ein Sprite, das nur Text schreibt. `-textWidth(small, this.text, 0) / 2` beginnt den Text eine halbe Breite
  weiter links, sodass er unter dem Mittelpunkt des Elternobjekts zentriert ist.
- `b.x = orbit;` Jeder Körper beginnt rechts von seinem Elternobjekt, bevor er sich dreht.
- `function windowX(node: DisplayObject): number` addiert `x` vom Knoten bis hinauf zur Bühne. `DisplayObject` ist der Typ jedes
  Objekts einer Szene (`Sprite` ist ein anderer Name dafür). `n` ist der Knoten, bei dem wir gerade sind; `n = (n as DisplayObject).parent` steigt eine Ebene hinauf.
  `parent` ist `null` oberhalb der Bühne: Dort endet die Schleife.
- `sun.x = 320; sun.y = 200;` der Mittelpunkt der Sonne im Fenster: Die Sonne ist ein Kind der Bühne, die in der oberen linken Ecke beginnt.
- `label.y = 22;` der Name, 22 Pixel unter dem Mittelpunkt der Erde. Er ist ein Kind der Erde: Er dreht sich mit ihr.
- `stage.addChild(sun); sun.addChild(mercury); ...` baut den oben gezeichneten Baum.

## Probier das aus

- Füge den Mars hinzu: `body('mars', 0xe76f51, 12, 110, 1)`, ein Kind der Sonne.
- Gib dem Mars zwei kleine Monde, Kinder des Mars, mit unterschiedlichen Abständen und Geschwindigkeiten.
- Bewege das ganze System: Ändere `sun.x` in einem `onUpdate` der Sonne (oder in `onFrame`) und sieh zu, wie alles folgt.
- Mach den Mond zu einem Kind der Sonne statt der Erde (`sun.addChild(moon)`): Er dreht sich jetzt um die Sonne, 34 Pixel von ihr entfernt.
- Jedes Objekt hat `mouseX` und `mouseY`: den Zeiger in seinen eigenen Koordinaten. Gib `earth.mouseX` in `onFrame` aus und bewege die Maus
  über die Erde: Der Wert ist nahe 0, wenn der Zeiger auf ihrem Mittelpunkt ist, wo auch immer die Erde ist.

## Weiter

[15. Tippen und Ziehen](15-taps-and-drags.md): ein Button, den du antippst, und Karten, die du aufnimmst und bewegst.
