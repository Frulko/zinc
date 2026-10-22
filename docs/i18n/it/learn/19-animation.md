---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 19. Un'animazione

**Cosa vedrai:** un mulino a vento su un prato verde. Le sue quattro pale rosse girano con regolarità, un quarto di giro al
secondo, e nuvole bianche scivolano nel cielo azzurro, tornando a sinistra quando escono a destra.

![Un mulino a vento con quattro pale rosse davanti a una nuvola, su un prato verde](img/19-animation.png)

## Il codice

Il progetto è in [`samples/19-animation`](samples/19-animation/). `src/main.ts`:

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

Dopo un secondo il terminale mostra:

```text
After 1.00 seconds the blades turned 90 degrees.
```

## Un'animazione è un'immagine, ancora e ancora

Per far muovere un canvas non c'è niente di nuovo da imparare: è il flip book della lezione 2. A ogni frame, `onFrame` ti dà `dt`,
il tempo trascorso dall'ultimo frame; fai avanzare i tuoi numeri di una velocità per `dt`, poi disegni di nuovo tutta l'immagine,
a partire dal cielo. Il canvas non ricorda cosa ha disegnato nel frame prima (sul web chiameresti prima `clearRect`; qui il
`fillRect` del cielo copre tutto).

Due cose il canvas le **ricorda** da un frame al successivo: le sue impostazioni e la sua trasformazione. Un `translate` o un
`rotate` che non viene annullato c'è ancora nel frame dopo, e in quello dopo ancora, e si accumula: il mulino volerebbe via. Ecco
perché le pale sono disegnate tra `save()` e `restore()`. Lo stesso vale per `fillStyle` o `lineWidth`: imposta ciò che ti serve
prima di disegnare.

L'angolo cresce per sempre (90 gradi dopo un secondo, 900 dopo dieci); una rotazione di 900 gradi ha lo stesso aspetto di una di
180, quindi non serve riportarlo indietro. Le nuvole invece ne hanno bisogno: `%` (il resto di una divisione) riporta `cloudX` a 0
quando arriva a 800.

## Riga per riga

- `const TURN_SPEED = Math.PI / 2;` un quarto di giro (la metà di `Math.PI`, che è mezzo giro) al secondo.
- `angle += TURN_SPEED * dt;` le pale girano della velocità per il tempo del frame, quindi girano alla stessa velocità su una
  macchina lenta e su una veloce.
- `cloudX = (cloudX + 40 * dt) % 800;` le nuvole si muovono di 40 pixel al secondo; oltre 800 ricominciano da 0.
- `Math.round((angle * 180) / Math.PI)` trasforma i radianti in gradi per il messaggio: mezzo giro è `Math.PI` radianti, 180 gradi.
- `function cloud(x, y)` tre cerchi in un solo tracciato, riempiti insieme: una nuvola. `arc` aggiunge un cerchio al tracciato
  senza sollevare la penna, e il riempimento copre tutti e tre.
- `cloud(cloudX - 100, 80);` la prima nuvola parte 100 pixel a sinistra della finestra, così scivola dentro invece di comparire
  all'improvviso.
- `cloud(((cloudX + 400) % 800) - 100, 130);` la seconda nuvola è 400 pixel dietro la prima, sullo stesso ciclo.
- `ctx.moveTo(300, 320); ... ctx.closePath();` la torre: più stretta in alto che in basso.
- `ctx.translate(320, 170); ctx.rotate(angle);` il mozzo del mulino diventa `(0, 0)`, ruotato dell'angolo.
- `ctx.moveTo(0, 0); ctx.lineTo(18, -20); ctx.lineTo(10, -120); ctx.lineTo(-6, -120);` una pala, rivolta in su dal mozzo.
  `ctx.rotate(Math.PI / 2)` ruota di un quarto: il ciclo disegna le quattro pale con le stesse linee.
- `ctx.restore();` annulla in una volta il translate e le quattro rotazioni, tornando all'angolo della finestra.
- `ctx.arc(320, 170, 9, ...)` il mozzo nero, disegnato per ultimo, sopra le pale.

## Prova tu

- Fai soffiare più forte il vento: raddoppia `TURN_SPEED` e la velocità delle nuvole.
- Fai girare le pale dall'altra parte: sottrai invece di sommare.
- Togli `ctx.save()` e `ctx.restore()` ed esegui: gli spostamenti e le rotazioni si sommano frame dopo frame, e le pale volano
  fuori dalla finestra.
- Lascia che un clic acceleri le pale: leggi `pointerDown()` da `zinc:gfx`, come nella [pagina degli stili](../start/styles.md), e
  aggiungi alla velocità a ogni pressione. Poi rallentala un po' a ogni frame: `speed *= 0.99`.
- Fai notte: un cielo scuro, una luna (un cerchio) e qualche stella (piccoli `fillRect` in posti fissi).

## Avanti

[20. Testo e gradienti](20-text-and-gradients.md): un manifesto con un cielo che sfuma da un colore all'altro, un sole luminoso e
testo centrato.
