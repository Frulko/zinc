---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 7. Komponenten

**Das wirst du sehen:** eine weiße Karte in der Mitte des Fensters, mit einer Rakete, einem Titel, einem Satz und einem violetten Button *Join*.
Ein Klick auf den Button gibt eine Zeile aus.

![Eine Karte mit einer Rakete, dem Titel "Rocket club", einem Satz und einem Join-Button](img/07-components.png)

## Ein neuer Weg, etwas auf den Bildschirm zu bringen

In Teil 1 hat dein Programm jeden Frame selbst gezeichnet: Es musste sagen, wohin jedes Ding kommt, in Pixeln. Für eine App (ein Formular, eine
Liste, Einstellungen) ist das viel Arbeit: Text muss umbrechen, Dinge müssen sich ausrichten, das Fenster kann seine Größe ändern.

`zinc:ui` übernimmt diese Arbeit. Du beschreibst einmal, was der Bildschirm enthält, als **Elemente** in anderen Elementen, so wie eine Webseite
geschrieben wird. Zinc ordnet sie an, zeichnet sie und zeichnet sie neu, wenn sich etwas ändert. Die Beschreibung benutzt
**JSX**: Tags wie in HTML, mitten im Code.

## Der Code

Das Projekt liegt in [`samples/07-components`](samples/07-components/). Der Code steht in `src/main.tsx`: Das `x` in `.tsx`
sagt, dass die Datei JSX enthält. `zinc.json` nennt sie als Einstieg und hat einen Ordner `assets` für das Bild:

```json
{
  "name": "components",
  "entry": "src/main.tsx",
  "assets": "assets",
  "app": { "id": "com.example.learn.components", "window": { "width": 640, "height": 400 } }
}
```

`src/main.tsx`:

```tsx
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="w-full h-full items-center justify-center">
    <View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">
      <Image src="rocket.svg" className="w-24 h-24" />
      <Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>
      <Text className="text-base text-center text-[#625d55]">We build small rockets on Saturdays. Everyone is welcome.</Text>
      <Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>
        <Text className="text-base font-medium text-white">Join</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Klicke auf *Join*: Das Terminal zeigt `Welcome aboard!`

## Die Elemente

Die Elemente von Zinc beginnen mit einem Großbuchstaben, wie in React Native:

| Element | Was es ist |
|---|---|
| `View` | eine Box. Sie enthält andere Elemente und ordnet sie an; sie kann einen Hintergrund, einen Rahmen und abgerundete Ecken haben. |
| `Text` | Wörter. Text steht immer innerhalb eines `Text`. |
| `Image` | ein Bild aus dem Ordner `assets`: `src="rocket.svg"`. |
| `Button` | etwas zum Drücken: Er enthält einen `Text` (oder ein Icon) und führt `onClick` aus, wenn er gedrückt wird. |
| `ScrollView` | eine Box, deren Inhalt scrollt, wenn er zu lang ist. |
| `Input`, `TextArea` | ein Feld, in das du eine Zeile oder mehrere tippst (Lektion 12 benutzt `Input`). |
| `Canvas` | eine Box, in die du mit `zinc:gfx` zeichnest (Lektion 11). |

Zwei Schreibregeln, die Zinc prüft: Elemente beginnen mit einem Großbuchstaben (`<View>`), und das Aussehen eines Elements
steht in `className` (das kürzere Wort ist ein Schlüsselwort von JavaScript, deshalb lehnt Zinc es ab).

## Wie sie angeordnet werden

Eine `View` ordnet ihre Kinder von oben nach unten untereinander an. `className` sagt, wie:

- `w-full h-full`: so breit und so hoch wie das Elternelement (hier das ganze Fenster).
- `items-center`: Die Kinder werden quer zentriert (von links nach rechts, in einer Spalte).
- `justify-center`: Die Kinder werden längs zentriert (von oben nach unten, in einer Spalte).
- `w-[340px]`: genau 340 Pixel breit. In eckigen Klammern steht ein exakter Wert.
- `p-6`: Platz innerhalb der Box, auf allen Seiten. Die Zahlen von `p-`, `gap-`, `w-`, `h-` zählen Schritte von 4 Pixeln: `p-6` sind
  24 Pixel, `gap-3` sind 12.
- `gap-3`: 12 Pixel zwischen den Kindern.

Mehr zu Styles gibt es in Lektion 10.

## Zeile für Zeile

- `import { render } from 'zinc:ui/solid';` `render` bringt eine Oberfläche auf den Bildschirm. Die Elemente selbst
  (`View`, `Text` ...) brauchen keinen Import.
- `function App(): i32 { return <View ...>...</View>; }` eine **Komponente**: eine Funktion, die Elemente zurückgibt. `App` ist
  die ganze Oberfläche. Ihr Typ ist `i32` (eine ganze Zahl), weil Zinc jedes Element, das es erzeugt, mit einer Zahl benennt; du
  musst diese Zahl nie ansehen.
- `<View className="w-full h-full items-center justify-center">` Die äußere Box füllt das Fenster und zentriert, was sie
  enthält: die Karte.
- `<View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">` die Karte: 340 Pixel breit, 24 Pixel
  Innenabstand, 12 Pixel zwischen ihren Kindern, zentrierte Kinder, stark abgerundete Ecken (`rounded-2xl`), ein weißer Hintergrund.
  Ihre Höhe ist nicht angegeben: Sie ist so hoch wie ihr Inhalt.
- `<Image src="rocket.svg" className="w-24 h-24" />` das Bild, 96 mal 96 Pixel. `/>` schließt ein Element, das nichts
  enthält.
- `<Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>` ein Titel: groß (`text-2xl`), fett, fast
  schwarz. `text-[#1d1b18]` ist eine exakte Farbe, geschrieben wie im Web.
- `<Text className="text-base text-center text-[#625d55]">...` ein Satz in normaler Größe, zentriert, grau. Er ist länger,
  als die Karte breit ist, und bricht deshalb von selbst auf zwei Zeilen um.
- `<Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>` ein Button, 44
  Pixel hoch, mit 24 Pixeln Innenabstand links und rechts (`px-6`), runden Enden, violett. `onClick={...}` gibt ihm eine
  Funktion, die beim Drücken läuft: Die geschweiften Klammern `{ }` setzen Code in JSX. Lektion 9 handelt von Ereignissen.
- `render(App, 0xf3f1ec, null);` zeigt `App` im Fenster. Das zweite Argument ist die Hintergrundfarbe des Fensters (eine
  Zahl, wie in Teil 1). Das dritte ist eine Funktion, die in jedem Frame läuft; `null` heißt keine.

## Probier das aus

- Ändere den Titel und den Satz. Mach den Satz länger und sieh zu, wie er umbricht.
- Setze das Bild hinter den Button. Die Reihenfolge der Elemente ist die Reihenfolge auf dem Bildschirm.
- Füge `flex-row` zum `className` der Karte hinzu: Die Kinder stehen dann nebeneinander.
- Mach die Karte breiter (`w-[480px]`) oder entferne `w-[340px]`, um zu sehen, was die Karte ohne Breite tut.
- Füge neben dem ersten einen zweiten Button hinzu: Packe die beiden in `<View className="flex-row gap-3">...</View>`.
- Mach deine eigene Komponente: `function Title(): i32 { return <Text className="text-3xl">Hi</Text>; }`, und schreibe dann
  `<Title />` in `App`.

## Weiter

[8. Zustand](08-state.md): eine Oberfläche, die sich ändert, wenn sich ein Wert ändert.
