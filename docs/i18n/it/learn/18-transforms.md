---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 18. Trasformazioni

**Cosa vedrai:** due orologi da stazione che segnano le dieci e dieci, uno grande a destra e una piccola copia in alto a
sinistra, ognuno con sessanta tacche, una lancetta delle ore, una dei minuti e una dei secondi rossa.

![Un orologio grande e uno piccolo, entrambi alle dieci e dieci](img/18-transforms.png)

## Il codice

Il progetto è in [`samples/18-transforms`](samples/18-transforms/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const HOURS = 10, MINUTES = 10;
let told = false;

// One hand, drawn straight up from the centre, after turning by `turn` (0 to 1: a whole turn).
function hand(turn: number, length: number, thickness: number, color: string): void {
  ctx.save();                                   // remember the transform...
  ctx.rotate(turn * 2 * Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(0, -length);
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();                                // ...and go back to it
}

// A clock of radius 150 around (0, 0): wherever the transform puts (0, 0).
function clock(): void {
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d1b18';
  ctx.stroke();

  for (let i = 0; i < 60; i++) {                // 60 ticks: draw one at the top, turn by a sixtieth, again
    ctx.beginPath();
    ctx.moveTo(0, -136);
    ctx.lineTo(0, i % 5 === 0 ? -112 : -126);
    ctx.lineWidth = i % 5 === 0 ? 6 : 2;
    ctx.stroke();
    ctx.rotate((2 * Math.PI) / 60);
  }                                             // 60 sixtieths: a whole turn, back where it started

  hand((HOURS + MINUTES / 60) / 12, 70, 10, '#1d1b18');
  hand(MINUTES / 60, 110, 6, '#1d1b18');
  hand(0.25, 120, 2, '#e63946');
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#e63946';
  ctx.fill();
}

// Where the transform puts (0, 0), and how much it scales: e and f, and a (a is the scale when nothing is turned).
function tell(where: string): void {
  const m = ctx.getTransform();
  console.log(`${where}, (0, 0) is at ${m.e}, ${m.f} and the scale is ${m.a.toFixed(2)}.`);
}

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#f3f1ec';
  ctx.fillRect(0, 0, 640, 400);

  ctx.save();
  ctx.translate(410, 200);                      // (0, 0) is now the middle of the big clock
  clock();
  if (!told) tell('In the big clock');
  ctx.restore();

  ctx.save();
  ctx.translate(110, 110);                      // the small clock: move, then make everything smaller
  ctx.scale(0.45, 0.45);
  clock();
  if (!told) tell('In the small clock');
  ctx.restore();

  if (!told) tell('After restore');
  ctx.end();
  told = true;
});
```

Il terminale mostra:

```text
In the big clock, (0, 0) is at 410, 200 and the scale is 1.00.
In the small clock, (0, 0) is at 110, 110 and the scale is 0.45.
After restore, (0, 0) is at 0, 0 and the scale is 1.00.
```

## Spostare il foglio

Disegnare sessanta tacche intorno a un cerchio con `Math.cos` e `Math.sin` funziona, ma è un sacco di aritmetica. Un canvas ha un
modo più semplice: invece di muovere la penna, **muovi il foglio**. Una trasformazione cambia dove cade tutto ciò che viene
disegnato dopo:

- `ctx.translate(x, y)` sposta il foglio: `(0, 0)` ora si trova in quello che era `(x, y)`.
- `ctx.rotate(angle)` ruota il foglio intorno a `(0, 0)`, di un angolo in radianti (un giro completo è `2 * Math.PI`), in senso
  orario.
- `ctx.scale(sx, sy)` rende tutto più grande o più piccolo: `0.45` è un po' meno della metà. Anche gli spessori delle linee
  diminuiscono.

Si sommano: `translate(110, 110)` poi `scale(0.45, 0.45)` mette `(0, 0)` in (110, 110) e disegna al 45%. Così l'orologio si scrive
una volta sola, intorno a `(0, 0)`, come se fosse solo sulla pagina; dove cade e quanto è grande si decide prima di chiamarlo.

Le tacche usano questo: disegna una tacca dritta in su, ruota il foglio di un sessantesimo di giro, disegna di nuovo la stessa
tacca, sessanta volte. Dopo sessanta rotazioni di un sessantesimo, il foglio è tornato dov'era partito.

`ctx.save()` ricorda la trasformazione (e i colori e le impostazioni delle linee); `ctx.restore()` torna a ciò che era stato
salvato. Ogni lancetta ruota il foglio del proprio angolo, tra un `save` e un `restore`, così la lancetta successiva parte dal
foglio dritto. I salvataggi possono stare dentro altri salvataggi, come la lancetta dentro l'orologio: ogni `restore` annulla
l'ultimo `save`.

`ctx.getTransform()` dà la trasformazione come sei numeri, da `a` a `f`: `e` e `f` sono il punto in cui cade `(0, 0)`, `a` e `d` la
scala quando niente è ruotato. Il programma li stampa per mostrare i tre stati.

## Riga per riga

- `const HOURS = 10, MINUTES = 10;` l'ora che mostrano gli orologi.
- `function hand(turn, length, thickness, color)` disegna una lancetta. `turn` va da 0 (dritta in su, le dodici) a 1 (un giro
  intero).
- `ctx.rotate(turn * 2 * Math.PI);` ruota il foglio di quella parte di giro intero.
- `ctx.moveTo(0, 16); ctx.lineTo(0, -length);` una linea da un po' sotto il centro fino a `length` pixel sopra. Sul foglio è
  sempre dritta in su; è la rotazione a farla puntare sull'ora.
- `function clock()` disegna un orologio intero intorno a `(0, 0)`: il quadrante, le tacche, le lancette e il centro rosso.
- `ctx.lineTo(0, i % 5 === 0 ? -112 : -126);` una tacca ogni cinque (`i % 5 === 0`: `i` diviso per 5 non lascia resto) è più
  lunga e più spessa: le ore.
- `hand((HOURS + MINUTES / 60) / 12, ...)` la lancetta delle ore: 10 ore e 10 minuti sono 10,17 ore, su 12 per un giro.
- `hand(MINUTES / 60, ...)` la lancetta dei minuti: 10 minuti su 60. `hand(0.25, ...)` la lancetta dei secondi a un quarto: 15
  secondi.
- `ctx.save(); ctx.translate(410, 200); clock(); ... ctx.restore();` l'orologio grande, con il centro in (410, 200).
- `ctx.translate(110, 110); ctx.scale(0.45, 0.45);` l'orologio piccolo: lo stesso `clock()`, spostato e rimpicciolito. L'ordine
  conta: il translate è in pixel della finestra; lo scale rimpicciolisce poi ciò che viene dopo.
- `if (!told) tell('After restore');` dopo l'ultimo `restore` il foglio è tornato normale: `(0, 0)` è l'angolo della finestra.

## Prova tu

- Aggiungi un terzo orologio, capovolto: `ctx.rotate(Math.PI)` dopo il suo `translate`.
- Mostra l'ora vera: `const now = new Date();` poi `now.getHours()`, `now.getMinutes()`, `now.getSeconds()`, e muovi la lancetta
  dei secondi con `now.getSeconds() / 60`.
- Fai l'orologio grande più largo che alto: `ctx.scale(1.3, 1)` dopo il suo `translate`. Guarda cosa succede alle tacche.
- Dimentica un `ctx.restore()` in `hand` e guarda: ogni lancetta ruota da dove è finita la precedente.
- Scrivi i numeri sul quadrante: nel ciclo, a ogni quinta tacca, `ctx.fillText(...)` (la lezione 20 mostra come impostare il font e
  centrare il testo).

## Avanti

[19. Un'animazione](19-animation.md): un mulino a vento con le pale che girano e nuvole che passano, frame dopo frame.
