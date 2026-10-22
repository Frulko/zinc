---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 3. La tastiera

**Cosa vedrai:** un quadrato che muovi con le frecce. La barra spaziatrice ne cambia il colore. Il nome dell'ultimo tasto che hai
premuto appare nell'angolo in alto a sinistra.

![Un quadrato blu su uno sfondo scuro, "Space" scritto nell'angolo](img/03-keyboard.png)

## Il codice

Il progetto è in [`samples/03-keyboard`](samples/03-keyboard/). `src/main.ts`:

```ts
import { onFrame, clear, rrect, font, drawText, width, height, isDown, wasPressed, Btn, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const SPEED = 240;   // pixels per second
const SIZE = 48;
let x = 100, y = 100;
let color: u32 = 0xe8b06a;
let lastKey = 'Press a key';
const label = font('sans', 24);

onFrame((dt: number) => {
  // 1. Keys held down: ask every frame.
  if (isDown(Btn.Left)) x -= SPEED * dt;
  if (isDown(Btn.Right)) x += SPEED * dt;
  if (isDown(Btn.Up)) y -= SPEED * dt;
  if (isDown(Btn.Down)) y += SPEED * dt;
  x = Math.max(0, Math.min(width() - SIZE, x));
  y = Math.max(0, Math.min(height() - SIZE, y));

  // 2. A key pressed this frame (not held since before).
  if (wasPressed(Btn.A)) color = color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a;

  // 3. Every key that went down since the last frame, by name.
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Down) {
      lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);
      console.log(`key "${lastKey}", the square is at x = ${Math.round(x)}`);
    }
  }

  clear(0x1c1b20);
  rrect(x, y, SIZE, SIZE, 10, color, 255);
  drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);
});
```

Premi dei tasti: il terminale li mostra uno per uno, per esempio `key "a", the square is at x = 220`.

## Due modi di leggere la tastiera

**Chiedere, a ogni frame: questo tasto è premuto?** `isDown(Btn.Left)` è `true` finché il tasto è tenuto premuto. Così i giochi
muovono le cose: finché tieni premuta la freccia, il quadrato si muove un poco a ogni frame. `zinc:gfx` dà un nome a un piccolo insieme di
pulsanti, quelli di un controller da gioco, così lo stesso codice funziona con una tastiera, un gamepad o i pulsanti di una console portatile:

| Pulsante | Tasti sulla tastiera |
|---|---|
| `Btn.Up`, `Btn.Down`, `Btn.Left`, `Btn.Right` | le frecce, oppure W, S, A, D |
| `Btn.A` | Spazio o Z |
| `Btn.B`, `Btn.X`, `Btn.Y` | X, C, V |
| `Btn.L`, `Btn.R` | Q, E |
| `Btn.Start`, `Btn.Select` | Invio, Tab |

**Leggere la lista dei tasti premuti dall'ultimo frame.** Ogni tasto che si abbassa, si rialza o si ripete (tenuto premuto abbastanza a lungo
da scrivere di nuovo) è un evento con un nome: `'a'`, `'1'`, `' '` (Spazio), `'Enter'`, `'Escape'`, `'ArrowLeft'`, `'F5'`...
È il modo di leggere qualsiasi tasto, lettere comprese, e non si perde nulla nemmeno quando due tasti arrivano nello stesso frame.

## Riga per riga

- `import { ... } from 'zinc:gfx';` novità questa volta: `font` e `drawText` (la lezione 5 li spiega), `isDown`,
  `wasPressed` e `Btn` per i pulsanti di gioco, `keyCount`, `keyKind`, `keyName` e `KeyKind` per gli eventi dei tasti.
- `let x = 100, y = 100;` dove si trova il quadrato. `let color: u32 = 0xe8b06a;` il suo colore, un `u32` come ogni colore.
- `let lastKey = 'Press a key';` il testo mostrato nell'angolo. Le parole tra apici sono una `string`.
- `const label = font('sans', 24);` un font, richiesto una volta all'inizio: la famiglia `'sans'` a 24 pixel.
- `if (isDown(Btn.Left)) x -= SPEED * dt;` finché Left è premuto, vai a sinistra. Su è `y -= ...` perché y cresce verso il basso.
- `x = Math.max(0, Math.min(width() - SIZE, x));` tiene il quadrato dentro la finestra. `Math.min(a, b)` è il più piccolo
  dei due, `Math.max(a, b)` il più grande: insieme tengono `x` tra 0 e `width() - SIZE`.
- `if (wasPressed(Btn.A)) color = ...;` `wasPressed` è `true` solo nel frame in cui il pulsante si abbassa, non mentre
  resta abbassato. Tenere premuto Spazio cambia il colore una volta, non 60 volte al secondo.
- `color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a` si legge "se il colore è arancione, allora blu, altrimenti arancione". `===` confronta,
  `? :` sceglie uno tra due valori.
- `for (let i = 0; i < keyCount(); i++) { ... }` passa in rassegna gli eventi dei tasti di questo frame, dal primo (numero 0)
  all'ultimo.
- `if (keyKind(i) === KeyKind.Down)` tiene solo i tasti che si abbassano. Gli altri sono `KeyKind.Up` (rilasciato),
  `KeyKind.Repeat` (tenuto premuto, scrive di nuovo) e `KeyKind.Text` (testo digitato, quando un campo di testo l'ha chiesto).
- `lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);` il nome del tasto. Il nome della barra spaziatrice è uno spazio, che
  non si vedrebbe sullo schermo, quindi il programma scrive `Space`. I nomi non cambiano con Maiusc: Maiusc+A è sempre `'a'`.
- `drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);` scrive `lastKey` in (20, 16) in grigio chiaro.

## Prova questo

- Fai andare più veloce con Maiusc: `import { modifiers, Mod }` e `const fast = (modifiers() & Mod.Shift) !== 0;`.
- Fai in modo che Invio (`Btn.Start`) rimetta il quadrato al centro.
- Conta i tasti premuti e mostra il conteggio sotto il nome.
- Disegna il quadrato più grande mentre Spazio è premuto (`isDown(Btn.A)`), e più piccolo quando viene rilasciato.
- Fai fare il giro al quadrato: quando esce a destra, ricompare a sinistra, come nella lezione 2.
- Escape chiude un programma `zinc:gfx` (o esce dallo schermo intero). Per usare Escape da te, chiama `escapeByApp(true)` una volta.

## Avanti

[4. Il mouse e il tocco](04-mouse-and-touch.md): disegna con il mouse o con un dito.
