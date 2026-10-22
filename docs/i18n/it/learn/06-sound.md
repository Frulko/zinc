---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 6. Suono

**Cosa vedrai (e sentirai):** otto barre colorate, una per ogni nota di una scala. Clicca una barra, o premi un tasto da 1 a 8,
e la sua nota suona mentre la barra si illumina e cresce.

![Otto barre colorate chiamate C D E F G A B C](img/06-sound.png)

## Il codice

Il progetto è in [`samples/06-sound`](samples/06-sound/). `src/main.ts`:

```ts
import { tone } from 'zinc:audio';
import { onFrame, clear, rrect, font, drawText, textWidth, width, height, pointerX, pointerDown, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const HERTZ = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3];   // how fast the air shakes, per second
const COLORS: u32[] = [0x5746e0, 0x2563c9, 0x0e7c86, 0x2f8f57, 0xb7791f, 0xcf3a2b, 0xb5357d, 0x5746e0];

const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));   // made once, played many times
const glow: number[] = HERTZ.map((hz: number) => 0);                   // 1 just after a note, then fades to 0
const label = font('sans-bold', 22);
let wasDown = false;

function play(i: number): void {
  notes[i].play();
  glow[i] = 1;
  console.log(`play ${NAMES[i]} (${HERTZ[i]} Hz)`);
}

onFrame((dt: number) => {
  const bar = width() / NAMES.length;

  if (pointerDown() && !wasDown) play(Math.min(NAMES.length - 1, Math.floor(pointerX() / bar)));
  wasDown = pointerDown();

  for (let k = 0; k < keyCount(); k++) {   // the keys 1 to 8 play too
    const n = parseInt(keyName(k));
    if (keyKind(k) === KeyKind.Down && n >= 1 && n <= 8) play(n - 1);
  }

  clear(0x1c1b20);
  for (let i = 0; i < NAMES.length; i++) {
    glow[i] = Math.max(0, glow[i] - dt * 2);
    const tall = height() * 0.6 + glow[i] * 40;
    rrect(i * bar + 6, height() - tall - 12, bar - 12, tall, 12, COLORS[i], Math.round(140 + 115 * glow[i]));
    drawText(label, i * bar + (bar - textWidth(label, NAMES[i], 0)) / 2, height() - 50, NAMES[i], 0xffffff, 255, 0);
  }
});
```

Clicca la terza barra: senti un E e il terminale mostra `play E (329.6 Hz)`.

## Fare un suono

Il modulo `zinc:audio` riproduce i suoni. `tone(hz, seconds, wave)` crea un suono dal nulla:

- `hz` è l'altezza del suono: quante volte al secondo vibra l'aria. 440 è il La su cui si accordano le orchestre; il doppio (880)
  è la stessa nota un'ottava più in alto.
- `seconds` è quanto dura.
- `wave` è la forma del suono: `'sine'` (dolce, un flauto), `'triangle'` (un po' più brillante), `'square'` (un vecchio
  videogioco), `'sawtooth'` (ronzante), `'noise'` (un fruscio, per tamburi e vento).

`tone` ti restituisce un suono che puoi riprodurre quante volte vuoi con `play()`. Ogni `play()` fa partire una nuova copia, quindi una nota
premuta due volte in fretta suona due volte, sovrapposta. Per riprodurre invece una registrazione, metti un file WAV, MP3, OGG o FLAC nella
cartella `assets` e usa `load('coin.wav')` al posto di `tone`.

Un programma eseguito senza finestra, come lo eseguono i test, è muto: ogni chiamata funziona e non si sente nulla.

## Riga per riga

- `import { tone } from 'zinc:audio';` una funzione del modulo audio. Le due righe `import` possono stare in qualsiasi ordine.
- `const NAMES = [...]`, `HERTZ`, `COLORS`: tre liste della stessa lunghezza, un elemento per barra. Le note C, D, E, F, G,
  A, B, C formano una scala maggiore; l'ultimo C è un'ottava sopra il primo (523.3 è circa il doppio di 261.6).
- `const COLORS: u32[] = [...]` una lista di colori: `u32[]` significa "una lista di u32".
- `const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));` `map` crea una nuova lista chiamando una funzione su
  ogni elemento: qui, un suono di mezzo secondo per ogni altezza. I suoni sono creati una volta sola, all'inizio, non a ogni clic.
- `const glow: number[] = HERTZ.map((hz: number) => 0);` una lista di otto zeri: quanto è accesa ogni barra.
- `function play(i: number): void { ... }` suona la nota numero `i`, accende la sua barra e la stampa. `: void` significa che non
  restituisce nulla. Sia il clic sia i tasti la chiamano, così il codice è scritto una volta sola.
- `const bar = width() / NAMES.length;` la larghezza di una barra: la finestra divisa in otto.
- `if (pointerDown() && !wasDown) play(...)` una nuova pressione, come nella lezione 4. `Math.floor(pointerX() / bar)` trasforma la
  x del puntatore in un numero di barra: 0 per la prima barra, 7 per l'ultima. `Math.min(NAMES.length - 1, ...)` fa in modo che non
  sia mai 8, nemmeno sul bordo destro.
- `const n = parseInt(keyName(k));` trasforma il nome del tasto in un numero: `'5'` diventa `5`. Un tasto che non è una cifra
  (`'a'`) dà `NaN` ("not a number", non un numero), che non è né `>= 1` né `<= 8`, quindi non suona nulla.
- `play(n - 1)` il tasto 1 suona la barra 0: le liste contano da 0.
- `glow[i] = Math.max(0, glow[i] - dt * 2);` la luce di ogni barra si spegne di 2 al secondo: da 1 a 0 in mezzo secondo.
- `const tall = height() * 0.6 + glow[i] * 40;` una barra accesa è più alta fino a 40 pixel.
- `Math.round(140 + 115 * glow[i])` l'opacità: 140 a riposo, 255 appena suonata.
- L'ultimo `drawText` scrive il nome della nota, centrato nella sua barra come nella lezione 5.

## Prova tu

- Cambia l'onda in `'square'`, poi in `'sine'`. Quale ti piace di più?
- Suona un accordo: una pressione suona tre note insieme (le barre `i`, `i + 2` e `i + 4`).
- Rendi un suono più forte o più piano: `notes[i].volume = 0.3;` prima di `play()`. `pan` lo sposta a sinistra (-1) o a destra (1).
- Registra un suono con il telefono, salvalo come `assets/clap.wav` e riproducilo con `load('clap.wav').play()` quando premi
  la barra spaziatrice.
- Suona una melodia: una lista di numeri di barra e un timer in `onFrame` che suona la successiva ogni mezzo secondo.
- Tutte le funzioni di `zinc:audio` (loop, volume, file, suoni calcolati campione per campione) sono nella [pagina del
  plugin audio](../plugins/audio.md).

## Avanti

Comincia la parte 2: [7. Componenti](07-components.md), un'interfaccia fatta di riquadri, testo, un'immagine e un pulsante.
