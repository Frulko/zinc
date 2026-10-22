---
source: b953a830f5d768ed61f12d4ed5610d79bdc4240c
---
# Promemoria della sintassi

Zinc è TypeScript con qualche regola. Se una riga ne infrange una, `zinc check` nomina la regola con un codice (`Z1001`), e
`zinc explain Z1001` dice perché e cosa scrivere al suo posto. Tutti i codici: [Diagnostica](../diagnostics.md). La versione lunga di
questa pagina: [il linguaggio](../guide/02-language.md).

## File e import

```ts
import { rect } from 'zinc:gfx';        // a module of the engine or of a plugin
import { total } from './cart';         // a file: relative path, .ts and .tsx are found
```

Un import che non è né l'uno né l'altro dà `Z0119` (dice se un plugin potrebbe fornirlo). `zinc plugins` elenca i moduli,
`zinc add <name>` ne installa uno. I file sorgente sono `.ts` e `.tsx` (JSX).

## Tipi e numeri

```ts
const n: i32 = 7;            // machine integers: i8 i16 i32 i64 u8 u16 u32 u64; f32 f64; fx12 fx16 (fixed point)
const x = 1.5;               // number is f64 (f32 on esp32 and other small profiles)
const small: u8 = 250;       // an integer type wraps like the machine's
const names: string[] = ['a', 'b'];
const byId = new Map<i32, string>();
enum Dir { Up, Down }        // numeric enums only
interface Item { id: i32; label: string }
```

I campi hanno bisogno di un valore: `n: i32 = 0` (un campo senza valore dà `Z0111`). `??` su un valore che non può essere null dà `Z0107`.

## Cosa funziona

Classi (ereditarietà, `abstract`, statici, `#private`), interfacce, generics, unioni, tuple, closure, destructuring,
spread, `?.`, `??`, `for`/`for-of`/`while`, template string, `try`/`catch`/`finally`, `async`/`await`, generatori,
`Map`, `Set`, `JSON`, espressioni regolari (`/a+/.exec(s)`), `console.log`.

## Cosa non funziona, e cosa scrivere al suo posto

| Non consentito | Codice | Scrivi invece |
| --- | --- | --- |
| `var x` | Z1001 | `let x` o `const x` |
| `arguments` | Z1002 | parametri espliciti o rest (`...args`) |
| `eval(text)` | Z1003 | `JSON.parse`, o chiama una funzione |
| `with (o) { x }` | Z1005 | `o.x` |
| `delete o.field` | Z1007 | una `Map` (`map.delete(k)`), o metti il campo a `null` |
| `import('./x')` | Z1009 | un `import` statico in cima al file |
| `Foo.prototype.bar = ...` | Z1010 | dichiara il metodo nella classe |
| `[1, , 2]` | Z1011 | scrivi il valore, `null` o `undefined` |
| `globalThis.x` | Z1015 | importalo, o tienilo in un modulo |
| `'a' in o` | Z9026 | `map.has('a')`, o confronta il campo |
| `any` in un profilo strict | Z1006 | dagli un tipo, oppure `unknown` e restringilo |
| chiamare un valore di tipo `any` | Z0105 | restringilo prima (`typeof`, `instanceof`) |
| `Math.min()` senza argomenti, con `--profile ps1` | Z4001 | passa un argomento |

`any` va bene nel profilo predefinito (graduale); il profilo strict è la riga `// zinc-profile: strict` in cima al
file di entrata, oppure `--strict`, ed è quello predefinito sulle piccole schede (`esp32`, `ps1`).

## JSX

```tsx
function Row(props: { label: string; className?: string }): i32 {
  return <View className={`flex-row gap-2 ${props.className ?? ''}`}>
    <Text className="text-lg">{props.label}</Text>
    <Button onClick={() => console.log('hi')}><Text>Go</Text></Button>
  </View>;
}
```

| Regola | Codice | Correzione |
| --- | --- | --- |
| `class="p-4"` o una prop chiamata `class` | Z0006 | `className="p-4"`; `zinc migrate jsx-classname --apply` riscrive un progetto |
| `<view>`, `<text>`, `<scroll>` (minuscolo) | Z0007 | `<View>`, `<Text>`, `<ScrollView>`; `zinc migrate jsx-capitalised-tags --apply` |

Componenti host: `View`, `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input`, `TextArea`. Il testo va dentro `Text`.
Dai lo stile con `className` (parole simili a Tailwind) o con `style={{ opacity: 0.5 }}`. I componenti restituiscono `i32` (un nodo).

## La reattività in breve

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

## La memoria in tre righe

Gli oggetti sono contati per riferimento e liberati quando se ne va l'ultimo riferimento. Un ciclo (un genitore e il suo figlio che si
puntano a vicenda) crea una perdita: spezzalo con `@weak accessor owner: Node | undefined = undefined`. `using a = Arena.frame()` libera
in un colpo solo tutto ciò che è stato allocato nel blocco.

## Dove le regole cambiano secondo il profilo

Il profilo predefinito su un computer è graduale (`any` consentito, `number` è `f64`). I target piccoli sono strict (`esp32`: `f32`,
niente `any`, heap di 160 KiB). Prova un profilo sul tuo computer con `zinc run --profile esp32`, e controlla un intero progetto
rispetto ai limiti dei suoi target con `zinc lint`.
