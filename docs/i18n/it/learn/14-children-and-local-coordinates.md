---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 14. Figli e coordinate locali

**Cosa vedrai:** un sole giallo al centro della finestra. Un piccolo pianeta grigio gli gira intorno veloce; un pianeta blu, la
Terra, gira lentamente più lontano, con il suo nome sotto e una piccola luna che le gira intorno.

![Un sole giallo, un pianeta grigio vicino e la Terra blu con la sua luna e il suo nome](img/14-children-and-local-coordinates.png)

## Il codice

Il progetto è in [`samples/14-children-and-local-coordinates`](samples/14-children-and-local-coordinates/). `src/main.ts`:

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

Il terminale mostra dove si trova la luna all'inizio, poi un secondo dopo:

```text
The moon is at 34, 0 in the earth, at 504, 200 in the window.
The moon is at -34, 5 in the earth, at 410, 289 in the window.
```

## Un albero di oggetti

Un oggetto di una scena può contenere altri oggetti: i suoi **figli**. `sun.addChild(earth)` mette la Terra dentro il sole, e
`earth.addChild(moon)` mette la luna dentro la Terra. Gli oggetti formano un albero, come cartelle dentro altre cartelle:

```text
stage
└── sun
    ├── mercury
    └── earth
        ├── moon
        └── label ("Earth")
```

La `x` e la `y` di un figlio si contano **dal suo genitore**, non dalla finestra: sono le sue coordinate locali. La luna sa solo
"sono a 34 pixel a destra del centro della Terra". Non sa dove sia la Terra e non ne ha bisogno: quando la Terra si muove, si muove
anche tutto ciò che ha dentro. Così la luna segue la Terra intorno al sole senza una riga di codice apposta, e così il nome resta
sotto la Terra.

Per sapere dove si trova qualcosa nella finestra, somma le posizioni lungo l'albero. All'inizio il sole è a 320, 200 nella
finestra, la Terra a 150, 0 dal sole, la luna a 34, 0 dalla Terra: 320 + 150 + 34 = 504 e 200 + 0 + 0 = 200. È ciò che calcolano
`windowX` e `windowY`, risalendo dalla luna fino al palco con `parent`.

Un genitore viene disegnato prima dei suoi figli, quindi i figli stanno sopra, e i figli nell'ordine in cui sono stati aggiunti.

## Riga per riga

- `class Body extends Sprite` una sola classe per il sole, i pianeti e la luna: si distinguono solo per i loro numeri.
- `orbit`, `speed`, `angle` quanto è lontano dal genitore il corpo che gira, quanto veloce e quanto ha girato. Un angolo è in
  radianti: un giro completo è `2 * Math.PI`, circa 6,28.
- `if (this.orbit === 0) return;` il sole non gira: `return` esce subito da `onUpdate`.
- `this.x = Math.cos(this.angle) * this.orbit;` e `this.y = Math.sin(this.angle) * this.orbit;` il punto a quell'angolo su un
  cerchio di raggio `orbit` intorno a `(0, 0)` del genitore (la lezione 11 usava le stesse due righe per i petali).
- `rrect(-this.radius, -this.radius, this.radius * 2, ...)` il disco è disegnato intorno a `(0, 0)`, non a partire da lì: così
  `x`, `y` del corpo è il suo centro, e un figlio che gira intorno a `(0, 0)` gira intorno al centro.
- `class Name extends Sprite` uno sprite che scrive solo testo. `-textWidth(small, this.text, 0) / 2` fa iniziare il testo a metà
  della sua larghezza a sinistra, così è centrato sotto il centro del genitore.
- `b.x = orbit;` ogni corpo parte a destra del suo genitore, prima di girare.
- `function windowX(node: DisplayObject): number` somma le `x` dal nodo su fino al palco. `DisplayObject` è il tipo di ogni
  oggetto di una scena (`Sprite` è un altro nome per lo stesso). `n` è il nodo in cui siamo; `n = (n as DisplayObject).parent`
  sale di un livello. `parent` è `null` sopra il palco: il ciclo si ferma lì.
- `sun.x = 320; sun.y = 200;` il centro del sole, nella finestra: il sole è un figlio del palco, che parte dall'angolo in alto a
  sinistra.
- `label.y = 22;` il nome, 22 pixel sotto il centro della Terra. È un figlio della Terra: gira con lei.
- `stage.addChild(sun); sun.addChild(mercury); ...` costruisce l'albero disegnato sopra.

## Prova tu

- Aggiungi Marte: `body('mars', 0xe76f51, 12, 110, 1)`, un figlio del sole.
- Dai a Marte due piccole lune, figlie di Marte, a distanze e velocità diverse.
- Sposta tutto il sistema: cambia `sun.x` in un `onUpdate` del sole (o in `onFrame`) e guarda tutto seguirlo.
- Fai della luna una figlia del sole invece che della Terra (`sun.addChild(moon)`): ora gira intorno al sole, a 34 pixel da esso.
- Ogni oggetto ha `mouseX` e `mouseY`: il puntatore nelle sue coordinate. Stampa `earth.mouseX` in `onFrame` e muovi il mouse
  sulla Terra: è vicino a 0 quando il puntatore è sul suo centro, ovunque sia la Terra.

## Avanti

[15. Tocchi e trascinamenti](15-taps-and-drags.md): un pulsante che tocchi e delle carte che prendi e sposti.
