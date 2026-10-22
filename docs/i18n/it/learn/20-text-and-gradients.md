---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 20. Testo e gradienti

**Cosa vedrai:** un manifesto per una festa d'estate. Il cielo sfuma dal rosa in alto al giallo pallido in basso, un morbido sole
giallo brilla al centro, *Summer Fair* è scritto in grande e centrato, la data sta in una pillola bianca subito sotto, e due
piccole scritte occupano gli angoli in basso.

![Un manifesto: "Summer Fair" su un cielo da rosa a giallo con un sole luminoso, la data in una pillola bianca](img/20-text-and-gradients.png)

## Il codice

Il progetto è in [`samples/20-text-and-gradients`](samples/20-text-and-gradients/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TITLE = 'Summer Fair';
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());

  // the sky: a linear gradient from the top of the window to the bottom
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#ff9a8b');
  sky.addColorStop(0.6, '#ffc3a0');
  sky.addColorStop(1, '#ffe8c2');
  ctx.fillGradient = sky;                    // on the web: ctx.fillStyle = sky
  ctx.fillRect(0, 0, 640, 400);

  // the sun: a radial gradient, yellow in the middle, fading out at the edge
  const glow = ctx.createRadialGradient(320, 250, 30, 320, 250, 150);
  glow.addColorStop(0, 'rgba(255, 236, 140, 1)');
  glow.addColorStop(1, 'rgba(255, 236, 140, 0)');
  ctx.fillGradient = glow;
  ctx.beginPath();
  ctx.arc(320, 250, 150, 0, 2 * Math.PI);
  ctx.fill();

  // the title, centred: textAlign says which point of the text x is
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(TITLE, 320, 130);

  // a label in a pill: measureText says how wide the text is, the pill is drawn around it
  ctx.font = '20px sans-serif';
  const words = 'Saturday, 10 am to 6 pm';
  const w = ctx.measureText(words).width;
  ctx.beginPath();
  ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(words, 320, 180);

  // two corners: x is where the text starts (left) or where it ends (right)
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#7b2cbf';
  ctx.textAlign = 'left';
  ctx.fillText('Town square', 24, 370);
  ctx.textAlign = 'right';
  ctx.fillText('Free entry', 616, 370);

  if (!told) {
    ctx.font = 'bold 56px sans-serif';
    console.log(`The title is ${Math.round(ctx.measureText(TITLE).width)} pixels wide, the label ${Math.round(w)}.`);
    told = true;
  }
  ctx.end();
});
```

Il terminale mostra (i numeri dipendono un po' dal font):

```text
The title is 347 pixels wide, the label 229.
```

## Gradienti

Un **gradiente** è una vernice che cambia colore lungo la strada. Ne crei uno, gli dai dei colori in punti lungo la sua
lunghezza, poi dipingi con esso:

- `ctx.createLinearGradient(x0, y0, x1, y1)` cambia lungo una linea, da (x0, y0) a (x1, y1). Da (0, 0) a (0, 400) va dall'alto al
  basso.
- `ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)` cambia da un cerchio a un altro: qui dal cerchio piccolo di raggio 30 a
  quello grande di raggio 150, entrambi intorno al centro del sole.
- `addColorStop(offset, colour)` mette un colore in un punto del gradiente: `0` è l'inizio, `1` la fine, `0.6` un po' oltre la
  metà. Tra due punti i colori si fondono. Un colore può essere trasparente: `rgba(255, 236, 140, 0)` è lo stesso giallo con
  un'opacità di 0, così il sole sfuma nel cielo.

Sul web scriveresti `ctx.fillStyle = sky`. Zinc scrive `ctx.fillGradient = sky`, perché in Zinc un campo ha un solo tipo e
`fillStyle` è un testo. Impostare di nuovo `fillStyle` a un colore (`ctx.fillStyle = 'white'`) ferma il gradiente, come sul web.

## Testo

`ctx.fillText(text, x, y)` scrive il testo con il colore di `fillStyle`. Tre impostazioni dicono come:

- `ctx.font` si scrive come in CSS: `'bold 56px sans-serif'` (grassetto, alto 56 pixel, il font sans-serif che arriva con Zinc),
  oppure `'20px monospace'`.
- `ctx.textAlign` dice quale punto del testo è `x`: `'left'` (o `'start'`, il predefinito) il suo inizio, `'center'` il suo
  centro, `'right'` la sua fine. Quindi `textAlign = 'center'` e `x = 320` centrano un testo in una finestra larga 640 pixel,
  qualunque sia la sua lunghezza.
- `ctx.textBaseline` dice quale linea del testo è `y`: `'alphabetic'` (il predefinito) la linea su cui poggiano le lettere,
  `'top'` la cima, `'middle'` il mezzo. `'middle'` è il modo facile di centrare un testo in un riquadro: `y` è il centro del
  riquadro.

`ctx.measureText(text).width` dice quanto sarà largo un testo con il font corrente, prima di disegnarlo: qui, per dimensionare la
pillola bianca in modo che la data ci stia con 18 pixel per lato.

## Riga per riga

- `const sky = ctx.createLinearGradient(0, 0, 0, 400);` un gradiente dall'alto al basso della finestra.
- `sky.addColorStop(0, '#ff9a8b'); sky.addColorStop(0.6, '#ffc3a0'); sky.addColorStop(1, '#ffe8c2');` rosa in alto, pesca un po'
  sotto la metà, giallo pallido in basso.
- `ctx.fillGradient = sky; ctx.fillRect(0, 0, 640, 400);` tutta la finestra, dipinta con il gradiente.
- `ctx.createRadialGradient(320, 250, 30, 320, 250, 150);` dentro il raggio 30 il primo colore, oltre 150 l'ultimo, in mezzo una
  sfumatura.
- `ctx.arc(320, 250, 150, 0, 2 * Math.PI); ctx.fill();` il disco su cui è dipinto il bagliore: grande quanto il cerchio esterno
  del gradiente, così il suo bordo è del tutto trasparente e non si vede.
- `ctx.font = 'bold 56px sans-serif'; ctx.fillText(TITLE, 320, 130);` il titolo, con il centro a x = 320, poggiato sulla linea
  y = 130.
- `const w = ctx.measureText(words).width;` la larghezza della data nel font da 20 pixel.
- `ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);` la pillola: larga quanto il testo più 18 pixel per lato, alta 40, con
  le estremità tonde (un raggio di metà della sua altezza).
- `ctx.textBaseline = 'middle'; ctx.fillText(words, 320, 180);` la data, centrata nella pillola in entrambe le direzioni: 180 è il
  centro della pillola (160 + 40 / 2).
- `ctx.textAlign = 'left'; ctx.fillText('Town square', 24, 370);` parte a 24 pixel dal bordo sinistro.
  `ctx.textAlign = 'right'; ctx.fillText('Free entry', 616, 370);` finisce a 24 pixel dal bordo destro.

## Prova tu

- Fai del cielo un tramonto: un gradiente lineare da sinistra a destra, `createLinearGradient(0, 0, 640, 0)`, da arancione a
  viola.
- Dipingi il titolo con un gradiente: `ctx.fillGradient = ...` prima del suo `fillText`. Zinc disegna il testo con il primo colore
  del gradiente (una differenza dal web, elencata nella [pagina di zinc:canvas](../plugins/canvas2d.md#deviations-from-the-web)).
- Aggiungi una seconda pillola sotto la prima, *Free entry*, dimensionata anch'essa con `measureText`.
- Scrivi il tuo nome in basso al centro, con `textAlign = 'center'`.
- Fai pulsare il sole: dai al gradiente radiale un raggio esterno di `150 + 20 * Math.sin(time)`, con un `time` che cresce di `dt`.

## Dove andare ora

Sai disegnare con il canvas del web: tracciati, riempimenti e contorni, trasformazioni, animazioni, testo e gradienti.

- [La pagina di zinc:canvas](../plugins/canvas2d.md): ogni funzione, un `Canvas` fuori schermo i cui pixel restano tra un frame e
  l'altro, le immagini, e le differenze dal web.
- `zinc new canvas` crea uno sketch da cui partire: un cielo a gradiente, una stella che gira, bolle dove clicchi.
- [`examples/canvas/sketch`](../../examples/canvas/sketch/main.tsx) nel repository: un orologio, fuochi d'artificio e forme
  disegnate in canvas dentro un'interfaccia.
- [Quattro modi di scrivere un programma](../start/styles.md): come il canvas si mescola con gli altri stili. [Torna all'inizio del
  percorso](README.md).
