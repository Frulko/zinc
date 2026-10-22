---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 2. Colori e movimento

**Cosa vedrai:** una palla arancione rotola sull'erba verde da sinistra a destra, ricompare a sinistra quando esce
dalla finestra, e il cielo passa lentamente dal blu scuro al viola e ritorna.

![Una palla arancione sull'erba verde sotto un cielo blu scuro](img/02-colours-and-movement.png)

## Il codice

Il progetto è in [`samples/02-colours-and-movement`](samples/02-colours-and-movement/); il suo `zinc.json` è quello della
lezione 1 con un altro nome. `src/main.ts`:

```ts
import { onFrame, clear, rrect, rect, width, height } from 'zinc:gfx';

function rgb(red: number, green: number, blue: number): u32 {
  return Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue);
}

const SPEED = 160;   // pixels per second
const SIZE = 60;
let x = 0;           // the left edge of the ball
let time = 0;        // seconds since the start
let told = false;

onFrame((dt: number) => {
  time += dt;
  x += SPEED * dt;
  if (x > width()) x = -SIZE;

  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the ball is at x = ${Math.round(x)}.`);
    told = true;
  }

  const glow = (Math.sin(time * 2) + 1) / 2;   // goes from 0 to 1 and back, again and again
  clear(rgb(20, 20, 40 + 60 * glow));
  rect(0, height() - 40, width(), 40, 0x2f8f57);
  rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);
});
```

Dopo un secondo il terminale mostra `After 1.00 seconds the ball is at x = 160.` (sul tuo computer i numeri possono essere un
po' diversi, come spiega la parte seguente).

## Come funziona il movimento

Un film è una serie di immagini ferme mostrate in fretta. Un programma fa lo stesso: a ogni frame disegna un'immagine in cui la
palla è un po' più avanti. Per muovere la palla cambi un numero (`x`) e disegni la palla in `x`.

Di quanto deve avanzare la palla a ogni frame? Non di un numero fisso di pixel: uno schermo veloce mostra 120 frame al secondo, una macchina lenta
30, e la palla rotolerebbe quattro volte più veloce sull'uno che sull'altra. Invece dai una velocità in pixel al
**secondo** e la moltiplichi per `dt`, il tempo dall'ultimo frame, in secondi. A 60 frame al secondo `dt` è circa
0,0167, quindi la palla si muove di 160 × 0,0167 ≈ 2,7 pixel per frame; a 30 frame al secondo si muove del doppio a ogni frame, ma
la metà delle volte. In ogni caso percorre 160 pixel in un secondo.

## Riga per riga

- `function rgb(red: number, green: number, blue: number): u32 { ... }` crea una funzione tua. Prende tre
  numeri da 0 a 255 e restituisce il colore che formano. `: u32` dice che restituisce un numero intero che non può essere
  negativo: il tipo dei colori in `zinc:gfx`.
- `Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue)` costruisce il numero del colore. `0xRRGGBB` è il rosso
  per 65536, più il verde per 256, più il blu: `rgb(255, 0, 0)` è `0xff0000`, rosso puro. `Math.round` trasforma
  `127.6` in `128`, perché ogni parte deve essere un numero intero.
- `const SPEED = 160;` un valore che non cambia mai è una `const`. Scriverlo in maiuscolo è un'abitudine che significa "un'impostazione".
  Il commento dopo `//` è per le persone; Zinc lo ignora.
- `let x = 0;` un valore che cambia è un `let`. `x` è dove si trova la palla; `time` conta i secondi dall'inizio;
  `told` ricorda se il programma ha già stampato la sua riga.
- `time += dt;` aggiunge il tempo di questo frame a `time`. `x += SPEED * dt;` muove la palla della sua velocità per il tempo.
- `if (x > width()) x = -SIZE;` quando la palla è uscita dalla finestra a destra, rimettila appena fuori a sinistra.
- `if (!told && time >= 1) { ... }` parte una sola volta: quando è passato un secondo e non è ancora stato stampato nulla (`!told` significa
  "told è falso"). `time.toFixed(2)` scrive il numero con due cifre dopo la virgola.
- `const glow = (Math.sin(time * 2) + 1) / 2;` `Math.sin` va dolcemente da -1 a 1 e ritorna, per sempre. Aggiungere 1 e
  dividere per 2 lo fa andare invece da 0 a 1. `time * 2` lo fa andare due volte più veloce. È il modo più facile per far
  pulsare, ondeggiare o respirare qualcosa.
- `clear(rgb(20, 20, 40 + 60 * glow));` il cielo: il suo blu va da 40 a 100 mentre `glow` va da 0 a 1.
- `rect(0, height() - 40, width(), 40, 0x2f8f57);` l'erba: una fascia verde alta 40 pixel in basso.
- `rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);` la palla, appoggiata
  sull'erba. Il suo colore va dall'arancione al giallo con `glow`.

## Prova questo

- Fai andare la palla due volte più veloce. Poi falla andare all'indietro: una velocità negativa (e cambia l'`if` perché torni
  a destra).
- Falla rimbalzare: tieni una velocità `vy` per su e giù, aggiungi `vy += 900 * dt` a ogni frame (gravità), `y += vy * dt`, e quando
  la palla tocca l'erba, `vy = -vy * 0.8`.
- Fai girare la palla intorno al centro della finestra: `const bx = width() / 2 + Math.cos(time) * 100` e
  `const by = height() / 2 + Math.sin(time) * 100`.
- Usa `rgb` anche per l'erba e fallo cambiare colore con l'ora del giorno: un giorno intero in 20 secondi.
- Disegna dieci palle in un ciclo: `for (let i = 0; i < 10; i++) { ... }`, ognuna un po' più in ritardo di quella prima.

## Avanti

[3. La tastiera](03-keyboard.md): muovi un quadrato con le frecce.
