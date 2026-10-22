---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 10. Styles

**Das wirst du sehen:** drei Karten, *Sunrise*, *Forest* und *Night*, jede mit einem Farbfeld. Klicke eine an: Sie bekommt einen
violetten Rand und einen Schatten, und die ganze Seite übernimmt ihre Farben (Night macht sie dunkel).

![Drei Karten auf einer dunklen Seite, die Karte Night ausgewählt](img/10-styles.png)

## Der Code

Das Projekt liegt in [`samples/10-styles`](samples/10-styles/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const [theme, setTheme] = createSignal<string>('Sunrise');

function pick(name: string): void {
  setTheme(name);
  console.log(`theme: ${name}`);
}

function page(): string {
  if (theme() === 'Night') return 'bg-slate-900';
  if (theme() === 'Forest') return 'bg-emerald-50';
  return 'bg-amber-50';
}

function title(): string {
  return theme() === 'Night' ? 'text-slate-100' : 'text-slate-900';
}

interface CardProps { name: string; swatch: string; words: string }

function Card(props: CardProps): i32 {
  const chosen = (): boolean => theme() === props.name;
  return <Button
    className={`w-[170px] p-4 gap-2 rounded-xl bg-white border-2 hover:bg-slate-50 ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}
    onClick={() => pick(props.name)}>
    <View className={`w-full h-16 rounded-lg ${props.swatch}`} />
    <Text className="text-lg font-bold text-slate-900">{props.name}</Text>
    <Text className="text-sm text-slate-500">{props.words}</Text>
  </Button>;
}

function App(): i32 {
  return <View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>
    <Text className={`text-3xl font-bold ${title()}`}>Pick a theme</Text>
    <View className="flex-row gap-4">
      <Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />
      <Card name="Forest" swatch="bg-emerald-600" words="Calm and green" />
      <Card name="Night" swatch="bg-indigo-900" words="Easy on the eyes" />
    </View>
  </View>;
}

render(App, 0xffffff, null);
```

Klicke auf *Night*: Die Seite wird dunkel, und das Terminal zeigt `theme: Night`.

## Wie `className` funktioniert

`className` enthält eine Liste kurzer Wörter, durch Leerzeichen getrennt, und jedes setzt eine Sache. Es sind die Wörter von
[Tailwind CSS](https://tailwindcss.com), einem Style-System für das Web: Wenn du es kennst, kennst du diese. Wenn `className` ein
einfacher Text zwischen Anführungszeichen ist, liest Zinc ihn, bevor das Programm läuft, und sagt dir, wenn ein Wort nicht existiert.

| Was du setzen willst | Schreibe | Beispiele |
|---|---|---|
| Breite, Höhe | `w-*`, `h-*` | `w-24` (96 px), `w-full` (das ganze Elternelement), `h-[200px]` (genau 200) |
| Platz innen | `p-*`, `px-*`, `py-*`, `pt-*` ... | `p-4` (16 px auf jeder Seite), `px-6` (24 px links und rechts) |
| Platz zwischen Kindern | `gap-*` | `gap-4` |
| Richtung | `flex-row`, `flex-col` | nebeneinander oder untereinander (der Standard) |
| Ausrichtung | `items-*`, `justify-*` | `items-center`, `justify-between` (das erste am Anfang, das letzte am Ende) |
| Wachsen | `grow` | nimmt den Platz, der in seinem Elternelement übrig ist |
| Hintergrund | `bg-*` | `bg-white`, `bg-amber-400`, `bg-[#5746e0]` |
| Text | `text-*`, `font-*` | `text-sm`, `text-2xl`, `text-slate-500`, `font-bold`, `text-center` |
| Ecken | `rounded-*` | `rounded-lg`, `rounded-xl`, `rounded-full` |
| Rahmen | `border`, `border-2`, `border-*` | `border-2 border-indigo-600` (2 px, violett) |
| Schatten | `shadow-*` | `shadow-sm`, `shadow-lg` |
| durchsichtig | `opacity-*` | `opacity-50` |

Zahlen zählen Schritte von 4 Pixeln (`p-4` sind 16 px). Farben haben einen Namen und eine Abstufung von 50 (sehr hell) bis 950 (sehr
dunkel): `slate`, `gray`, `red`, `orange`, `amber`, `yellow`, `green`, `emerald`, `teal`, `sky`, `blue`, `indigo`,
`violet`, `purple`, `pink`, `rose` und mehr. Jeder exakte Wert steht in eckigen Klammern: `w-[170px]`, `bg-[#f3f1ec]`.

Ein Wort mit einem Präfix gilt nur in einem Zustand: `hover:bg-slate-50`, solange der Zeiger über dem Element ist,
`active:bg-slate-100`, solange es gedrückt wird, `focus:border-blue-500`, solange es den Tastaturfokus hat.

## Zeile für Zeile

- `const [theme, setTheme] = createSignal<string>('Sunrise');` das gewählte Thema, ein Signal, das seinen Namen enthält.
- `function page(): string` gibt die Klassen der Seite für das gewählte Thema zurück: ein helles Bernstein, ein helles Grün oder ein dunkles
  Schiefergrau. `title()` tut dasselbe für die Farbe des Titels: heller Text auf der dunklen Seite.
- `interface CardProps { name: string; swatch: string; words: string }` beschreibt, was eine Karte braucht: Ein **Interface**
  listet die Namen und Typen der Werte auf, die ein Objekt enthält.
- `function Card(props: CardProps): i32` eine eigene Komponente. Sie erhält ihre Werte in einem Objekt, `props` (kurz
  für properties, Eigenschaften): `props.name`, `props.swatch`, `props.words`.
- `const chosen = (): boolean => theme() === props.name;` eine kleine Funktion: Ist diese Karte die gewählte?
- `className={`w-[170px] p-4 gap-2 ... ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}`
  die Klassen der Karte. Der erste Teil ändert sich nie: 170 Pixel breit, Innenabstand, abgerundete Ecken, ein weißer Hintergrund, ein
  Rahmen von 2 Pixeln, ein hellerer Hintergrund beim Darüberfahren. Der Teil in `${ }` ändert sich mit dem Signal: Die gewählte Karte bekommt einen
  violetten Rand und einen großen Schatten, die anderen einen hellen Rand und einen kleinen Schatten. Weil der Text `theme()` liest, werden die
  Klassen jedes Mal neu berechnet, wenn sich das Thema ändert.
- `<View className={`w-full h-16 rounded-lg ${props.swatch}`} />` das Farbfeld: volle Breite, 64 Pixel hoch, mit der
  Farbklasse, die die Karte bekommen hat.
- `<Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />` benutzt die Komponente. Jedes Attribut wird zu einem
  Feld von `props`. Komponenten, die du schreibst, beginnen mit einem Großbuchstaben, wie die von Zinc selbst.
- `<View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>` die Seite: Ihr Hintergrund folgt
  dem Thema.

## Probier das aus

- Füge ein viertes Thema hinzu, *Ocean*, mit `bg-sky-500` als Farbfeld und `bg-sky-50` als Seite.
- Lass die ausgewählte Karte stärker hervortreten: `bg-indigo-50`, wenn sie gewählt ist.
- Ändere `hover:bg-slate-50` in `hover:bg-amber-100` und fahre mit dem Zeiger über die Karten.
- Setze die Karten untereinander: Ändere `flex-row` in `flex-col`.
- Runde die Karten ganz ab mit `rounded-3xl` oder mach sie eckig mit `rounded-none`.
- Schreibe einen Style, den `className` nicht ausdrücken kann, als Objekt: `style={{ opacity: 0.8 }}` (Lektion 8 benutzte
  `style={{ width: ... }}`). [zinc:ui im Detail](../ui.md#object-styles-and-stylesheet) listet die Style-Schlüssel auf, und
  [Styles als Objekte](../start/beyond.md#styles-as-objects) schreibt einen ganzen Bildschirm damit, wie React Native es tut.

## Weiter

[11. Eine Zeichnung in einer Oberfläche](11-drawing-in-an-interface.md): Teil 1 und Teil 2 mischen.
