---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 13. Un palco e uno sprite

**Cosa vedrai:** tre palline di dimensioni diverse rotolano da sinistra a destra su un palco blu scuro, ognuna alla sua
velocità, e tornano a sinistra quando escono dalla finestra.

![Una pallina rosa, una blu e una dorata su sfondo blu scuro](img/13-a-stage-and-a-sprite.png)

La parte 3 scrive i programmi come una **scena**: un palco che contiene degli oggetti. Ogni oggetto è un piccolo programma a sé,
che sa dove si trova e come disegnarsi. Se hai fatto giochi in Flash con ActionScript 3, o hai usato Haxe e OpenFL, l'idea è la
stessa, con gli stessi nomi. Usa il modulo `zinc:stage` e disegna con le funzioni `zinc:gfx` della parte 1.

## Il codice

Il progetto è in [`samples/13-a-stage-and-a-sprite`](samples/13-a-stage-and-a-sprite/). `src/main.ts`:

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

Il terminale mostra:

```text
The pink ball joined the stage.
The blue ball joined the stage.
The gold ball joined the stage.
The stage holds 3 balls.
After 1.00 seconds the pink ball is at x = 120.
```

## Oggetti, classi e sprite

Nella parte 1 una pallina erano due variabili, `x` e `y`, e la funzione del frame la disegnava. Con tre palline servirebbero sei
variabili, tre velocità, tre colori, e una funzione del frame che cresce a ogni nuova pallina. Una scena mette i numeri di ogni
pallina **dentro la pallina**: un oggetto.

Una **classe** è il progetto di un oggetto: cosa contiene e cosa sa fare. `class Ball extends Sprite` dice "una Ball è uno Sprite,
con in più un colore e una velocità". `Sprite` viene da `zinc:stage` e ha già tutto ciò che serve a ogni oggetto di una scena: una
posizione `x`, `y` (dall'angolo in alto a sinistra del suo genitore), una dimensione `width`, `height`, un `name` e dei figli.
`new Ball('pink ball')` crea un oggetto dal progetto; ne puoi creare quanti vuoi, ognuno con i suoi numeri.

Uno sprite non si disegna da solo quando vuoi tu: è Zinc che chiama i suoi metodi al momento giusto. Scrivi solo quelli che ti
servono, con la parola `override` (sostituisci ciò che fa `Sprite`, cioè niente):

| Metodo | Quando lo chiama Zinc |
|---|---|
| `onAddedToStage()` | una volta, quando l'oggetto entra nel palco |
| `onUpdate(dt)` | a ogni frame: fallo avanzare di `dt` secondi |
| `onDraw(w, h)` | quando il palco viene disegnato: disegnalo, con `(0, 0)` nel suo angolo in alto a sinistra e `w`, `h` come dimensione |

Il **palco** è la radice della scena. `stage.frame(dt)`, chiamato da `onFrame`, fa un frame intero: chiama `onUpdate` su ogni
oggetto, poi, se qualcosa è cambiato, pulisce la finestra con `stage.color` e chiama ogni `onDraw`, nell'ordine in cui gli oggetti
sono stati aggiunti (l'ultimo sta sopra).

## Riga per riga

- `import { Stage, Sprite, uiState } from 'zinc:stage';` il palco, la classe base degli oggetti e lo stato del frame.
- `class Ball extends Sprite { ... }` il progetto di una pallina. Tra le graffe: i suoi campi e i suoi metodi.
- `color: u32 = 0xffffff;` un campo: ogni pallina ha un colore, bianco finché qualcuno non lo cambia. `speed: number = 100;` lo
  stesso per la velocità.
- `override onAddedToStage(): void` parte quando `addChild` mette la pallina sul palco. `this` è la pallina stessa: `this.name`
  è il nome che le è stato dato.
- `override onUpdate(dt: number): void` parte a ogni frame. `this.x += this.speed * dt;` muove questa pallina con la sua
  velocità, come nella lezione 2.
- `if (this.x > width()) this.x = -this.width;` quando è uscita a destra, rimettila appena fuori a sinistra.
- `uiState.dirty = true;` dice al palco che l'immagine è cambiata. Un palco in cui nessuno lo imposta non disegna niente:
  l'ultima immagine resta sullo schermo e il computer riposa. Qui le palline si muovono sempre, quindi lo impostano sempre.
- `override onDraw(w: number, h: number): void` disegna la pallina. `rrect(0, 0, w, h, w / 2, ...)` è un cerchio che riempie il
  riquadro della pallina. `(0, 0)` non è l'angolo della finestra: è l'angolo della pallina, ovunque si trovi. Zinc sposta il
  disegno lì per te.
- `function makeBall(...)` crea una pallina e ne imposta i campi, così tre palline richiedono tre righe più sotto. `new Ball(name)`
  crea l'oggetto; `return ball;` lo restituisce.
- `const stage = new Stage();` il palco. `stage.color = 0x14213d;` il suo sfondo, blu scuro.
- `stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));` mette una pallina rosa a 60 pixel dall'alto, larga 60 pixel,
  che rotola a 120 pixel al secondo. Aggiungerla chiama il suo `onAddedToStage`.
- `stage.numChildren` quanti oggetti contiene il palco. `stage.getChildAt(0)` il primo, la pallina rosa.
- `onFrame((dt: number) => { stage.frame(dt); ... });` il ciclo dei frame della parte 1 passa ogni frame al palco. Il resto
  conta un secondo e stampa dove si trova la pallina rosa: 120 pixel al secondo per un secondo, cioè 120 pixel da dove è partita.

## Prova tu

- Aggiungi una quarta pallina: una riga `stage.addChild(makeBall(...))` in più. Non cambia nient'altro.
- Dai a `Ball` anche una velocità verticale e fai rimbalzare le palline sui bordi, come nel *Prova tu* della lezione 2.
- Togli `uiState.dirty = true;` ed esegui: le palline si muovono (la loro `x` cambia) ma l'immagine resta ferma, perché nessuno
  chiede al palco di disegnare.
- Crea una seconda classe, `Square extends Sprite`, che disegna un quadrato e cade invece di rotolare. Metti palline e quadrati
  sullo stesso palco.
- In `onDraw`, scrivi il nome della pallina sotto di essa con `drawText` (lezione 5): `drawText(f, 0, h + 4, this.name, 0xffffff, 255, 0)`.

## Avanti

[14. Figli e coordinate locali](14-children-and-local-coordinates.md): oggetti dentro altri oggetti, e una luna che gira intorno a
un pianeta che gira intorno al sole.
