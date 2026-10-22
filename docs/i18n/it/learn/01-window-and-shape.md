---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 1. Una finestra e una forma

**Cosa vedrai:** una finestra con lo sfondo chiaro, un rettangolo viola nell'angolo in alto a sinistra e un cerchio rosa al
centro.

![Un rettangolo viola e un cerchio rosa su uno sfondo chiaro](img/01-window-and-shape.png)

## Il codice

Un programma Zinc è una cartella con due file. Il progetto è in
[`samples/01-window-and-shape`](samples/01-window-and-shape/).

`zinc.json` descrive il progetto:

```json
{
  "name": "window-and-shape",
  "entry": "src/main.ts",
  "app": { "id": "com.example.learn.shape", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts` è il programma:

```ts
import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';

console.log(`The window is ${width()} by ${height()} pixels.`);

onFrame((dt: number) => {
  clear(0xf3f1ec);
  rect(40, 40, 160, 100, 0x5746e0);
  rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);
});
```

Eseguilo:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Si apre la finestra e il terminale mostra `The window is 640 by 400 pixels.`

## Riga per riga

**`zinc.json`**

- `"name"`: il nome del programma. Il titolo della finestra lo usa.
- `"entry"`: il file da cui parte il programma.
- `"app"`: riguarda l'app. `"id"` è un nome che nessun'altra app usa, scritto al contrario come un indirizzo web (`com.example...`).
  `"window"` dà la dimensione della finestra in pixel: 640 di larghezza, 400 di altezza.

**`src/main.ts`**

- `import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';`
  Zinc arriva con dei moduli: insiemi di funzioni già pronte. `zinc:gfx` è quello che disegna. Questa riga prende sei delle sue
  funzioni così il programma può usarle. Importi solo quello che usi.
- `console.log(...)` stampa una riga nel terminale. Tra gli apici inversi, `${width()}` viene sostituito dal valore di
  `width()`: la larghezza della finestra, 640. Stampare è il modo più facile per vedere cosa fa il tuo programma.
- `onFrame((dt: number) => { ... });`
  Questo è il cuore del programma. Dai a `onFrame` una funzione (la parte da `(dt: number) =>` fino alla `}` finale).
  Zinc la chiama a ogni frame, circa 60 volte al secondo, tanto spesso quanto si aggiorna lo schermo. Ogni chiamata disegna di nuovo l'intera
  immagine. Qui l'immagine non cambia mai, quindi vedi un'immagine ferma; la prossima lezione la farà muovere.
  `dt` è il tempo dall'ultimo frame. `: number` dice che `dt` è un numero: Zinc controlla i tipi dei tuoi valori
  prima di eseguire il programma.
- `clear(0xf3f1ec);` colora tutta la finestra con un solo colore. I colori sono numeri scritti `0xRRGGBB`: due cifre per il rosso,
  due per il verde, due per il blu, da `00` (niente) a `ff` (al massimo). `0xf3f1ec` è un grigio chiaro caldo. È lo stesso codice di
  `#f3f1ec` sul web, con `0x` davanti invece di `#`.
- `rect(40, 40, 160, 100, 0x5746e0);` disegna un rettangolo pieno. I numeri sono, in ordine: x, y, larghezza, altezza, colore.
  x conta i pixel dal bordo sinistro della finestra, y conta i pixel verso il basso dal bordo in alto. Quindi l'angolo in alto a sinistra di
  questo rettangolo è a 40 pixel da sinistra e a 40 dall'alto, ed è largo 160 e alto 100.
- `rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);` disegna un rettangolo con gli angoli arrotondati.
  Dopo x, y, larghezza e altezza arrivano il raggio degli angoli (60) e il colore, poi l'opacità: 255 è pieno,
  0 è invisibile, 128 è semitrasparente. Un quadrato di 120 con angoli di 60 (metà della sua dimensione) è un cerchio.
  `width() / 2` è il centro della finestra; meno 60 (metà del cerchio) mette il centro del cerchio esattamente lì.

L'ordine delle chiamate di disegno conta: quello che disegni dopo copre quello che hai disegnato prima. Per questo `clear` viene per primo.

## Prova questo

- Cambia il colore dello sfondo in `0x1c1b20` (quasi nero).
- Sposta il rettangolo nell'angolo in basso a destra. Suggerimento: `width() - 200` è a 200 pixel dal bordo destro.
- Fai il cerchio più grande (ricorda: il raggio è metà della dimensione). Poi dagli una larghezza di 200 e tieni il resto: diventa
  una pillola.
- Dai al cerchio un'opacità di 128 e spostalo sopra il rettangolo per vedere attraverso.
- Aggiungi `line(0, 0, width(), height(), 0x1d1b18);` (aggiungi `line` alla riga di import): una linea sottile che attraversa la finestra.
- Cambia la dimensione della finestra in `zinc.json`. Il cerchio resta al centro perché il codice usa `width()` e `height()`.

## Avanti

[2. Colori e movimento](02-colours-and-movement.md): fai muovere le cose, in modo fluido, alla stessa velocità su ogni macchina.
