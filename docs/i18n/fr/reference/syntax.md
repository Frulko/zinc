---
source: b953a830f5d768ed61f12d4ed5610d79bdc4240c
---
# Aide-mémoire de la syntaxe

Zinc, c'est du TypeScript avec quelques règles. Si une ligne en enfreint une, `zinc check` nomme la règle avec un code (`Z1001`), et
`zinc explain Z1001` explique pourquoi et ce qu'il faut écrire à la place. Tous les codes : [Diagnostics](../diagnostics.md). La version
longue de cette page : [le langage](../guide/02-language.md).

## Fichiers et imports

```ts
import { rect } from 'zinc:gfx';        // a module of the engine or of a plugin
import { total } from './cart';         // a file: relative path, .ts and .tsx are found
```

Un import qui n'est ni l'un ni l'autre donne `Z0119` (le message dit si un plugin pourrait le fournir). `zinc plugins` liste les modules,
`zinc add <name>` en installe un. Les fichiers source sont des `.ts` et des `.tsx` (JSX).

## Types et nombres

```ts
const n: i32 = 7;            // machine integers: i8 i16 i32 i64 u8 u16 u32 u64; f32 f64; fx12 fx16 (fixed point)
const x = 1.5;               // number is f64 (f32 on esp32 and other small profiles)
const small: u8 = 250;       // an integer type wraps like the machine's
const names: string[] = ['a', 'b'];
const byId = new Map<i32, string>();
enum Dir { Up, Down }        // numeric enums only
interface Item { id: i32; label: string }
```

Les champs ont besoin d'une valeur : `n: i32 = 0` (un champ sans valeur donne `Z0111`). `??` sur une valeur qui ne peut pas être nulle donne `Z0107`.

## Ce qui marche

Classes (héritage, `abstract`, membres statiques, `#private`), interfaces, génériques, unions, tuples, fermetures, déstructuration,
spread, `?.`, `??`, `for`/`for-of`/`while`, chaînes de gabarit, `try`/`catch`/`finally`, `async`/`await`, générateurs,
`Map`, `Set`, `JSON`, expressions régulières (`/a+/.exec(s)`), `console.log`.

## Ce qui ne marche pas, et quoi écrire à la place

| Interdit | Code | Écrivez plutôt |
| --- | --- | --- |
| `var x` | Z1001 | `let x` ou `const x` |
| `arguments` | Z1002 | des paramètres explicites ou rest (`...args`) |
| `eval(text)` | Z1003 | `JSON.parse`, ou appelez une fonction |
| `with (o) { x }` | Z1005 | `o.x` |
| `delete o.field` | Z1007 | une `Map` (`map.delete(k)`), ou mettez le champ à `null` |
| `import('./x')` | Z1009 | un `import` statique en haut du fichier |
| `Foo.prototype.bar = ...` | Z1010 | déclarez la méthode dans la classe |
| `[1, , 2]` | Z1011 | écrivez la valeur, `null` ou `undefined` |
| `globalThis.x` | Z1015 | importez-la, ou gardez-la dans un module |
| `'a' in o` | Z9026 | `map.has('a')`, ou comparez le champ |
| `any` dans un profil strict | Z1006 | donnez-lui un type, ou `unknown` puis affinez-le |
| appeler une valeur de type `any` | Z0105 | affinez-la d'abord (`typeof`, `instanceof`) |
| `Math.min()` sans argument, avec `--profile ps1` | Z4001 | passez un argument |

`any` est accepté dans le profil par défaut (progressif) ; le profil strict s'active avec la ligne `// zinc-profile: strict` en haut du
fichier d'entrée, ou avec `--strict`, et c'est le profil par défaut sur les petites cartes (`esp32`, `ps1`).

## JSX

```tsx
function Row(props: { label: string; className?: string }): i32 {
  return <View className={`flex-row gap-2 ${props.className ?? ''}`}>
    <Text className="text-lg">{props.label}</Text>
    <Button onClick={() => console.log('hi')}><Text>Go</Text></Button>
  </View>;
}
```

| Règle | Code | Correction |
| --- | --- | --- |
| `class="p-4"` ou une prop nommée `class` | Z0006 | `className="p-4"` ; `zinc migrate jsx-classname --apply` réécrit un projet |
| `<view>`, `<text>`, `<scroll>` (en minuscules) | Z0007 | `<View>`, `<Text>`, `<ScrollView>` ; `zinc migrate jsx-capitalised-tags --apply` |

Composants de base : `View`, `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input`, `TextArea`. Le texte va à l'intérieur de `Text`.
Mettez en forme avec `className` (des mots à la Tailwind) ou `style={{ opacity: 0.5 }}`. Les composants renvoient un `i32` (un nœud).

## La réactivité en bref

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

## La mémoire en trois lignes

Les objets sont comptés par référence et libérés quand la dernière référence disparaît. Un cycle (un parent et son enfant qui se
pointent l'un l'autre) fuit : cassez-le avec `@weak accessor owner: Node | undefined = undefined`. `using a = Arena.frame()` libère
d'un coup tout ce qui a été alloué dans le bloc.

## Où les règles changent selon le profil

Le profil par défaut sur un ordinateur est progressif (`any` accepté, `number` vaut `f64`). Les petites cibles sont strictes (`esp32` : `f32`,
pas de `any`, 160 Kio de tas). Essayez un profil sur votre propre machine avec `zinc run --profile esp32`, et vérifiez un projet entier
par rapport aux limites de ses cibles avec `zinc lint`.
