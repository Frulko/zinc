---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 13. Eine Bühne und ein Sprite

**Das wirst du sehen:** drei Bälle unterschiedlicher Größe, die auf einer dunkelblauen Bühne von links nach rechts rollen, jeder in seiner eigenen Geschwindigkeit, und
links wieder hereinkommen, wenn sie das Fenster verlassen.

![Ein rosa, ein blauer und ein goldener Ball auf dunkelblauem Hintergrund](img/13-a-stage-and-a-sprite.png)

Teil 3 schreibt Programme als **Szene**: eine Bühne, die Objekte hält, jedes Objekt ein kleines Programm für sich, das weiß, wo es
ist und wie es sich zeichnet. Wenn du Flash-Spiele mit ActionScript 3 gemacht oder Haxe und OpenFL benutzt hast, ist das dieselbe Idee, mit
denselben Namen. Es nutzt das Modul `zinc:stage` und zeichnet mit den `zinc:gfx`-Funktionen aus Teil 1.

## Der Code

Das Projekt liegt in [`samples/13-a-stage-and-a-sprite`](samples/13-a-stage-and-a-sprite/). `src/main.ts`:

```ts
import { onFrame, rrect, width } from 'zinc:gfx';
import { Stage, Sprite, uiState } from 'zinc:stage';

class Ball extends Sprite {
  color: u32 = 0xffffff;
  speed: number = 100;   // pixels per second, to the right

  override onAddedToStage(): void {
    console.log(`The ${this.name} joined the stage.`);
  }

  override onUpdate(dt: number): void {
    this.x += this.speed * dt;
    if (this.x > width()) this.x = -this.width;   // gone on the right: back on the left
    uiState.dirty = true;                         // it moved: the stage must be drawn again
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, this.color, 255);    // (0, 0) is the ball's own top left corner
  }
}

function makeBall(name: string, color: u32, y: number, size: number, speed: number): Ball {
  const ball = new Ball(name);
  ball.color = color;
  ball.y = y;
  ball.width = size;
  ball.height = size;
  ball.speed = speed;
  return ball;
}

const stage = new Stage();
stage.color = 0x14213d;
stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));
stage.addChild(makeBall('blue ball', 0x5ec2f2, 170, 80, 60));
stage.addChild(makeBall('gold ball', 0xe8b06a, 300, 40, 200));
console.log(`The stage holds ${stage.numChildren} balls.`);

let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the pink ball is at x = ${Math.round(stage.getChildAt(0).x)}.`);
    told = true;
  }
});
```

Das Terminal zeigt:

```text
The pink ball joined the stage.
The blue ball joined the stage.
The gold ball joined the stage.
The stage holds 3 balls.
After 1.00 seconds the pink ball is at x = 120.
```

## Objekte, Klassen und Sprites

In Teil 1 waren ein Ball zwei Variablen, `x` und `y`, und die Frame-Funktion zeichnete ihn. Mit drei Bällen bräuchtest du sechs Variablen,
drei Geschwindigkeiten, drei Farben und eine Frame-Funktion, die mit jedem neuen Ball wächst. Eine Szene legt die Zahlen jedes Balls **in den
Ball hinein**: ein Objekt.

Eine **Klasse** ist der Bauplan eines Objekts: was es enthält und was es tun kann. `class Ball extends Sprite` sagt: "Ein Ball ist ein Sprite, mit einer
Farbe und einer Geschwindigkeit dazu". `Sprite` kommt aus `zinc:stage` und hat schon, was jedes Objekt einer Szene braucht: eine Position `x`, `y`
(von der oberen linken Ecke seines Elternobjekts), eine Größe `width`, `height`, einen `name` und Kinder. `new Ball('pink ball')` macht ein Objekt
aus dem Bauplan; du kannst so viele machen, wie du willst, jedes mit seinen eigenen Zahlen.

Ein Sprite zeichnet sich nicht, wann du willst: Zinc ruft seine Methoden im richtigen Moment auf. Du schreibst die, die du brauchst, mit dem
Wort `override` (du ersetzt, was `Sprite` tut, nämlich nichts):

| Methode | Wann Zinc sie aufruft |
|---|---|
| `onAddedToStage()` | einmal, wenn das Objekt auf die Bühne kommt |
| `onUpdate(dt)` | in jedem Frame: Bewege es um `dt` Sekunden weiter |
| `onDraw(w, h)` | wenn die Bühne gezeichnet wird: Zeichne es, mit `(0, 0)` an seiner eigenen oberen linken Ecke und `w`, `h` als seiner Größe |

Die **Bühne** (Stage) ist die Wurzel der Szene. `stage.frame(dt)`, aufgerufen aus `onFrame`, erledigt einen ganzen Frame: Sie ruft `onUpdate` an jedem
Objekt auf, dann, wenn sich etwas geändert hat, löscht sie das Fenster mit `stage.color` und ruft jedes `onDraw` auf, in der Reihenfolge, in der die Objekte hinzugefügt wurden
(das letzte liegt oben).

## Zeile für Zeile

- `import { Stage, Sprite, uiState } from 'zinc:stage';` die Bühne, die Basisklasse der Objekte und der Zustand des Frames.
- `class Ball extends Sprite { ... }` der Bauplan eines Balls. Innerhalb der geschweiften Klammern: seine Felder und seine Methoden.
- `color: u32 = 0xffffff;` ein Feld: Jeder Ball hat eine Farbe, weiß, bis sie jemand ändert. `speed: number = 100;` dasselbe für
  die Geschwindigkeit.
- `override onAddedToStage(): void` läuft, wenn `addChild` den Ball auf die Bühne setzt. `this` ist der Ball selbst:
  `this.name` ist der Name, den er bekommen hat.
- `override onUpdate(dt: number): void` läuft in jedem Frame. `this.x += this.speed * dt;` bewegt diesen Ball mit seiner eigenen Geschwindigkeit, wie
  in Lektion 2.
- `if (this.x > width()) this.x = -this.width;` Wenn er rechts hinausgegangen ist, setze ihn knapp außerhalb auf der linken Seite zurück.
- `uiState.dirty = true;` sagt der Bühne, dass sich das Bild geändert hat. Eine Bühne, auf der das niemand setzt, zeichnet nichts: Das letzte Bild
  bleibt auf dem Bildschirm, und der Computer ruht. Hier bewegen sich die Bälle immer, also setzen sie es immer.
- `override onDraw(w: number, h: number): void` zeichnet den Ball. `rrect(0, 0, w, h, w / 2, ...)` ist ein Kreis, der die
  Box des Balls füllt. `(0, 0)` ist nicht die Ecke des Fensters: Es ist die eigene Ecke des Balls, wo auch immer der Ball ist. Zinc verschiebt die Zeichnung
  für dich dorthin.
- `function makeBall(...)` macht einen Ball und setzt seine Felder, sodass drei Bälle unten drei Zeilen brauchen. `new Ball(name)` macht das
  Objekt; `return ball;` gibt es zurück.
- `const stage = new Stage();` die Bühne. `stage.color = 0x14213d;` ihr Hintergrund, dunkelblau.
- `stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));` setzt einen rosa Ball 60 Pixel vom oberen Rand, 60 Pixel breit,
  der mit 120 Pixeln pro Sekunde rollt. Beim Hinzufügen wird sein `onAddedToStage` aufgerufen.
- `stage.numChildren` wie viele Objekte die Bühne hält. `stage.getChildAt(0)` das erste, der rosa Ball.
- `onFrame((dt: number) => { stage.frame(dt); ... });` Die Frame-Schleife aus Teil 1 gibt jeden Frame an die Bühne weiter. Der Rest zählt
  eine Sekunde und gibt aus, wo der rosa Ball ist: 120 Pixel pro Sekunde, eine Sekunde lang, 120 Pixel von seinem Startpunkt.

## Probier das aus

- Füge einen vierten Ball hinzu: eine weitere Zeile `stage.addChild(makeBall(...))`. Sonst ändert sich nichts.
- Gib `Ball` auch eine vertikale Geschwindigkeit und lass die Bälle an den Rändern abprallen, wie im *Probier das aus* von Lektion 2.
- Entferne `uiState.dirty = true;` und führe es aus: Die Bälle bewegen sich (ihr `x` ändert sich), aber das Bild bleibt stehen, weil niemand die Bühne
  zum Zeichnen auffordert.
- Mach eine zweite Klasse, `Square extends Sprite`, die ein Quadrat zeichnet und herunterfällt, statt zu rollen. Setze Bälle und Quadrate auf
  dieselbe Bühne.
- Schreibe in `onDraw` den Namen des Balls mit `drawText` darunter (Lektion 5): `drawText(f, 0, h + 4, this.name, 0xffffff, 255, 0)`.

## Weiter

[14. Kinder und lokale Koordinaten](14-children-and-local-coordinates.md): Objekte in Objekten und ein Mond, der sich um einen
Planeten dreht, der sich um die Sonne dreht.
