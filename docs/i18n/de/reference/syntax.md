---
source: b953a830f5d768ed61f12d4ed5610d79bdc4240c
---
# Syntax-Spickzettel

Zinc ist TypeScript mit ein paar Regeln. Wenn eine Zeile gegen eine davon verstößt, nennt `zinc check` die Regel mit einem Code (`Z1001`), und
`zinc explain Z1001` sagt dir, warum und was du stattdessen schreiben sollst. Alle Codes: [Diagnosen](../diagnostics.md). Die lange Fassung
dieser Seite: [die Sprache](../guide/02-language.md).

## Dateien und Importe

```ts
import { rect } from 'zinc:gfx';        // a module of the engine or of a plugin
import { total } from './cart';         // a file: relative path, .ts and .tsx are found
```

Ein Import, der keins von beidem ist, löst `Z0119` aus (der Fehler sagt, ob ein Plugin ihn liefern könnte). `zinc plugins` listet die Module auf,
`zinc add <name>` installiert eins. Quelldateien sind `.ts` und `.tsx` (JSX).

## Typen und Zahlen

```ts
const n: i32 = 7;            // machine integers: i8 i16 i32 i64 u8 u16 u32 u64; f32 f64; fx12 fx16 (fixed point)
const x = 1.5;               // number is f64 (f32 on esp32 and other small profiles)
const small: u8 = 250;       // an integer type wraps like the machine's
const names: string[] = ['a', 'b'];
const byId = new Map<i32, string>();
enum Dir { Up, Down }        // numeric enums only
interface Item { id: i32; label: string }
```

Felder brauchen einen Wert: `n: i32 = 0` (ein Feld ohne Wert löst `Z0111` aus). `??` auf einem Wert, der nicht null sein kann, löst `Z0107` aus.

## Was funktioniert

Klassen (Vererbung, `abstract`, Statics, `#private`), Interfaces, Generics, Unions, Tupel, Closures, Destructuring,
Spread, `?.`, `??`, `for`/`for-of`/`while`, Template-Strings, `try`/`catch`/`finally`, `async`/`await`, Generatoren,
`Map`, `Set`, `JSON`, reguläre Ausdrücke (`/a+/.exec(s)`), `console.log`.

## Was nicht geht, und was du stattdessen schreibst

| Nicht erlaubt | Code | Schreibe stattdessen |
| --- | --- | --- |
| `var x` | Z1001 | `let x` oder `const x` |
| `arguments` | Z1002 | explizite Parameter oder Rest-Parameter (`...args`) |
| `eval(text)` | Z1003 | `JSON.parse` oder einen Funktionsaufruf |
| `with (o) { x }` | Z1005 | `o.x` |
| `delete o.field` | Z1007 | eine `Map` (`map.delete(k)`) oder setze das Feld auf `null` |
| `import('./x')` | Z1009 | ein statischer `import` am Anfang der Datei |
| `Foo.prototype.bar = ...` | Z1010 | deklariere die Methode in der Klasse |
| `[1, , 2]` | Z1011 | schreibe den Wert, `null` oder `undefined` |
| `globalThis.x` | Z1015 | importiere es oder halte es in einem Modul |
| `'a' in o` | Z9026 | `map.has('a')` oder vergleiche das Feld |
| `any` in einem strikten Profil | Z1006 | gib einen Typ an, oder nimm `unknown` und grenze ihn ein |
| ein Aufruf eines Werts vom Typ `any` | Z0105 | grenze ihn zuerst ein (`typeof`, `instanceof`) |
| `Math.min()` ohne Argument, unter `--profile ps1` | Z4001 | gib ein Argument mit |

`any` ist im Standardprofil (dem graduellen) in Ordnung; das strikte Profil ist die Zeile `// zinc-profile: strict` am Anfang der
Einstiegsdatei oder `--strict`, und es ist der Standard auf kleinen Boards (`esp32`, `ps1`).

## JSX

```tsx
function Row(props: { label: string; className?: string }): i32 {
  return <View className={`flex-row gap-2 ${props.className ?? ''}`}>
    <Text className="text-lg">{props.label}</Text>
    <Button onClick={() => console.log('hi')}><Text>Go</Text></Button>
  </View>;
}
```

| Regel | Code | Lösung |
| --- | --- | --- |
| `class="p-4"` oder eine Prop namens `class` | Z0006 | `className="p-4"`; `zinc migrate jsx-classname --apply` schreibt ein Projekt um |
| `<view>`, `<text>`, `<scroll>` (kleingeschrieben) | Z0007 | `<View>`, `<Text>`, `<ScrollView>`; `zinc migrate jsx-capitalised-tags --apply` |

Host-Komponenten: `View`, `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input`, `TextArea`. Text steht innerhalb von `Text`.
Gestalte mit `className` (Wörter wie bei Tailwind) oder `style={{ opacity: 0.5 }}`. Komponenten geben `i32` zurück (einen Knoten).

## Reaktivität auf einen Blick

```tsx
// Solid: the component runs once; the signal updates only what reads it
import { createSignal, render } from 'zinc:ui/solid';
const [count, setCount] = createSignal<i32>(0);
function App(): i32 {
  return <Button onClick={() => setCount(count() + 1)}><Text>{count()}</Text></Button>;
}
render(App, 0x0f172a, null);   // component, background colour, optional per-frame callback
```

```tsx
// React: hooks, the component runs again when state changes
import { useState, render } from 'zinc:ui/react';
function App(): i32 {
  const [n, setN] = useState<i32>(0);
  return <Button onClick={() => setN(n + 1)}><Text>{n}</Text></Button>;
}
render(App, 0x0f172a, null);
```

## Speicher in drei Zeilen

Objekte werden referenzgezählt und freigegeben, sobald die letzte Referenz verschwindet. Ein Zyklus (ein Elternteil und sein Kind, die aufeinander
zeigen) leckt: Löse ihn mit `@weak accessor owner: Node | undefined = undefined`. `using a = Arena.frame()` gibt alles frei,
was im Block angelegt wurde, und zwar auf einmal.

## Wo die Regeln je nach Profil abweichen

Das Standardprofil auf einem Computer ist graduell (`any` erlaubt, `number` ist `f64`). Kleine Ziele sind strikt (`esp32`: `f32`,
kein `any`, 160 KiB Heap). Probiere ein Profil auf deinem eigenen Rechner mit `zinc run --profile esp32` aus, und prüfe ein ganzes Projekt
mit `zinc lint` gegen die Grenzen seiner Ziele.
