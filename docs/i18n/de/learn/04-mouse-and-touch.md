---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 4. Die Maus und Touch

**Das wirst du sehen:** eine Seite, auf die du zeichnest. Drücke und bewege die Maus (oder einen Finger auf einem Touchscreen), um eine Linie zu zeichnen. Das
Rad macht den Pinsel dicker oder dünner, die rechte Taste wischt die Seite leer, und jeder Finger auf einem Touchscreen zeigt einen
rosa Ring.

![Zwei violette Linien, eine dünne und eine dicke, und zwei rosa Ringe](img/04-mouse-and-touch.png)

## Der Code

Das Projekt liegt in [`samples/04-mouse-and-touch`](samples/04-mouse-and-touch/). `src/main.ts`:

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

Zeichne: Das Terminal zeigt, wo du gedrückt und losgelassen hast, zum Beispiel `pressed at 80, 120`, dann
`released at 340, 180: 1 line(s)`.

## Der Zeiger

`zinc:gfx` nennt die Maus den **Zeiger** (pointer). Auf einem Touchscreen ist der erste Finger ebenfalls der Zeiger, sodass derselbe Code
mit einer Maus, einem Trackpad, einem Stift oder einem Finger funktioniert:

| Funktion | Liefert |
|---|---|
| `pointerX()`, `pointerY()` | wo der Zeiger ist, in Pixeln von der oberen linken Ecke des Fensters |
| `pointerDown()` | `true`, solange die Haupttaste (oder ein Finger) unten ist |
| `pointerButtons()` | jede gehaltene Taste: 1 links, 2 rechts, 4 Mitte, zusammenaddiert |
| `wheel()` | wie viele Schritte sich das Rad in diesem Frame gedreht hat: mehr als 0 nach oben, weniger als 0 nach unten |
| `touchCount()` | wie viele Finger den Bildschirm berühren; `touchX(i)`, `touchY(i)` wo Finger `i` ist |

Es gibt keine "Klick"-Funktion: Ein Klick ist der Moment, in dem `pointerDown()` zu `true` wird. Das Programm findet ihn, indem es sich
den Wert des Frames davor in `wasDown` merkt.

## Zeile für Zeile

- `const lines: number[][] = [];` jede bisher gezeichnete Linie. Eine Linie ist eine Liste von Zahlen, `[x0, y0, x1, y1, ...]`
  (`number[]`), alle Linien zusammen sind also eine Liste von Listen (`number[][]`). Sie beginnt leer: `[]`.
- `const sizes: number[] = [];` die Pinselgröße jeder Linie, in derselben Reihenfolge.
- `const x = pointerX(), y = pointerY(), down = pointerDown();` liest den Zeiger einmal am Anfang des Frames.
- `if (down && !wasDown)` jetzt unten und vorher nicht: Die Taste wurde gerade gedrückt. `lines.push([x, y])` fügt eine neue Linie hinzu,
  die hier beginnt; `push` hängt etwas ans Ende einer Liste an.
- `else if (down)` immer noch unten: Der Zeiger wird gezogen. `lines[lines.length - 1]` ist die letzte Linie, die gerade gezeichnete.
  Ihr letzter Punkt ist `line[line.length - 2]`, `line[line.length - 1]`; der neue Punkt wird nur hinzugefügt, wenn sich der Zeiger bewegt hat.
- `else if (wasDown)` jetzt oben, vorher unten: Die Taste wurde gerade losgelassen.
- `wasDown = down;` merkt sich den Wert dieses Frames für den nächsten Frame.
- `if ((pointerButtons() & 2) !== 0)` Wird die rechte Taste gehalten? `&` behält den Teil der Zahl, der 2 ist: Er ist nicht
  0, wenn die rechte Taste unter den gehaltenen Tasten ist. `splice(0, lines.length)` leert eine Liste.
- `brush + wheel() * 2` Jeder Schritt des Rads ändert den Pinsel um 2 Pixel, begrenzt auf 2 bis 40.
- `stroke(lines[i], sizes[i], 0x5746e0, 255, false);` zeichnet eine Linie durch alle Punkte einer Liste, mit runden Enden.
  Die Argumente: die Punkte, die Dicke, die Farbe, die Deckkraft und `false` für eine offene Linie (`true` würde den
  letzten Punkt wieder mit dem ersten verbinden).
- `for (let i = 0; i < touchCount(); i++)` ein Ring pro Finger, durchscheinend (Deckkraft 110 von 255).
- Das letzte `rrect` ist ein kleiner dunkler Punkt, der dem Zeiger folgt, so groß wie der Pinsel.
- `drawText(...)` zeigt die Pinselgröße, die Anzahl der Linien und die Anzahl der Finger.

## Probier das aus

- Gib jeder Linie ihre eigene Farbe: Führe eine Liste von Farben wie `sizes` und wähle bei jedem Drücken eine neue Farbe.
- Lass die mittlere Taste (4) die letzte Linie rückgängig machen: `lines.pop()` und `sizes.pop()`.
- Zeichne mit allen Fingern gleichzeitig: eine Linie pro Finger, und nutze `touchId(i)`, um zu wissen, welcher Finger welcher ist, von einem Frame zum
  nächsten.
- Füge `closed`-Formen hinzu: Zeichne die Linie mit `true` als letztem Argument und sieh zu, wie sie sich schließt.
- Zeichne an jedem Punkt einen weichen Punkt statt einer Linie: `rrect` mit niedriger Deckkraft, wie bei Sprühfarbe.
- Schnelle Striche mit einem Stift: `penCount()`, `penX(i)`, `penY(i)` und `penPressure(i)` liefern jeden Messpunkt des Stifts seit
  dem letzten Frame, mit seinem Druck von 0 bis 1 (die [Referenz](../reference/gfx.md#input) listet sie auf).

## Weiter

[5. Text und Bilder](05-text-and-images.md): Wörter schreiben und Bilder zeigen.
