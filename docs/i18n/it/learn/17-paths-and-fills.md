---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 17. Tracciati e riempimenti

**Cosa vedrai:** una casa su un prato verde sotto un cielo azzurro: pareti color crema con un contorno marrone, un tetto rosso,
una porta con gli angoli arrotondati, una finestra con una croce, un sentiero che curva nell'erba e un sole giallo.

![Una casa con il tetto rosso, una porta, una finestra e un sentiero curvo, sotto un cielo azzurro con un sole giallo](img/17-paths-and-fills.png)

La parte 4 disegna con il **canvas del web**: il `CanvasRenderingContext2D` che le pagine web usano per disegnare in un
`<canvas>`. Se hai seguito un tutorial sul canvas su MDN o hai disegnato grafici in JavaScript, queste chiamate le conosci già.
In Zinc non ci sono né una pagina né un elemento `<canvas>`: la finestra è il canvas, e il ciclo dei frame della parte 1 chiama il
tuo disegno. Usa il modulo `zinc:canvas`.

## Il codice

Il progetto è in [`samples/17-paths-and-fills`](samples/17-paths-and-fills/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());   // the canvas is the whole window

  // the sky and the grass: rectangles
  ctx.fillStyle = '#bde0fe';
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 300, 640, 100);

  // the sun: a full circle
  ctx.beginPath();
  ctx.arc(540, 80, 44, 0, 2 * Math.PI);
  ctx.fillStyle = 'gold';
  ctx.fill();

  // the walls of the house, filled then outlined
  ctx.fillStyle = '#f4e1c1';
  ctx.fillRect(220, 180, 200, 140);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5c4033';
  ctx.strokeRect(220, 180, 200, 140);

  // the roof: a path of three points, closed
  ctx.beginPath();
  ctx.moveTo(200, 184);
  ctx.lineTo(320, 90);
  ctx.lineTo(440, 184);
  ctx.closePath();
  ctx.fillStyle = '#c0392b';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!told) {
    console.log(`Is 320, 140 in the roof? ${ctx.isPointInPath(320, 140)}. And 120, 140? ${ctx.isPointInPath(120, 140)}.`);
  }

  // the door: a rectangle with round corners
  ctx.beginPath();
  ctx.roundRect(295, 240, 50, 80, 10);
  ctx.fillStyle = '#8e5a3c';
  ctx.fill();

  // a window: two lines make the cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(245, 210, 40, 40);
  ctx.strokeRect(245, 210, 40, 40);
  ctx.beginPath();
  ctx.moveTo(265, 210);
  ctx.lineTo(265, 250);
  ctx.moveTo(245, 230);
  ctx.lineTo(285, 230);
  ctx.lineWidth = 2;
  ctx.stroke();

  // a path in the grass: a curve
  ctx.beginPath();
  ctx.moveTo(320, 320);
  ctx.quadraticCurveTo(300, 360, 360, 400);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d9c5a0';
  ctx.stroke();

  ctx.end();
  told = true;
});
```

Il terminale mostra:

```text
Is 320, 140 in the roof? true. And 120, 140? false.
```

## Una penna con le impostazioni

Il canvas disegna come una penna che regoli prima di ogni linea:

1. **Scegli il colore.** `ctx.fillStyle` è il colore che riempie le forme, `ctx.strokeStyle` il colore dei contorni,
   `ctx.lineWidth` lo spessore dei contorni. I colori si scrivono come sul web: `'#c0392b'`, `'gold'`, `'rgb(255, 120, 60)'`,
   `'rgba(0, 0, 0, 0.5)'` (mezzo trasparente).
2. **Costruisci un tracciato.** `ctx.beginPath()` ne inizia uno nuovo. `moveTo(x, y)` solleva la penna e la appoggia in un punto;
   `lineTo(x, y)` disegna una linea retta fino a un altro; `arc(x, y, radius, start, end)` un pezzo di cerchio;
   `quadraticCurveTo` e `bezierCurveTo` delle curve; `rect` e `roundRect` rettangoli interi; `closePath()` torna al primo punto.
   Ancora non si vede niente: un tracciato è solo un piano.
3. **Coloralo.** `ctx.fill()` riempie l'interno del tracciato con `fillStyle`; `ctx.stroke()` ne disegna il contorno con
   `strokeStyle` e `lineWidth`. Puoi fare entrambe le cose, sullo stesso tracciato.

I rettangoli sono così comuni che hanno forme brevi che non richiedono un tracciato: `fillRect(x, y, w, h)` e
`strokeRect(x, y, w, h)`.

Le impostazioni restano finché non le cambi: dopo `ctx.lineWidth = 4`, ogni contorno è spesso 4 pixel, in questo frame e nei
successivi (anche sul web). Per questo il programma imposta lo spessore della linea prima di ogni contorno che ne vuole uno
diverso.

`ctx.begin(0, 0, width(), height())` e `ctx.end()` sono di Zinc: dicono "il canvas è tutta la finestra, per questo frame". Tutto
ciò che disegni va tra i due.

## Riga per riga

- `import { onFrame, width, height } from 'zinc:gfx';` il ciclo dei frame e la dimensione della finestra, dalla parte 1.
  `zinc:canvas` si limita a disegnare.
- `const ctx = new CanvasRenderingContext2D();` il contesto: la penna e le sue impostazioni. Sul web scriveresti
  `canvas.getContext('2d')`; qui lo crei tu, una volta.
- `ctx.fillStyle = '#bde0fe'; ctx.fillRect(0, 0, 640, 400);` colora tutta la finestra di azzurro chiaro: ogni frame parte dal
  cielo, come faceva `clear` nella parte 1.
- `ctx.arc(540, 80, 44, 0, 2 * Math.PI);` un cerchio intorno a (540, 80) con raggio 44: un arco dall'angolo 0 a un giro intero,
  `2 * Math.PI`. `fill()` lo rende un disco.
- `ctx.strokeRect(220, 180, 200, 140);` il contorno delle pareti, disegnato sopra il rettangolo pieno. Un contorno è centrato sul
  bordo: metà dei suoi 4 pixel cade dentro, metà fuori.
- `ctx.moveTo(200, 184); ctx.lineTo(320, 90); ctx.lineTo(440, 184); ctx.closePath();` il tetto: un triangolo, dall'angolo
  sinistro su fino alla punta, giù all'angolo destro, e di nuovo al punto di partenza.
- `ctx.lineJoin = 'round';` gli angoli di un contorno: `'miter'` (appuntito, il predefinito), `'round'` (arrotondato) o `'bevel'`
  (tagliato).
- `ctx.isPointInPath(320, 140)` chiede se un punto è dentro il tracciato corrente, qui il tetto. È così che un programma canvas sa
  che un clic è caduto su una forma (la [pagina degli stili](../start/styles.md#canvas-zinccanvas) lo usa su una pallina).
- `ctx.roundRect(295, 240, 50, 80, 10);` un rettangolo con angoli di raggio 10, aggiunto a un nuovo tracciato.
- `ctx.moveTo(265, 210); ctx.lineTo(265, 250); ctx.moveTo(245, 230); ctx.lineTo(285, 230);` un tracciato con due linee separate:
  `moveTo` solleva la penna tra l'una e l'altra. Un solo `stroke()` le disegna entrambe.
- `ctx.quadraticCurveTo(300, 360, 360, 400);` una curva dal punto corrente (320, 320) a (360, 400), tirata verso (300, 360) lungo
  la strada, come la tirerebbe una calamita.
- `ctx.lineCap = 'round';` le estremità di una linea aperta: `'butt'` (tagliata dritta alla fine, il predefinito), `'round'` o
  `'square'`.
- `told = true;` la riga viene stampata solo nel primo frame.

## Prova tu

- Dipingi il sole con un spesso contorno arancione: `ctx.lineWidth = 6; ctx.strokeStyle = 'orange'; ctx.stroke();` dopo il suo
  `fill()`.
- Disegna una seconda finestra a destra della porta.
- Aggiungi un camino sul tetto: un `fillRect` disegnato prima del tetto, così il tetto ne copre la parte bassa.
- Disegna una staccionata lungo l'erba con un ciclo: `for (let x = 10; x < 640; x += 30) ctx.fillRect(x, 280, 8, 40);`.
- Sostituisci la curva quadratica con `ctx.bezierCurveTo(260, 350, 420, 370, 360, 400)`: due calamite, un sentiero a forma di S.
- Ogni funzione del contesto, e le poche differenze dal web, sono nella [pagina di zinc:canvas](../plugins/canvas2d.md).

## Avanti

[18. Trasformazioni](18-transforms.md): sposta, ruota e rimpicciolisci il foglio sotto la penna, e disegna un orologio.
