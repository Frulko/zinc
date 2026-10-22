---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 6. Sound

**Das wirst du sehen (und hören):** acht farbige Balken, einer pro Note einer Tonleiter. Klicke auf einen Balken oder drücke eine Taste von 1 bis 8,
und seine Note erklingt, während der Balken aufleuchtet und wächst.

![Acht farbige Balken mit den Namen C D E F G A B C](img/06-sound.png)

## Der Code

Das Projekt liegt in [`samples/06-sound`](samples/06-sound/). `src/main.ts`:

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

Klicke auf den dritten Balken: Du hörst ein E, und das Terminal zeigt `play E (329.6 Hz)`.

## Einen Ton machen

Das Modul `zinc:audio` spielt Sound ab. `tone(hz, seconds, wave)` macht einen Ton aus dem Nichts:

- `hz` ist die Tonhöhe: wie oft pro Sekunde die Luft schwingt. 440 ist das A, auf das Orchester stimmen; doppelt so viel (880)
  ist dieselbe Note eine Oktave höher.
- `seconds` ist, wie lange er dauert.
- `wave` ist die Form des Klangs: `'sine'` (weich, eine Flöte), `'triangle'` (etwas heller), `'square'` (ein altes Videospiel),
  `'sawtooth'` (brummend), `'noise'` (ein Rauschen, für Trommeln und Wind).

`tone` gibt dir einen Klang zurück, den du mit `play()` so oft abspielen kannst, wie du willst. Jedes `play()` startet eine neue Kopie, sodass eine Note,
die du zweimal schnell drückst, zweimal spielt, überlappend. Um stattdessen eine Aufnahme abzuspielen, lege eine WAV-, MP3-, OGG- oder FLAC-Datei in den
Ordner `assets` und nimm `load('coin.wav')` statt `tone`.

Ein Programm, das ohne Fenster läuft, wie die Tests es ausführen, ist stumm: Jeder Aufruf funktioniert, und nichts ist zu hören.

## Zeile für Zeile

- `import { tone } from 'zinc:audio';` eine Funktion des Sound-Moduls. Die beiden `import`-Zeilen können in beliebiger Reihenfolge stehen.
- `const NAMES = [...]`, `HERTZ`, `COLORS`: drei Listen gleicher Länge, ein Eintrag pro Balken. Die Noten C, D, E, F, G,
  A, H (englisch B), C sind eine Dur-Tonleiter; das letzte C liegt eine Oktave über dem ersten (523,3 ist etwa das Doppelte von 261,6).
- `const COLORS: u32[] = [...]` eine Liste von Farben: `u32[]` heißt "eine Liste von u32".
- `const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));` `map` macht eine neue Liste, indem es für jeden Eintrag eine Funktion
  aufruft: hier ein Klang von einer halben Sekunde pro Tonhöhe. Die Klänge werden einmal am Anfang gemacht, nicht bei jedem Klick.
- `const glow: number[] = HERTZ.map((hz: number) => 0);` eine Liste von acht Nullen: wie stark jeder Balken leuchtet.
- `function play(i: number): void { ... }` spielt Note Nummer `i`, lässt ihren Balken leuchten und gibt sie aus. `: void` heißt, dass sie nichts
  zurückgibt. Der Klick und die Tasten rufen sie beide auf, der Code steht also nur einmal da.
- `const bar = width() / NAMES.length;` die Breite eines Balkens: das Fenster in acht geteilt.
- `if (pointerDown() && !wasDown) play(...)` ein neues Drücken, wie in Lektion 4. `Math.floor(pointerX() / bar)` macht aus dem
  x des Zeigers eine Balkennummer: 0 für den ersten Balken, 7 für den letzten. `Math.min(NAMES.length - 1, ...)` sorgt dafür, dass es
  nie 8 wird, auch ganz am rechten Rand nicht.
- `const n = parseInt(keyName(k));` macht aus dem Namen der Taste eine Zahl: `'5'` wird zu `5`. Eine Taste, die keine Ziffer ist
  (`'a'`), ergibt `NaN` ("keine Zahl"), das weder `>= 1` noch `<= 8` ist, sie spielt also nichts.
- `play(n - 1)` Taste 1 spielt Balken 0: Listen zählen ab 0.
- `glow[i] = Math.max(0, glow[i] - dt * 2);` Das Leuchten jedes Balkens lässt um 2 pro Sekunde nach: von 1 auf 0 in einer halben Sekunde.
- `const tall = height() * 0.6 + glow[i] * 40;` Ein leuchtender Balken ist bis zu 40 Pixel höher.
- `Math.round(140 + 115 * glow[i])` die Deckkraft: 140 in Ruhe, 255, wenn die Note gerade gespielt wurde.
- Das letzte `drawText` schreibt den Namen der Note, zentriert in ihrem Balken, wie in Lektion 5.

## Probier das aus

- Ändere die Wellenform in `'square'`, dann in `'sine'`. Welche gefällt dir?
- Spiele einen Akkord: Ein Druck spielt drei Noten auf einmal (Balken `i`, `i + 2` und `i + 4`).
- Mach einen Klang lauter oder leiser: `notes[i].volume = 0.3;` vor `play()`. `pan` verschiebt ihn nach links (-1) oder rechts (1).
- Nimm mit deinem Handy einen Klang auf, speichere ihn als `assets/clap.wav` und spiele ihn mit `load('clap.wav').play()`, wenn die Leertaste
  gedrückt wird.
- Spiele eine Melodie: eine Liste von Balkennummern und ein Timer in `onFrame`, der alle halbe Sekunde die nächste spielt.
- Jede Funktion von `zinc:audio` (Schleifen, Lautstärke, Dateien, Klänge, die Sample für Sample berechnet werden) steht auf [der Seite
  des Audio-Plugins](../plugins/audio.md).

## Weiter

Teil 2 beginnt: [7. Komponenten](07-components.md), eine Oberfläche aus Boxen, Text, einem Bild und einem Button.
