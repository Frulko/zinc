---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 16. Das Layout und eine Scroll-Box

**Das wirst du sehen:** eine Seite mit einer Titelleiste, *Fruits* links und *Tap a fruit* rechts, und darunter eine weiße Liste von
zwanzig Früchten, die nicht ins Fenster passt. Scrolle sie mit dem Mausrad, zwei Fingern auf einem Trackpad oder indem du sie mit einem
Finger ziehst; sie läuft ein Stück weiter, wenn du loslässt. Tippe auf eine Frucht: Ihre Zeile wird grau, und die Titelleiste sagt *You chose: Lime*.

![Eine Titelleiste "Fruits" und "You chose: Lime" über einer gescrollten Liste, die Zeile Lime grau](img/16-layout-and-scrolling.png)

## Der Code

Das Projekt liegt in [`samples/16-layout-and-scrolling`](samples/16-layout-and-scrolling/). `src/main.ts`:

```ts
import { onFrame, rrect, rect, font, drawText, lineHeight } from 'zinc:gfx';
import {
  Stage, Sprite, ScrollBox, registerTapZone, beginScrollBox, endScrollBox, isLocalRectVisible, isZonePressed,
} from 'zinc:stage';

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry', 'Coconut', 'Fig', 'Grape', 'Kiwi', 'Lemon',
  'Lime', 'Mango', 'Melon', 'Orange', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Raspberry', 'Strawberry'];
const ROW = 44;                                   // the height of one row, in pixels
const bold = font('sans-bold', 22);
const plain = font('sans', 17);
let chosen = '';

// A line of text, centred in its height.
class Label extends Sprite {
  text: string = '';
  fontId: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(this.fontId, 0, (h - lineHeight(this.fontId)) / 2, this.text, 0x1d1b18, 255, 0);
  }
}

// The list of fruits: it draws only the rows you can see, and scrolls with a finger or the wheel.
class FruitList extends Sprite {
  box: ScrollBox = new ScrollBox();

  override onMeasure(): void {
    this.box.contentHeight = FRUITS.length * ROW;
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 12, 0xffffff, 255);
    beginScrollBox(this.box, 0, 0, w, h);         // what is drawn until endScrollBox stays inside the box
    for (let i = 0; i < FRUITS.length; i++) {
      const y = i * ROW - this.box.scrollY;       // scrolled: the rows move up
      if (!isLocalRectVisible(0, y, w, ROW)) continue;
      const id = `row ${i}`;
      if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);
      drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], 0x1d1b18, 255, 0);
      rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);
      registerTapZone(id, 0, y, w, ROW, () => {
        chosen = FRUITS[i];
        status.text = `You chose: ${chosen}`;
        console.log(`tapped ${chosen}, the list is scrolled by ${Math.round(this.box.scrollY)}`);
      });
    }
    endScrollBox();
  }
}

const stage = new Stage();
stage.color = 0xf3f1ec;
stage.direction = 'column';                       // children from top to bottom
stage.alignItems = 'stretch';                     // each one as wide as the stage
stage.setPaddingSymmetric(24, 20);
stage.gap = 12;

const header = new Sprite('header');
header.direction = 'row';                         // children from left to right
header.height = 40;
const title = new Label('title');
title.text = 'Fruits';
title.fontId = bold;
title.flex = 1;                                   // takes the room the status leaves
title.height = 40;
const status = new Label('status');
status.text = 'Tap a fruit';
status.fontId = plain;
status.width = 220;
status.height = 40;
header.addChild(title);
header.addChild(status);

const list = new FruitList('list');
list.flex = 1;                                    // the rest of the height

stage.addChild(header);
stage.addChild(list);
console.log(`${FRUITS.length} fruits, ${FRUITS.length * ROW} pixels of list`);
onFrame((dt: number) => stage.frame(dt));
```

Tippe auf *Cherry*, scrolle drei Schritte mit dem Rad nach unten, ziehe die Liste um 100 Pixel nach oben und tippe dann auf die Zeile unter dem Zeiger:

```text
20 fruits, 880 pixels of list
tapped Cherry, the list is scrolled by 0
tapped Lime, the list is scrolled by 244
```

## Zeilen und Spalten

Bisher hatte jedes Objekt ein `x` und ein `y`, das du gesetzt hast. Eine Seite mit einer Titelleiste und einer Liste bräuchte viele Zahlen, die alle
geändert werden müssten, wenn sich die Fenstergröße ändert. Stattdessen kann ein Elternobjekt **seine Kinder platzieren**:

| Feld | Was es tut |
|---|---|
| `direction = 'column'` | die Kinder untereinander, von oben |
| `direction = 'row'` | die Kinder nebeneinander, von links |
| `gap` | Pixel zwischen zwei Kindern |
| `setPaddingSymmetric(across, down)` | ein leerer Rand innerhalb des Elternobjekts: `across` links und rechts, `down` oben und unten |
| `alignItems = 'stretch'` | jedes Kind nimmt die ganze Breite einer Spalte (oder die ganze Höhe einer Zeile) |
| `flex = 1` | an einem Kind: Es nimmt den Platz, den die anderen übrig lassen |

Hier ist die Bühne eine Spalte: die Titelleiste (40 Pixel hoch), dann die Liste, die den Rest nimmt (`flex = 1`). Die Titelleiste ist eine Zeile:
Der Titel nimmt, was der Status (220 Pixel breit) übrig lässt. Ändere die Größe des Fensters in `zinc.json`, und alles passt immer noch, ohne dass eine
Zahl geändert werden müsste. Vor dem Zeichnen ruft die Bühne `onMeasure()` jedes Objekts auf: der Moment, um eine Größe oder einen Wert zu setzen, den das Layout
braucht.

## Eine Scroll-Box

Die Liste ist 880 Pixel hoch (20 Zeilen zu je 44) und das Fenster 400. Eine **Scroll-Box** zeigt einen Teil davon und bewegt sich, wenn du scrollst:

- `box: ScrollBox = new ScrollBox();` hält den Zustand: `scrollY`, wie weit die Liste gescrollt ist, und `contentHeight`, wie hoch die
  ganze Liste ist.
- `beginScrollBox(this.box, 0, 0, w, h)` ... `endScrollBox()`: Was zwischen den beiden gezeichnet wird, wird auf die Box zugeschnitten, ebenso die
  Zonen. Eine Zeile, die halb unter der Titelleiste verborgen ist, nimmt auf ihrer verborgenen Hälfte keinen Tipp an.
- Du zeichnest jede Zeile bei `i * ROW - this.box.scrollY`: Wenn die Liste um 100 gescrollt ist, liegt jede Zeile 100 Pixel höher.
- `stage.frame` erledigt den Rest: Das Rad und das Trackpad scrollen die Box unter dem Zeiger; ein Finger, der sich auf ihr mehr als 12 Pixel
  bewegt, scrollt sie (und tippt nichts an), und eine schnelle Bewegung schleudert sie weiter.

`isLocalRectVisible` sagt, ob eine Zeile überhaupt in der Box liegt: Die Zeilen, die du nicht sehen kannst, werden nicht gezeichnet, sodass eine Liste mit tausend
Zeilen nicht mehr als zwanzig zeichnet.

## Zeile für Zeile

- `const FRUITS = [...]` die zwanzig Früchte in einer Liste. `const ROW = 44;` die Höhe einer Zeile.
- `let chosen = '';` die zuletzt angetippte Frucht, am Anfang `''` (leer).
- `class Label extends Sprite` ein Text, zentriert in seiner Höhe: `(h - lineHeight(this.fontId)) / 2` von oben. `fontId` sagt, welche
  Schrift, sodass sich der Titel und der Status die Klasse teilen.
- `override onMeasure(): void` setzt die Höhe des Inhalts vor dem Layout und dem Zeichnen.
- `rrect(0, 0, w, h, 12, 0xffffff, 255);` die weiße Karte der Liste, bevor die Box sich öffnet.
- `for (let i = 0; i < FRUITS.length; i++)` eine Zeile pro Frucht. `continue` springt zur nächsten Frucht, wenn diese Zeile nicht zu sehen ist.
- ``const id = `row ${i}`;`` der Name der Zone der Zeile: `row 0`, `row 1` ... `isZonePressed(id)` ist wahr, solange der Finger darauf ist.
- `if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);` ein grauer Hintergrund für die gehaltene oder gewählte Zeile.
  `||` heißt "oder".
- `drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], ...)` der Name der Frucht, zentriert in ihrer Zeile.
- `rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);` eine dünne Linie unter jeder Zeile.
- `registerTapZone(id, 0, y, w, ROW, () => { ... });` die Zeile nimmt Tipps an. Die Funktion merkt sich `i`: Jede Zeile hat ihr eigenes.
- `status.text = ...` ändert den Text des Status-Labels. `status` wird weiter unten in der Datei gemacht; die Funktion läuft später, bei einem
  Tipp, wenn es existiert. Ein Tipp fordert schon ein neues Bild an: Der neue Text erscheint sofort.
- `stage.direction = 'column'; stage.alignItems = 'stretch';` die Seite ist eine Spalte, ihre Kinder so breit wie das Fenster minus
  den Innenabstand.
- `header.direction = 'row';` die Titelleiste ist eine Zeile aus zwei Labels.
- `title.flex = 1;` der Titel nimmt die Breite, die der Status übrig lässt; `status.width = 220;` der Status hat eine feste Breite.
- `list.flex = 1;` die Liste nimmt die Höhe, die die Titelleiste übrig lässt.

## Probier das aus

- Mach die Zeilen höher oder niedriger: Ändere `ROW`. Alles folgt.
- Füge der Titelleiste ein drittes Label hinzu, *20 fruits*, zwischen dem Titel und dem Status.
- Setze den Status stattdessen unten auf die Seite: Füge ihn nach der Liste zur Bühne hinzu, nicht zum Header.
- Mach die Liste halb so breit wie das Fenster: `stage.direction = 'row'` und eine zweite Liste daneben.
- Scrolle zurück nach oben, wenn der Titel angetippt wird: im `onDraw` von `Label` eine Tipp-Zone, die `list.box.scrollY = 0` setzt.

## Wie es weitergeht

Du kannst eine Szene bauen: Objekte, die sich bewegen und selbst zeichnen, einen Baum aus Kindern, Tippen, Ziehen, ein Layout und eine Liste, die scrollt.
Das reicht für die meisten Apps auf einem alten Tablet.

- Die [Referenz zu zinc:stage](../reference/stage.md): jedes Feld, jede Methode und jede Funktion und was ActionScript 3 hat, das `zinc:stage`
  nicht hat.
- `zinc new stage` macht eine kleine App zum Weiterbauen: ein Titel, farbige Buttons und ein Sticker, den du ziehst.
- [`examples/music-tree`](../../examples/music-tree/src/main.ts) im Repository: ein ganzer Musikplayer, auf diese Weise geschrieben, schnell auf
  einem Tablet von 2011.
- [Eine Szene in einer Oberfläche](../start/beyond.md#a-scene-inside-an-interface) und eine Oberfläche in einer Szene: Sprites neben
  Buttons, Buttons auf einem Sprite.
- [Vier Wege, ein Programm zu schreiben](../start/styles.md) oder Teil 4: [17. Pfade und Füllungen](17-paths-and-fills.md), das Canvas des Webs.
