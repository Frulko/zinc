---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 8. Zustand

**Das wirst du sehen:** einen Zähler für Gläser Wasser, einen blauen Balken, der mit ihm wächst, einen Satz, der sich ändert, und zwei
Buttons, *One less* und *I drank one*.

![2 / 8 in großen Ziffern, ein zu einem Viertel gefüllter blauer Balken, "6 more to go." und zwei Buttons](img/08-state.png)

## Der Code

Das Projekt liegt in [`samples/08-state`](samples/08-state/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const GOAL = 8;
const [glasses, setGlasses] = createSignal<i32>(0);

function drink(by: i32): void {
  const next = glasses() + by;
  if (next < 0 || next > GOAL) return;
  setGlasses(next);
  console.log(`glasses: ${glasses()}`);
}

function message(): string {
  if (glasses() === 0) return 'Time for a glass of water.';
  if (glasses() < GOAL) return `${GOAL - glasses()} more to go.`;
  return 'Goal reached. Well done!';
}

function App(): i32 {
  return <View className="w-full h-full items-center justify-center gap-5">
    <Text className="text-6xl font-bold text-[#1d1b18]">{`${glasses()} / ${GOAL}`}</Text>
    <View className="w-[320px] h-4 rounded-full bg-[#e9e6df]">
      <View className="h-4 rounded-full bg-[#2563c9]" style={{ width: glasses() * 40 }} />
    </View>
    <Text className="text-lg text-[#625d55]">{message()}</Text>
    <View className="flex-row gap-3">
      <Button className="h-11 px-5 rounded-full bg-[#e9e6df]" onClick={() => drink(-1)}>
        <Text className="text-base text-[#1d1b18]">One less</Text>
      </Button>
      <Button className="h-11 px-5 rounded-full bg-[#2563c9]" onClick={() => drink(1)}>
        <Text className="text-base text-white">I drank one</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Klicke dreimal auf *I drank one*, dann auf *One less*: Das Terminal zeigt `glasses: 1`, `glasses: 2`, `glasses: 3`,
`glasses: 2`, und der Bildschirm folgt jedem Klick.

## Signale: Werte, denen der Bildschirm folgt

Die Funktion `App` läuft **einmal**, wenn die Oberfläche gebaut wird. Wäre `glasses` eine normale Variable (`let glasses = 0`), würde eine spätere
Änderung auf dem Bildschirm nichts bewirken: Der Text wurde schon gemacht.

Ein **Signal** ist ein Wert, dem die Oberfläche folgt. `createSignal` gibt dir zwei Funktionen:

- `glasses()` liest den Wert. Jeder Teil der Oberfläche, der ihn liest (ein Text, ein Style, eine Klasse), merkt sich das.
- `setGlasses(3)` ändert den Wert. Jeder Teil, der ihn gelesen hat, wird aktualisiert, und nur diese Teile.

Das ist die ganze Idee von Zustand in `zinc:ui`: Halte, was sich ändern kann, in Signalen, lies sie dort, wo sie angezeigt werden, und
ändere sie in deinen Ereignis-Handlern. Der Bildschirm folgt von selbst.

## Zeile für Zeile

- `import { createSignal, render } from 'zinc:ui/solid';` `zinc:ui/solid` funktioniert wie [Solid](https://www.solidjs.com),
  eine Web-Bibliothek: Signale und Komponenten, die einmal laufen. (`zinc:ui/react` funktioniert stattdessen wie React; diese Lektionen benutzen
  Solid.)
- `const GOAL = 8;` die Anzahl der Gläser, die du trinken sollst, eine normale Konstante: Sie ändert sich nie.
- `const [glasses, setGlasses] = createSignal<i32>(0);` ein Signal, das eine ganze Zahl enthält (`<i32>`), mit Startwert 0.
  `createSignal` gibt zwei Dinge zurück; die eckigen Klammern benennen sie der Reihe nach: den Leser und den Schreiber.
- `function drink(by: i32): void { ... }` addiert `by` (1 oder -1) zur Anzahl. `if (next < 0 || next > GOAL) return;`
  bricht ab, wenn die Anzahl unter 0 oder über 8 gehen würde (`||` heißt "oder"). Dann ändert `setGlasses(next)` den Wert,
  und der Bildschirm folgt.
- `function message(): string { ... }` wählt anhand der Anzahl einen Satz aus. Sie ist eine normale Funktion, liest aber
  `glasses()`, deshalb folgt auch ein Text, der `message()` zeigt, dem Signal.
- `<Text ...>{`${glasses()} / ${GOAL}`}</Text>` die große Zahl. Code in einem Text steht zwischen `{ }`; hier ein Template-
  String mit der Anzahl und dem Ziel.
- `<View className="w-[320px] h-4 rounded-full bg-[#e9e6df]">` der leere Balken: 320 Pixel breit, ein helles Grau.
- `<View className="h-4 rounded-full bg-[#2563c9]" style={{ width: glasses() * 40 }} />` der blaue Teil darin.
  `style={{ ... }}` setzt einen Style aus einem Wert: Seine Breite ist 40 Pixel pro Glas, 8 Gläser füllen also die 320. Er liest
  `glasses()`, deshalb wächst er, wenn sich das Signal ändert. (Die doppelten geschweiften Klammern sind ein JavaScript-Objekt `{ width: ... }` innerhalb
  der `{ }` von JSX.)
- `<Text ...>{message()}</Text>` der Satz, der mit der Anzahl aktualisiert wird.
- `onClick={() => drink(-1)}` und `onClick={() => drink(1)}`: Jeder Button ruft `drink` mit seinem eigenen Schritt auf.

## Probier das aus

- Ändere das Ziel auf 6. Der Balken ist jetzt, wenn er voll ist, zu kurz: Mach seine Breite `glasses() * (320 / GOAL)`.
- Füge einen Button *Reset* hinzu, der `setGlasses(0)` aufruft.
- Lass die Zahl grün werden, wenn das Ziel erreicht ist: `className={...}` kann ebenfalls Signale lesen, wie Lektion 10 zeigt. Probiere
  `className={glasses() === GOAL ? 'text-6xl font-bold text-emerald-600' : 'text-6xl font-bold text-[#1d1b18]'}`.
- Füge ein zweites Signal hinzu, `cups` für Tee, mit eigenen Buttons und einer eigenen Zeile.
- Gib die Anzahl mit `console.log` innerhalb von `message()` aus und beobachte, wann es läuft: einmal am Anfang, dann nur, wenn sich die
  Anzahl ändert, nie in den Frames dazwischen.

## Weiter

[9. Ereignisse](09-events.md): Klicks sind eine Art von Ereignis; es gibt auch Drücken, Bewegen, Darüberfahren und Tasten.
