# Syntax cheat sheet

Zinc is TypeScript with some rules. If a line breaks one, `zinc check` names the rule with a code (`Z1001`), and
`zinc explain Z1001` says why and what to write instead. All codes: [Diagnostics](../diagnostics.md). The long version of
this page: [the language](../guide/02-language.md).

## Files and imports

```ts
import { rect } from 'zinc:gfx';        // a module of the engine or of a plugin
import { total } from './cart';         // a file: relative path, .ts and .tsx are found
```

An import that is neither is `Z0119` (it says whether a plugin could provide it). `zinc plugins` lists the modules,
`zinc add <name>` installs one. Source files are `.ts` and `.tsx` (JSX).

## Types and numbers

```ts
const n: i32 = 7;            // machine integers: i8 i16 i32 i64 u8 u16 u32 u64; f32 f64; fx12 fx16 (fixed point)
const x = 1.5;               // number is f64 (f32 on esp32 and other small profiles)
const small: u8 = 250;       // an integer type wraps like the machine's
const names: string[] = ['a', 'b'];
const byId = new Map<i32, string>();
enum Dir { Up, Down }        // numeric enums only
interface Item { id: i32; label: string }
```

Fields need a value: `n: i32 = 0` (a field without one is `Z0111`). `??` on a value that cannot be null is `Z0107`.

## What works

Classes (inheritance, `abstract`, statics, `#private`), interfaces, generics, unions, tuples, closures, destructuring,
spread, `?.`, `??`, `for`/`for-of`/`while`, template strings, `try`/`catch`/`finally`, `async`/`await`, generators,
`Map`, `Set`, `JSON`, regular expressions (`/a+/.exec(s)`), `console.log`.

## What does not, and what to write instead

| Not allowed | Code | Write instead |
| --- | --- | --- |
| `var x` | Z1001 | `let x` or `const x` |
| `arguments` | Z1002 | explicit or rest parameters (`...args`) |
| `eval(text)` | Z1003 | `JSON.parse`, or call a function |
| `with (o) { x }` | Z1005 | `o.x` |
| `delete o.field` | Z1007 | a `Map` (`map.delete(k)`), or set the field to `null` |
| `import('./x')` | Z1009 | a static `import` at the top of the file |
| `Foo.prototype.bar = ...` | Z1010 | declare the method in the class |
| `[1, , 2]` | Z1011 | write the value, `null` or `undefined` |
| `globalThis.x` | Z1015 | import it, or keep it in a module |
| `'a' in o` | Z9026 | `map.has('a')`, or compare the field |
| `any` in a strict profile | Z1006 | give it a type, or `unknown` and narrow it |
| calling a value typed `any` | Z0105 | narrow it first (`typeof`, `instanceof`) |
| `Math.min()` with no argument, under `--profile ps1` | Z4001 | pass an argument |

`any` is fine in the default (gradual) profile; the strict profile is the line `// zinc-profile: strict` at the top of the
entry file, or `--strict`, and is the default on small boards (`esp32`, `ps1`).

## JSX

```tsx
function Row(props: { label: string; className?: string }): i32 {
  return <View className={`flex-row gap-2 ${props.className ?? ''}`}>
    <Text className="text-lg">{props.label}</Text>
    <Button onClick={() => console.log('hi')}><Text>Go</Text></Button>
  </View>;
}
```

| Rule | Code | Fix |
| --- | --- | --- |
| `class="p-4"` or a prop named `class` | Z0006 | `className="p-4"`; `zinc migrate jsx-classname --apply` rewrites a project |
| `<view>`, `<text>`, `<scroll>` (lowercase) | Z0007 | `<View>`, `<Text>`, `<ScrollView>`; `zinc migrate jsx-capitalised-tags --apply` |

Host components: `View`, `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input`, `TextArea`. Text goes inside `Text`.
Style with `className` (Tailwind-like words) or `style={{ opacity: 0.5 }}`. Components return `i32` (a node).

## Reactivity at a glance

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

## Memory in three lines

Objects are reference counted and freed when the last reference goes. A cycle (a parent and its child pointing at each
other) leaks: break it with `@weak accessor owner: Node | undefined = undefined`. `using a = Arena.frame()` frees
everything allocated in the block at once.

## Where the rules differ by profile

The default profile on a computer is gradual (`any` allowed, `number` is `f64`). Small targets are strict (`esp32`: `f32`,
no `any`, 160 KiB heap). Try a profile on your own machine with `zinc run --profile esp32`, and check a whole project
against the limits of its targets with `zinc lint`.
