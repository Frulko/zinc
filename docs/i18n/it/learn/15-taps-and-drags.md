---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 15. Tocchi e trascinamenti

**Cosa vedrai:** un pulsante viola *Taps: 0* in alto a sinistra, e tre carte, verde, rosa e azzurra, una sopra l'altra.
Tocca il pulsante e il suo numero sale; si scurisce finché il dito è sopra. Prendi una carta e spostala: passa sopra le altre e
ha un bordo bianco finché la tieni.

![Un pulsante "Taps: 2" e tre carte; la carta verde è tenuta, sopra, con un bordo bianco](img/15-taps-and-drags.png)

## Il codice

Il progetto è in [`samples/15-taps-and-drags`](samples/15-taps-and-drags/). `src/main.ts`:

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

Tocca due volte il pulsante, poi prendi la carta verde per il suo angolo in alto a sinistra e spostala in alto a destra:

```text
tap 1
tap 2
picked up the green card at 30, 30 in the card
dropped the green card at 400, 70
```

## Zone: dove un oggetto prende il dito

Un oggetto di una scena dice, mentre si disegna, quale sua parte risponde al puntatore: una **zona**, un rettangolo nelle sue
coordinate, con un nome e la funzione da chiamare. Ce ne sono di due tipi:

- `registerTapZone(name, x, y, w, h, onTap)`: una pressione e un rilascio nella zona, senza muoversi più di 12 pixel, chiamano
  `onTap()`. È un clic con il mouse, un tocco con il dito.
- `registerDragZone(name, x, y, w, h, onDrag)`: una pressione nella zona chiama `onDrag(x, y, phase)` con `phase` 0, ogni
  movimento con `phase` 1 (a ogni frame finché il puntatore è premuto), il rilascio con `phase` 2. `x` e `y` sono il puntatore
  **nelle coordinate dell'oggetto**, misurate da dove si trovava l'oggetto quando è iniziata la pressione: (30, 30) è 30 pixel a
  destra e sotto l'angolo della carta.

`stage.frame` tiene le zone dell'ultima immagine. Quando il puntatore si abbassa, cerca la zona più in alto sotto di esso, quella
disegnata per ultima, così una carta sopra un'altra prende il dito per prima. `isZonePressed(name)` dice se il dito è su quella
zona in questo momento, per disegnarla premuta. Un tocco, un trascinamento e la pressione stessa impostano `uiState.dirty`: la
scena viene ridisegnata senza che tu lo chieda.

La tastiera si legge come nella parte 1, con `zinc:gfx` (`keyCount`, `keyName`, `isDown`), in un `onUpdate` o in `onFrame`.

## Riga per riga

- `class Counter extends Sprite` il pulsante: uno sprite con un numero di tocchi.
- `const held = isZonePressed(this.name);` vero finché un dito è su questo pulsante. Il nome della zona è il nome dello sprite,
  `'counter'`, quindi due pulsanti non ne condividono mai una.
- `rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);` una pillola grande quanto il pulsante, più scura quando è tenuto.
  `held ? a : b` vale `a` quando `held` è vero, altrimenti `b`.
- `drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, ...)` le parole centrate nel pulsante: metà
  di ciò che resta per parte, in larghezza e in altezza.
- `registerTapZone(this.name, 0, 0, w, h, () => { ... });` tutto il pulsante prende i tocchi. `() => { ... }` è la funzione da
  chiamare: aggiunge uno a `taps` e lo stampa. L'immagine successiva mostra il nuovo numero.
- `class Card extends Sprite` una carta ricorda dove si trovava e dove è stata presa: `startX`, `startY`, `grabX`, `grabY`.
- `registerDragZone(this.name, 0, 0, w, h, (x, y, phase) => this.drag(x, y, phase));` tutta la carta si può trascinare; ogni
  passo va al metodo `drag` della carta.
- `if (phase === 0)` la pressione: ricorda dove si trova la carta e dove si trova il dito su di essa.
- `(this.parent as DisplayObject).addChild(this);` aggiungere un figlio che c'è già lo sposta in fondo alla lista: ora viene
  disegnato per ultimo, sopra. In generale `parent` può essere `null`; `as DisplayObject` dice "qui non lo è".
- `else if (phase === 1)` un movimento: la carta va dove si trovava, più quanto ha percorso il dito (`x - this.grabX`). Il dito
  resta sullo stesso punto della carta.
- `else if (phase === 2)` il rilascio: dì dove è stata lasciata la carta.
- `function card(...)` crea una carta di 120 per 160 pixel.
- `stage.addChild(card('green card', 0x7bd389, 200, 120));` le tre carte, ognuna un po' più in basso e a destra della precedente.

## Prova tu

- Aggiungi un secondo pulsante che conta alla rovescia, o che riporta il primo a 0.
- Tieni le carte dentro la finestra: in `drag`, limita `this.x` tra `0` e `640 - this.width` con `Math.max` e `Math.min`.
- Fai agganciare una carta a una griglia di 20 pixel quando la lasci: nella fase 2, `this.x = Math.round(this.x / 20) * 20`.
- Rendi la zona di tocco del pulsante più piccola della sua immagine (`registerTapZone(this.name, 10, 10, w - 20, h - 20, ...)`) e
  guarda dove smette di rispondere.
- Distingui un tocco da un trascinamento: nella fase 2, quando la carta è a meno di 5 pixel da `startX`, `startY`, è stata solo
  toccata: cambia il suo colore.

## Avanti

[16. Il layout e una scroll box](16-layout-and-scrolling.md): una barra del titolo e una lista di venti frutti che scorre.
