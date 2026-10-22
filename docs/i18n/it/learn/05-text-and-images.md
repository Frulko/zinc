---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 5. Testo e immagini

**Cosa vedrai:** un titolo al centro in alto, un razzo che ondeggia su e giù e due righe di testo più piccolo
in basso, una delle quali conta i secondi.

![Un razzo sotto il titolo "Hello, space"](img/05-text-and-images.png)

## Il codice

Il progetto è in [`samples/05-text-and-images`](samples/05-text-and-images/). Ha una terza parte: una cartella `assets`
con l'immagine, `rocket.svg`. `zinc.json` nomina quella cartella:

```json
{
  "name": "text-and-images",
  "entry": "src/main.ts",
  "assets": "assets",
  "app": { "id": "com.example.learn.text", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts`:

```ts
import { onFrame, clear, font, drawText, textWidth, lineHeight, image, imageWidth, imageHeight, drawImage, width, height } from 'zinc:gfx';

const title = font('sans-bold', 40);
const body = font('sans', 18);
const rocket = image('rocket.svg');   // the file assets/rocket.svg

console.log(`The rocket picture is ${imageWidth(rocket)} by ${imageHeight(rocket)} pixels.`);

let time = 0;

onFrame((dt: number) => {
  time += dt;
  clear(0x1c1b20);

  // A title in the middle: measure it, then start half of what is left from the left edge.
  const words = 'Hello, space';
  const w = textWidth(title, words, 0);
  drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);

  // Two lines of smaller text, one under the other.
  const left = 40;
  let y = height() - 2 * lineHeight(body) - 30;
  drawText(body, left, y, 'Pictures come from the assets folder.', 0xbcb6ab, 255, 0);
  y += lineHeight(body);
  drawText(body, left, y, `Flight time: ${Math.floor(time)} s`, 0xbcb6ab, 255, 0);

  // The picture, bobbing up and down, drawn at twice its size.
  const size = imageWidth(rocket) * 2;
  const bob = Math.sin(time * 3) * 10;
  drawImage(rocket, (width() - size) / 2, height() / 2 - size / 2 + bob, size, size, 255, 0);
});
```

Il terminale mostra `The rocket picture is 96 by 96 pixels.`

## I font

Prima di scrivere, chiedi un font: una famiglia e una dimensione in pixel, una volta sola, all'inizio. Zinc ti restituisce un numero che
rappresenta quel font, e ogni chiamata di testo usa quel numero. Le famiglie che arrivano con Zinc:

| Famiglia | Aspetto |
|---|---|
| `'sans'` | lettere semplici (Inter) |
| `'sans-bold'` | lo stesso, in grassetto |
| `'mono'` | ogni lettera larga come le altre, per il codice (JetBrains Mono) |

Un font tutto tuo: metti un file `.ttf` in `assets` e chiedi `loadFont('MyFont.ttf', 32)`.

## Riga per riga

- `const title = font('sans-bold', 40);` un font in grassetto, alto 40 pixel. `body` è uno normale a 18.
- `const rocket = image('rocket.svg');` un'immagine dalla cartella `assets`, tramite il nome del file. Funzionano PNG e SVG. Come un
  font, ottieni un numero che rappresenta l'immagine. Se il file manca, il numero è `-1` e non si disegna nulla.
- `imageWidth(rocket)`, `imageHeight(rocket)`: la dimensione dell'immagine, in pixel.
- `const w = textWidth(title, words, 0);` quanto saranno larghe le parole con quel font, prima di disegnarle. L'ultimo
  argomento è lo spazio extra tra le lettere, 0 per nessuno.
- `drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);` scrive le parole. Gli argomenti: il font, x e
  y dell'angolo in alto a sinistra del testo, le parole, il colore, l'opacità, lo spazio extra tra le lettere.
  `(width() - w) / 2` centra il testo: quello che resta della larghezza, diviso in due, da ogni lato.
- `lineHeight(body)` è l'altezza di una riga con quel font, con lo spazio tra le righe. Il programma parte da due righe
  e un margine sopra il fondo, poi scende di un'altezza di riga per la seconda riga.
- `` `Flight time: ${Math.floor(time)} s` `` costruisce il testo a ogni frame. `Math.floor` toglie quello che c'è dopo la virgola,
  quindi il numero cambia una volta al secondo.
- `drawImage(rocket, x, y, size, size, 255, 0);` disegna l'immagine in una scatola: x, y, larghezza, altezza, opacità e
  raggio degli angoli arrotondati (0: angoli squadrati). La scatola è grande il doppio dell'immagine, quindi viene disegnata il doppio più grande. Un'immagine
  SVG è un disegno, non dei punti, quindi resta nitida.
- `Math.sin(time * 3) * 10` fa andare il razzo su e giù di 10 pixel, tre volte più veloce di un secondo.

## Prova questo

- Scrivi il tuo nome sotto il titolo, centrato anche lui.
- Fai comparire il titolo piano piano: un'opacità di `Math.min(255, time * 100)`.
- Scrivi una frase lunga e vai a capo da solo: dividila in parole, misura ognuna con `textWidth`, e inizia una nuova riga
  quando la parola successiva non ci sta (l'esempio *Text* di Atelier lo fa).
- Disegna il razzo più piccolo, tante volte, in posti a caso: `Math.random() * width()`. Scegli i posti una volta sola, prima di
  `onFrame`, altrimenti saltano a ogni frame.
- Disegna una tua immagine in un qualsiasi editor vettoriale (Inkscape, Figma), esportala come SVG in `assets` e mostrala.
- Gira il razzo con le frecce: `drawImageRect` accetta una rotazione (il [riferimento](../reference/gfx.md#images)
  mostra come).

## Avanti

[6. Suono](06-sound.md): suona delle note.
