---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 11. Eine Zeichnung in einer Oberfläche

**Das wirst du sehen:** links ein weißes Panel mit einem Titel, der Anzahl der Blütenblätter und zwei Buttons; rechts eine
Blume, die sich langsam dreht. *More* und *Fewer* fügen Blütenblätter hinzu und entfernen sie.

![Ein Panel mit den Buttons Fewer und More neben einer rosa Blume mit sieben Blütenblättern](img/11-drawing-in-an-interface.png)

## Der Code

Das Projekt liegt in [`samples/11-drawing-in-an-interface`](samples/11-drawing-in-an-interface/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, stroke } from 'zinc:gfx';

const [petals, setPetals] = createSignal<i32>(6);
let time = 0;   // seconds since the start, moved forward every frame

function change(by: i32): void {
  const next = petals() + by;
  if (next < 3 || next > 12) return;
  setPetals(next);
  console.log(`petals: ${petals()}`);
}

function flower(x: i32, y: i32, w: i32, h: i32): void {
  const cx = x + w / 2, cy = y + h / 2;          // the middle of the canvas
  const reach = Math.min(w, h) * 0.22;           // how far the petals are from the middle
  stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);
  for (let i = 0; i < petals(); i++) {
    const angle = time * 0.5 + (i * 2 * Math.PI) / petals();
    const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;
    rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);
  }
  rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);
}

function App(): i32 {
  return <View className="w-full h-full flex-row">
    <View className="w-[200px] p-6 gap-4 bg-white">
      <Text className="text-2xl font-bold text-[#1d1b18]">Flower</Text>
      <Text className="text-base text-[#625d55]">{`${petals()} petals`}</Text>
      <Button className="px-2 h-10 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
        <Text className="text-base text-[#1d1b18]">Fewer</Text>
      </Button>
      <Button className="px-2 h-10 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
        <Text className="text-base text-white">More</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={flower} />
  </View>;
}

render(App, 0xdff3e4, (dt: number) => { time += dt; });
```

Klicke zweimal auf *More* und einmal auf *Fewer*: Das Terminal zeigt `petals: 7`, `petals: 8`, `petals: 7`.

## Ein Canvas: Teil 1 innerhalb von Teil 2

Manche Dinge zeichnet man leichter, als man sie aus Boxen baut: ein Diagramm, ein Spielbrett, eine Zeichnung, eine Wellenform. Ein `Canvas` ist ein
Element der Oberfläche, das du selbst zeichnest, mit den `zinc:gfx`-Funktionen aus Teil 1. Das Layout gibt ihm seinen Platz und seine Größe
wie jedem Element (hier `grow`: die ganze Breite, die das Panel übrig lässt). Zinc ruft dann seine Funktion `onDraw` mit diesem
Platz auf: `x`, `y` (seine obere linke Ecke, im Fenster) und `w`, `h` (seine Breite und Höhe). Du zeichnest innerhalb dieser Box.

Ein Canvas wird in jedem Frame neu gezeichnet, eine Zeichnung, die sich bewegt, liest also einfach die Zeit. (Eine Oberfläche ohne Canvas wird
nur gezeichnet, wenn sich etwas darin ändert, was Akku spart; `style={{ lazy: 1 }}` lässt ein Canvas ebenfalls auf eine Änderung
warten.)

## Zeile für Zeile

- `import { rrect, stroke } from 'zinc:gfx';` die Zeichenfunktionen, die dieses Programm benutzt, wie in Teil 1. Du rufst
  `onFrame` oder `clear` nicht auf: `zinc:ui` führt die Frames aus und malt den Hintergrund.
- `const [petals, setPetals] = createSignal<i32>(6);` die Anzahl der Blütenblätter, ein Signal: Der Text `6 petals` folgt ihm.
- `let time = 0;` die Sekunden seit dem Start, eine normale Variable: Nur die Zeichnung liest sie, und das Canvas wird ohnehin in
  jedem Frame gezeichnet.
- `function change(by: i32): void` fügt ein Blütenblatt hinzu oder entfernt es, zwischen 3 und 12.
- `function flower(x: i32, y: i32, w: i32, h: i32): void` die Zeichenfunktion des Canvas. Zinc gibt ihr die Box.
- `const cx = x + w / 2, cy = y + h / 2;` die Mitte der Box. Zeichne immer von `x` und `y` aus: Das Canvas liegt nicht in der
  oberen linken Ecke des Fensters, es beginnt 200 Pixel vom linken Rand, hinter dem Panel.
- `const reach = Math.min(w, h) * 0.22;` wie weit die Blütenblätter von der Mitte entfernt sind: ein Anteil der kürzeren Seite der Box, sodass
  die Blume passt, wenn sich die Fenstergröße ändert.
- `stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);` der Stiel: eine dicke grüne Linie von der Mitte nach unten bis zum
  Rand der Box.
- `for (let i = 0; i < petals(); i++)` ein Blütenblatt pro Durchlauf der Schleife. `petals()` liest das Signal: Die Zeichnung benutzt die
  neue Zahl im nächsten Frame.
- `const angle = time * 0.5 + (i * 2 * Math.PI) / petals();` wo das Blütenblatt auf dem Kreis liegt. Eine ganze Umdrehung ist
  `2 * Math.PI` (etwa 6,28); die Blütenblätter teilen sie gleichmäßig unter sich auf, und `time * 0.5` dreht sie alle langsam.
- `const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;` der Punkt bei diesem Winkel auf einem Kreis mit
  dem Radius `reach` um die Mitte. `cos` liefert den Anteil quer, `sin` den Anteil nach unten.
- `rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);` ein rundes Blütenblatt von 80 Pixeln um diesen Punkt, ein wenig
  durchsichtig, sodass sich überlappende Blütenblätter zeigen.
- `rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);` die gelbe Mitte, zuletzt gezeichnet, damit sie obenauf liegt.
- `<View className="w-full h-full flex-row">` das Fenster ist eine Zeile: das Panel, dann das Canvas.
- `<View className="w-[200px] p-6 gap-4 bg-white">` das Panel: 200 Pixel breit, weiß, seine Kinder in einer Spalte.
- `<Canvas className="grow" onDraw={flower} />` Das Canvas nimmt den Rest der Zeile und zeichnet mit `flower`.
- `render(App, 0xdff3e4, (dt: number) => { time += dt; });` Das dritte Argument von `render`, das vorher `null` war, ist eine
  Funktion, die Zinc in jedem Frame mit `dt` aufruft, der Zeit seit dem letzten Frame, so wie `onFrame` in Teil 1. Sie bewegt die
  Uhr der Zeichnung.

## Probier das aus

- Lass die Blume schneller drehen oder in die andere Richtung (eine negative Geschwindigkeit).
- Gib jedem Blütenblatt seine eigene Farbe, aus einer Liste wie in Lektion 6.
- Füge ein Signal für die Größe der Blütenblätter hinzu, mit zwei weiteren Buttons.
- Lass die Blütenblätter atmen: ihre Größe mal `1 + 0.1 * Math.sin(time * 3)`.
- Klicke auf das Canvas, um die Blume zu bewegen: Gib ihm `onPointerDown={(e: ui.PointerEvent) => ...}` (Lektion 9) und halte die
  Mitte in zwei Variablen. `e.x`, `e.y` gelten innerhalb des Canvas, addiere also `x`, `y`, wenn du zeichnest.
- Zeichne stattdessen ein Balkendiagramm: ein `rect` pro Wert einer Liste, so hoch wie der Wert.

## Weiter

[12. Eine kleine fertige App](12-a-small-app.md): alles zusammen.
