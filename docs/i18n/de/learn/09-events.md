---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 9. Ereignisse

**Das wirst du sehen:** eine weiße Box mit einem rosa Punkt. Drücke in die Box, und der Punkt springt dorthin; ziehe, und er folgt; die
Pfeiltasten bewegen ihn; der Rand der Box wird violett, solange der Zeiger darüber ist. Ein Satz sagt, was passiert ist, und ein
Button *Reset* setzt den Punkt zurück in die Mitte.

![Eine weiße Box mit violettem Rand, ein rosa Punkt, ein Satz und ein Reset-Button](img/09-events.png)

## Der Code

Das Projekt liegt in [`samples/09-events`](samples/09-events/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

const [dotX, setDotX] = createSignal<number>(150);
const [dotY, setDotY] = createSignal<number>(100);
const [pressed, setPressed] = createSignal<boolean>(false);
const [over, setOver] = createSignal<boolean>(false);
const [news, setNews] = createSignal<string>('Press in the box, drag, or use the arrow keys.');

function moveTo(x: number, y: number): void {
  setDotX(Math.max(0, Math.min(300, x)));
  setDotY(Math.max(0, Math.min(200, y)));
}

function down(e: ui.PointerEvent): void {
  setPressed(true);
  moveTo(e.x, e.y);
  setNews(`Pressed at ${Math.round(e.x)}, ${Math.round(e.y)} inside the box.`);
  console.log(news());
}

function drag(e: ui.PointerEvent): void {
  if (pressed()) moveTo(e.x, e.y);
}

function up(e: ui.PointerEvent): void {
  setPressed(false);
  setNews(`Let go at ${Math.round(e.x)}, ${Math.round(e.y)}.`);
  console.log(news());
}

ui.onKey((e: ui.KeyEvent) => {
  if (e.key === 'ArrowLeft') moveTo(dotX() - 10, dotY());
  else if (e.key === 'ArrowRight') moveTo(dotX() + 10, dotY());
  else if (e.key === 'ArrowUp') moveTo(dotX(), dotY() - 10);
  else if (e.key === 'ArrowDown') moveTo(dotX(), dotY() + 10);
  else return;
  e.preventDefault();   // this key is used: it does not also move the keyboard focus
  setNews(`Key ${e.key}: the dot is at ${dotX()}, ${dotY()}.`);
  console.log(news());
});

function reset(): void {
  moveTo(150, 100);
  setNews('Back to the middle.');
  console.log(news());
}

function App(): i32 {
  return <View className="w-full h-full items-center justify-center gap-4">
    <View className={`w-[300px] h-[200px] rounded-xl bg-white border-2 ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}
      onPointerDown={down} onPointerMove={drag} onPointerUp={up}
      onPointerEnter={(e: ui.PointerEvent) => setOver(true)} onPointerLeave={(e: ui.PointerEvent) => setOver(false)}>
      <View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />
    </View>
    <Text className="text-base text-[#625d55]">{news()}</Text>
    <Button className="h-10 px-5 rounded-full bg-[#5746e0]" onClick={reset}>
      <Text className="text-base text-white">Reset</Text>
    </Button>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Drücke in der Box nahe der oberen linken Ecke, ziehe, lass los, drücke die linke Pfeiltaste: Das Terminal zeigt
`Pressed at 30, 28 inside the box.`, `Let go at 230, 148.`, `Key ArrowLeft: the dot is at 220, 148.`

## Was ein Ereignis ist

Ein **Ereignis** ist etwas, das passiert: ein Drücken, eine Bewegung, eine Taste. Du gibst einem Element eine Funktion für ein Ereignis, in einem
Attribut, dessen Name mit `on` beginnt; Zinc ruft die Funktion auf, wenn das Ereignis an diesem Element passiert.

| Attribut | Wann es läuft | Die Funktion bekommt |
|---|---|---|
| `onClick` | das Element wurde gedrückt und losgelassen (Maus, Finger oder Enter und Leertaste, wenn es den Tastaturfokus hat) | nichts |
| `onPointerDown` | eine Taste oder ein Finger geht auf dem Element herunter | ein `PointerEvent` |
| `onPointerMove` | der Zeiger bewegt sich darüber; nach einem Drücken darauf überall, bis zum Loslassen | ein `PointerEvent` |
| `onPointerUp` | die Taste oder der Finger kommt hoch, nach einem Drücken auf dem Element | ein `PointerEvent` |
| `onPointerEnter`, `onPointerLeave` | der Zeiger kommt über das Element oder verlässt es | ein `PointerEvent` |
| `onKeyDown` | eine Taste geht herunter, während das Element (oder eins darin) den Tastaturfokus hat | ein `KeyEvent` |

Ein `PointerEvent` sagt, wo: `e.x` und `e.y` werden **von der oberen linken Ecke des Elements** gemessen, nicht des Fensters
(`e.gx`, `e.gy` gelten von der Ecke des Fensters). Es sagt auch, welche Taste (`e.button`: 0 links, 1 Mitte, 2 rechts) und
welche Tasten gehalten wurden (`e.shift`, `e.ctrl`, `e.alt`, `e.meta`). Jedes Ereignis und was es liefert, steht in
[der Referenz zu den Ereignissen von zinc:ui](../reference/ui-events.md); es gibt auch Tippen, langes Drücken, Ziehen und Zwei-Finger-Zoom.

## Zeile für Zeile

- `import * as ui from 'zinc:ui';` holt das ganze Modul `zinc:ui` unter dem Namen `ui`: Die Typen `ui.PointerEvent` und
  `ui.KeyEvent` und die Funktion `ui.onKey` kommen daraus.
- Fünf Signale: `dotX` und `dotY` (wo der Punkt in der Box ist), `pressed` (ist eine Taste unten?), `over` (ist der
  Zeiger über der Box?) und `news`, der Satz unter der Box. `createSignal<number>(150)` enthält eine beliebige Zahl,
  `<boolean>` wahr oder falsch, `<string>` Text.
- `function moveTo(x: number, y: number): void` setzt den Punkt auf (x, y), begrenzt auf die Box von 300 mal 200.
- `function down(e: ui.PointerEvent): void` läuft beim Drücken: merkt sich, dass eine Taste unten ist, bewegt den Punkt dorthin, wo der
  Zeiger ist (`e.x`, `e.y`, innerhalb der Box), schreibt den Satz und gibt ihn aus.
- `function drag(e: ui.PointerEvent): void` läuft bei jeder Bewegung über der Box, und nach einem Drücken auf der Box bei jeder Bewegung
  irgendwo: Die Box **fängt** den Zeiger bis zum Loslassen **ein** (Capture), sodass ein Ziehen, das die Box verlässt, nicht verloren geht. Sie bewegt den
  Punkt nur, solange `pressed()` wahr ist.
- `function up(e: ui.PointerEvent): void` läuft beim Loslassen.
- `ui.onKey((e: ui.KeyEvent) => { ... });` ein Tasten-Handler für das ganze Fenster: Er bekommt die Tasten, die sonst nichts benutzt hat.
  `e.key` ist der Name der Taste, wie in Lektion 3 (`'ArrowLeft'`, `'a'`, `'Enter'`).
- `else return;` jede andere Taste: nichts tun und die Taste Zinc überlassen.
- `e.preventDefault();` sagt "diese Taste wird benutzt". Ohne das würden die Pfeiltasten auch den Tastaturfokus von
  Button zu Button bewegen, wie in jeder App.
- `function reset(): void` setzt den Punkt zurück und sagt das.
- `className={`... ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}` der Rand der Box: violett, solange `over()`
  wahr ist, sonst hellgrau. Die Klasse liest ein Signal, sie ändert sich also mit ihm.
- `onPointerDown={down} onPointerMove={drag} onPointerUp={up}` gibt der Box ihre drei Funktionen. Eine Funktion kann mit
  ihrem Namen angegeben werden (`down`) oder an Ort und Stelle geschrieben werden (`(e: ui.PointerEvent) => setOver(true)`).
- `<View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />` der
  Punkt. `absolute` nimmt ihn aus dem Layout: `left` und `top` platzieren ihn von der oberen linken Ecke seines Elternelements, der Box, aus.
  Minus 12 (seine halbe Größe) zentriert ihn auf dem Punkt.
- `<Button ... onClick={reset}>` Der Button führt `reset` aus, wenn er angeklickt wird.

## Probier das aus

- Lass einen Doppelklick den Punkt zurück in die Mitte setzen: `onDoubleClick={(e: ui.PointerEvent) => reset()}` an der Box.
- Lass einen Rechtsklick die Farbe des Punktes ändern: Prüfe in `down`, ob `e.button === 2`.
- Halte Umschalt, um mit den Pfeiltasten um 50 zu bewegen: `const step = e.shift ? 50 : 10;`.
- Zeichne eine Spur: Halte die letzten Positionen in einem Signal mit einer Liste und zeige eine kleine `View` pro Position.
- Nutze `onKeyDown` statt `ui.onKey`: Setze `focusable onKeyDown={...}` an die Box. Jetzt funktionieren die Tasten erst, nachdem du
  die Box angeklickt hast (sie hat den Fokus), und das willst du, wenn ein Fenster mehrere solche Boxen hat.
- Ersetze die drei Zeiger-Handler durch ein einziges `onDrag={(e: ui.PointerEvent) => moveTo(e.x, e.y)}`: Ein Ziehen beginnt, nachdem sich der
  Zeiger 8 Pixel bewegt hat, und `e.phase` sagt, ob es beginnt (0), sich bewegt (1) oder endet (2).

## Weiter

[10. Styles](10-styles.md): Farben, Größen, Rahmen und Schatten mit `className`.
