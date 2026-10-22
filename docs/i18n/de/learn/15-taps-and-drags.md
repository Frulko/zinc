---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 15. Tippen und Ziehen

**Das wirst du sehen:** einen violetten Button *Taps: 0* oben links und drei Karten, grün, rosa und blau, die übereinander liegen.
Tippe auf den Button, und seine Zahl steigt; er wird dunkler, solange dein Finger darauf ist. Nimm eine Karte auf und bewege sie: Sie kommt über die
anderen und bekommt einen weißen Rand, solange du sie hältst.

![Ein Button "Taps: 2" und drei Karten; die grüne Karte wird gehalten, liegt oben und hat einen weißen Rand](img/15-taps-and-drags.png)

## Der Code

Das Projekt liegt in [`samples/15-taps-and-drags`](samples/15-taps-and-drags/). `src/main.ts`:

```ts
import { onFrame, rrect, border, font, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, registerTapZone, registerDragZone, isZonePressed } from 'zinc:stage';

const label = font('sans', 18);

// A button that counts its taps.
class Counter extends Sprite {
  taps: i32 = 0;
  override onDraw(w: number, h: number): void {
    const held = isZonePressed(this.name);                 // a finger is on it right now
    rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);
    const words = `Taps: ${this.taps}`;
    drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, words, 0xffffff, 255, 0);
    registerTapZone(this.name, 0, 0, w, h, () => {
      this.taps++;
      console.log(`tap ${this.taps}`);
    });
  }
}

// A card you pick up and move.
class Card extends Sprite {
  color: u32 = 0;
  startX: number = 0;   // where the card was when it was picked up
  startY: number = 0;
  grabX: number = 0;    // where the finger took it, in the card
  grabY: number = 0;

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 14, this.color, 255);
    if (isZonePressed(this.name)) border(0, 0, w, h, 14, 3, 0xffffff, 255);
    registerDragZone(this.name, 0, 0, w, h, (x: number, y: number, phase: i32) => this.drag(x, y, phase));
  }

  drag(x: number, y: number, phase: i32): void {
    if (phase === 0) {                                     // pressed
      this.startX = this.x;
      this.startY = this.y;
      this.grabX = x;
      this.grabY = y;
      (this.parent as DisplayObject).addChild(this);       // added again: now on top of the other cards
      console.log(`picked up the ${this.name} at ${Math.round(x)}, ${Math.round(y)} in the card`);
    } else if (phase === 1) {                              // moved
      this.x = this.startX + x - this.grabX;
      this.y = this.startY + y - this.grabY;
    } else if (phase === 2) {                              // let go
      console.log(`dropped the ${this.name} at ${Math.round(this.x)}, ${Math.round(this.y)}`);
    }
  }
}

function card(name: string, color: u32, x: number, y: number): Card {
  const c = new Card(name);
  c.color = color;
  c.x = x;
  c.y = y;
  c.width = 120;
  c.height = 160;
  return c;
}

const stage = new Stage();
stage.color = 0xf3f1ec;
const counter = new Counter('counter');
counter.x = 24;
counter.y = 24;
counter.width = 140;
counter.height = 44;
stage.addChild(counter);
stage.addChild(card('green card', 0x7bd389, 200, 120));
stage.addChild(card('pink card', 0xf27aa6, 260, 150));
stage.addChild(card('blue card', 0x5ec2f2, 320, 180));
onFrame((dt: number) => stage.frame(dt));
```

Tippe zweimal auf den Button, nimm dann die grüne Karte an ihrer oberen linken Ecke und bewege sie nach oben rechts:

```text
tap 1
tap 2
picked up the green card at 30, 30 in the card
dropped the green card at 400, 70
```

## Zonen: wo ein Objekt den Finger annimmt

Ein Objekt einer Szene sagt beim Zeichnen, welcher Teil von ihm auf den Zeiger antwortet: eine **Zone**, ein Rechteck in seinen eigenen Koordinaten,
mit einem Namen und der Funktion, die aufgerufen werden soll. Es gibt zwei Arten:

- `registerTapZone(name, x, y, w, h, onTap)`: Ein Drücken und Loslassen in der Zone, ohne sich mehr als 12 Pixel zu bewegen, ruft
  `onTap()` auf. Das ist ein Klick mit der Maus, ein Tippen mit einem Finger.
- `registerDragZone(name, x, y, w, h, onDrag)`: Ein Drücken in der Zone ruft `onDrag(x, y, phase)` mit `phase` 0 auf, jede Bewegung mit
  `phase` 1 (in jedem Frame, solange der Zeiger gehalten wird), das Loslassen mit `phase` 2. `x` und `y` sind der Zeiger **in den Koordinaten des
  Objekts**, gemessen von da, wo das Objekt war, als das Drücken begann: (30, 30) ist 30 Pixel rechts und unterhalb der Ecke der Karte.

`stage.frame` merkt sich die Zonen des letzten Bildes. Wenn der Zeiger herunterkommt, sucht sie die oberste Zone darunter, die zuletzt
gezeichnete, sodass eine Karte, die über einer anderen liegt, den Finger zuerst bekommt. `isZonePressed(name)` sagt, ob der Finger gerade auf dieser Zone
ist, damit du sie gedrückt zeichnen kannst. Ein Tippen, ein Ziehen und das Drücken selbst setzen `uiState.dirty`: Die Szene wird neu gezeichnet, ohne dass du darum bittest.

Die Tastatur wird wie in Teil 1 mit `zinc:gfx` gelesen (`keyCount`, `keyName`, `isDown`), in einem `onUpdate` oder in `onFrame`.

## Zeile für Zeile

- `class Counter extends Sprite` der Button: ein Sprite mit einer Anzahl von Tipps.
- `const held = isZonePressed(this.name);` wahr, solange ein Finger auf diesem Button ist. Der Name der Zone ist der Name des Sprites,
  `'counter'`, sodass sich nie zwei Buttons einen teilen.
- `rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);` eine Pille so groß wie der Button, dunkler, solange er gehalten wird.
  `held ? a : b` ist `a`, wenn `held` wahr ist, sonst `b`.
- `drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, ...)` die Wörter im Button zentriert:
  die Hälfte des Rests auf jeder Seite, quer und nach unten.
- `registerTapZone(this.name, 0, 0, w, h, () => { ... });` der ganze Button nimmt Tipps an. `() => { ... }` ist die Funktion, die aufgerufen wird: Sie
  addiert eins zu `taps` und gibt es aus. Das nächste Bild zeigt die neue Zahl.
- `class Card extends Sprite` eine Karte merkt sich, wo sie war und wo sie angefasst wurde: `startX`, `startY`, `grabX`, `grabY`.
- `registerDragZone(this.name, 0, 0, w, h, (x, y, phase) => this.drag(x, y, phase));` die ganze Karte kann gezogen werden; jeder Schritt
  geht an die Methode `drag` der Karte.
- `if (phase === 0)` das Drücken: Merke dir, wo die Karte ist und wo der Finger in ihr ist.
- `(this.parent as DisplayObject).addChild(this);` Ein Kind hinzuzufügen, das schon da ist, schiebt es ans Ende der Liste: Es wird jetzt
  zuletzt gezeichnet, obenauf. `parent` kann allgemein `null` sein; `as DisplayObject` sagt: "hier nicht".
- `else if (phase === 1)` eine Bewegung: Die Karte geht dorthin, wo sie war, plus wie weit der Finger gegangen ist (`x - this.grabX`). Der Finger bleibt auf
  derselben Stelle der Karte.
- `else if (phase === 2)` das Loslassen: Sage, wo die Karte abgelegt wurde.
- `function card(...)` macht eine Karte von 120 mal 160 Pixeln.
- `stage.addChild(card('green card', 0x7bd389, 200, 120));` die drei Karten, jede ein bisschen tiefer und weiter rechts als die davor.

## Probier das aus

- Füge einen zweiten Button hinzu, der herunterzählt oder den ersten auf 0 zurücksetzt.
- Halte die Karten im Fenster: Begrenze in `drag` `this.x` zwischen `0` und `640 - this.width` mit `Math.max` und `Math.min`.
- Lass eine Karte beim Ablegen an einem Raster von 20 Pixeln einrasten: in Phase 2 `this.x = Math.round(this.x / 20) * 20`.
- Mach die Tipp-Zone des Buttons kleiner als sein Bild (`registerTapZone(this.name, 10, 10, w - 20, h - 20, ...)`) und sieh,
  wo er aufhört zu antworten.
- Unterscheide ein Tippen von einem Ziehen: Wenn die Karte in Phase 2 weniger als 5 Pixel von `startX`, `startY` entfernt ist, wurde sie nur angetippt: Ändere ihre
  Farbe.

## Weiter

[16. Das Layout und eine Scroll-Box](16-layout-and-scrolling.md): eine Titelleiste und eine Liste von zwanzig Früchten, die scrollt.
