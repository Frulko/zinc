---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 2. Farben und Bewegung

**Das wirst du sehen:** Ein oranger Ball rollt auf grünem Gras von links nach rechts, kommt links wieder herein, wenn er das Fenster verlässt,
und der Himmel wechselt langsam von Dunkelblau zu Violett und zurück.

![Ein oranger Ball auf grünem Gras unter einem dunkelblauen Himmel](img/02-colours-and-movement.png)

## Der Code

Das Projekt liegt in [`samples/02-colours-and-movement`](samples/02-colours-and-movement/); sein `zinc.json` ist das aus
Lektion 1 mit einem anderen Namen. `src/main.ts`:

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

Nach einer Sekunde zeigt das Terminal `After 1.00 seconds the ball is at x = 160.` (auf deinem Rechner können die Zahlen ein
wenig abweichen, wie der nächste Abschnitt erklärt).

## Wie Bewegung funktioniert

Ein Film ist eine Folge von Standbildern, die schnell gezeigt werden. Ein Programm macht dasselbe: In jedem Frame zeichnet es ein Bild, auf dem der
Ball ein Stückchen weiter ist. Um den Ball zu bewegen, änderst du eine Zahl (`x`) und zeichnest den Ball bei `x`.

Wie weit soll der Ball in jedem Frame gehen? Nicht eine feste Zahl von Pixeln: Ein schneller Bildschirm zeigt 120 Frames pro Sekunde, ein langsamer
Rechner 30, und der Ball würde auf dem einen viermal schneller rollen als auf dem anderen. Stattdessen gibst du eine Geschwindigkeit in Pixeln pro
**Sekunde** an und multiplizierst sie mit `dt`, der Zeit seit dem letzten Frame, in Sekunden. Bei 60 Frames pro Sekunde ist `dt` etwa
0,0167, der Ball bewegt sich also 160 × 0,0167 ≈ 2,7 Pixel pro Frame; bei 30 Frames pro Sekunde bewegt er sich in jedem Frame doppelt so weit, aber
nur halb so oft. So oder so legt er in einer Sekunde 160 Pixel zurück.

## Zeile für Zeile

- `function rgb(red: number, green: number, blue: number): u32 { ... }` macht eine eigene Funktion. Sie nimmt drei
  Zahlen von 0 bis 255 und gibt die Farbe zurück, die sie ergeben. `: u32` sagt, dass sie eine ganze Zahl zurückgibt, die nicht
  negativ sein kann: der Typ der Farben in `zinc:gfx`.
- `Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue)` baut die Farbzahl. `0xRRGGBB` ist Rot
  mal 65536, plus Grün mal 256, plus Blau: `rgb(255, 0, 0)` ist `0xff0000`, reines Rot. `Math.round` macht aus
  `127.6` eine `128`, weil jeder Teil eine ganze Zahl sein muss.
- `const SPEED = 160;` Ein Wert, der sich nie ändert, ist eine `const`. Ihn in Großbuchstaben zu schreiben, ist eine Gewohnheit, die sagt: "eine Einstellung".
  Der Kommentar nach `//` ist für Menschen; Zinc ignoriert ihn.
- `let x = 0;` Ein Wert, der sich ändert, ist ein `let`. `x` ist, wo der Ball ist; `time` zählt die Sekunden seit dem Start;
  `told` merkt sich, ob das Programm seine Zeile schon ausgegeben hat.
- `time += dt;` addiert die Zeit dieses Frames zu `time`. `x += SPEED * dt;` bewegt den Ball um seine Geschwindigkeit mal die Zeit.
- `if (x > width()) x = -SIZE;` Wenn der Ball das Fenster rechts verlassen hat, setze ihn knapp außerhalb auf der linken Seite zurück.
- `if (!told && time >= 1) { ... }` läuft einmal: wenn eine Sekunde vergangen ist und noch nichts ausgegeben wurde (`!told` heißt
  "told ist falsch"). `time.toFixed(2)` schreibt die Zahl mit zwei Stellen nach dem Komma.
- `const glow = (Math.sin(time * 2) + 1) / 2;` `Math.sin` geht sanft von -1 bis 1 und zurück, für immer. Wenn du 1 addierst und
  durch 2 teilst, geht es stattdessen von 0 bis 1. `time * 2` lässt es doppelt so schnell gehen. Das ist der einfachste Weg, etwas
  pulsieren, schwanken oder atmen zu lassen.
- `clear(rgb(20, 20, 40 + 60 * glow));` der Himmel: Sein Blau geht von 40 bis 100, während `glow` von 0 bis 1 geht.
- `rect(0, height() - 40, width(), 40, 0x2f8f57);` das Gras: ein grünes Band, 40 Pixel hoch, am unteren Rand.
- `rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);` der Ball, der auf dem
  Gras sitzt. Seine Farbe geht mit `glow` von Orange zu Gelb.

## Probier das aus

- Lass den Ball doppelt so schnell fahren. Lass ihn dann rückwärts fahren: eine negative Geschwindigkeit (und ändere das `if`, sodass er rechts
  wieder hereinkommt).
- Lass ihn hüpfen: Führe eine Geschwindigkeit `vy` für oben und unten ein, addiere `vy += 900 * dt` in jedem Frame (Schwerkraft), `y += vy * dt`, und wenn
  der Ball das Gras berührt, `vy = -vy * 0.8`.
- Lass den Ball um die Mitte des Fensters kreisen: `const bx = width() / 2 + Math.cos(time) * 100` und
  `const by = height() / 2 + Math.sin(time) * 100`.
- Nutze `rgb` auch für das Gras und lass es mit der Tageszeit die Farbe wechseln: ein ganzer Tag in 20 Sekunden.
- Zeichne zehn Bälle in einer Schleife: `for (let i = 0; i < 10; i++) { ... }`, jeder ein bisschen später als der davor.

## Weiter

[3. Die Tastatur](03-keyboard.md): ein Quadrat mit den Pfeiltasten bewegen.
