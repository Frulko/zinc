---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 4. Il mouse e il tocco

**Cosa vedrai:** una pagina su cui disegni. Premi e muovi il mouse (o un dito su uno schermo touch) per tracciare una linea. La
rotellina rende il pennello più spesso o più sottile, il tasto destro cancella la pagina, e ogni dito su uno schermo touch mostra un
anello rosa.

![Due linee viola, una sottile e una spessa, e due anelli rosa](img/04-mouse-and-touch.png)

## Il codice

Il progetto è in [`samples/04-mouse-and-touch`](samples/04-mouse-and-touch/). `src/main.ts`:

```ts
import { onFrame, clear, stroke, rrect, font, drawText, pointerX, pointerY, pointerDown, pointerButtons, wheel, touchCount, touchX, touchY } from 'zinc:gfx';

const lines: number[][] = [];   // every line drawn so far, as points: [x0, y0, x1, y1, ...]
const sizes: number[] = [];     // the brush size of each line
let brush = 6;
let wasDown = false;
const label = font('sans', 18);

onFrame((dt: number) => {
  const x = pointerX(), y = pointerY(), down = pointerDown();

  if (down && !wasDown) {                       // just pressed: start a new line
    lines.push([x, y]);
    sizes.push(brush);
    console.log(`pressed at ${Math.round(x)}, ${Math.round(y)}`);
  } else if (down) {                            // still pressed: add a point, if the pointer moved
    const line = lines[lines.length - 1];
    if (x !== line[line.length - 2] || y !== line[line.length - 1]) {
      line.push(x);
      line.push(y);
    }
  } else if (wasDown) {                         // just released
    console.log(`released at ${Math.round(x)}, ${Math.round(y)}: ${lines.length} line(s)`);
  }
  wasDown = down;

  if ((pointerButtons() & 2) !== 0) {           // the right button wipes the page
    lines.splice(0, lines.length);
    sizes.splice(0, sizes.length);
  }
  if (wheel() !== 0) {                          // the wheel changes the brush
    brush = Math.max(2, Math.min(40, brush + wheel() * 2));
    console.log(`brush ${brush}`);
  }

  clear(0xfffefc);
  for (let i = 0; i < lines.length; i++) stroke(lines[i], sizes[i], 0x5746e0, 255, false);
  for (let i = 0; i < touchCount(); i++) {      // one ring under each finger on a touch screen
    rrect(touchX(i) - 30, touchY(i) - 30, 60, 60, 30, 0xf27aa6, 110);
  }
  rrect(x - brush / 2, y - brush / 2, brush, brush, brush / 2, 0x1d1b18, 90);
  drawText(label, 16, 12, `brush ${brush}   lines ${lines.length}   fingers ${touchCount()}`, 0x625d55, 255, 0);
});
```

Disegna: il terminale mostra dove hai premuto e rilasciato, per esempio `pressed at 80, 120`, poi
`released at 340, 180: 1 line(s)`.

## Il puntatore

`zinc:gfx` chiama il mouse il **puntatore**. Su uno schermo touch anche il primo dito è il puntatore, quindi lo stesso codice funziona
con un mouse, un trackpad, una penna o un dito:

| Funzione | Cosa dà |
|---|---|
| `pointerX()`, `pointerY()` | dove si trova il puntatore, in pixel dall'angolo in alto a sinistra della finestra |
| `pointerDown()` | `true` finché il pulsante principale (o un dito) è premuto |
| `pointerButtons()` | tutti i pulsanti premuti: 1 sinistro, 2 destro, 4 centrale, sommati |
| `wheel()` | di quanti scatti ha girato la rotellina in questo frame: più di 0 su, meno di 0 giù |
| `touchCount()` | quante dita toccano lo schermo; `touchX(i)`, `touchY(i)` dove si trova il dito `i` |

Non esiste una funzione "clic": un clic è il momento in cui `pointerDown()` diventa `true`. Il programma lo trova ricordando
il valore del frame precedente, in `wasDown`.

## Riga per riga

- `const lines: number[][] = [];` tutte le linee disegnate finora. Una linea è una lista di numeri, `[x0, y0, x1, y1, ...]`
  (`number[]`), quindi tutte le linee sono una lista di liste (`number[][]`). Parte vuota: `[]`.
- `const sizes: number[] = [];` la dimensione del pennello di ogni linea, nello stesso ordine.
- `const x = pointerX(), y = pointerY(), down = pointerDown();` legge il puntatore una volta all'inizio del frame.
- `if (down && !wasDown)` premuto adesso e non prima: il pulsante è appena stato premuto. `lines.push([x, y])` aggiunge una nuova linea
  che parte da qui; `push` aggiunge in fondo a una lista.
- `else if (down)` ancora premuto: il puntatore sta trascinando. `lines[lines.length - 1]` è l'ultima linea, quella che si sta disegnando.
  Il suo ultimo punto è `line[line.length - 2]`, `line[line.length - 1]`; il nuovo punto si aggiunge solo se il puntatore si è mosso.
- `else if (wasDown)` rilasciato adesso, premuto prima: il pulsante è appena stato rilasciato.
- `wasDown = down;` ricorda il valore di questo frame per il frame successivo.
- `if ((pointerButtons() & 2) !== 0)` il tasto destro è premuto? `&` tiene la parte del numero che vale 2: non è
  0 quando il tasto destro è tra i pulsanti premuti. `splice(0, lines.length)` svuota una lista.
- `brush + wheel() * 2` ogni scatto della rotellina cambia il pennello di 2 pixel, tenuto tra 2 e 40.
- `stroke(lines[i], sizes[i], 0x5746e0, 255, false);` disegna una linea che passa per tutti i punti di una lista, con le estremità rotonde.
  Gli argomenti: i punti, lo spessore, il colore, l'opacità, e `false` per una linea aperta (`true` riunirebbe l'
  ultimo punto al primo).
- `for (let i = 0; i < touchCount(); i++)` un anello per dito, trasparente (opacità 110 su 255).
- L'ultimo `rrect` è un piccolo punto scuro che segue il puntatore, grande quanto il pennello.
- `drawText(...)` mostra la dimensione del pennello, il numero di linee e il numero di dita.

## Prova questo

- Dai a ogni linea un colore suo: tieni una lista di colori come `sizes`, e scegli un nuovo colore a ogni pressione.
- Fai in modo che il tasto centrale (4) annulli l'ultima linea: `lines.pop()` e `sizes.pop()`.
- Disegna con tutte le dita insieme: una linea per dito, usando `touchId(i)` per sapere quale dito è quale da un frame al
  successivo.
- Aggiungi forme `closed`: disegna la linea con `true` come ultimo argomento e guardala chiudersi.
- Disegna un punto morbido a ogni punto invece di una linea: `rrect` con un'opacità bassa, per una vernice spray.
- Tratti veloci con una penna: `penCount()`, `penX(i)`, `penY(i)` e `penPressure(i)` danno ogni campione della penna dall'
  ultimo frame, con la sua pressione da 0 a 1 (il [riferimento](../reference/gfx.md#input) li elenca).

## Avanti

[5. Testo e immagini](05-text-and-images.md): scrivi parole e mostra immagini.
