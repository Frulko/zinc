---
source: b953a830f5d768ed61f12d4ed5610d79bdc4240c
---
# Hoja de referencia de sintaxis

Zinc es TypeScript con algunas reglas. Si una línea rompe una, `zinc check` nombra la regla con un código (`Z1001`), y
`zinc explain Z1001` dice por qué y qué escribir en su lugar. Todos los códigos: [Diagnósticos](../diagnostics.md). La versión larga de
esta página: [el lenguaje](../guide/02-language.md).

## Archivos e importaciones

```ts
import { rect } from 'zinc:gfx';        // a module of the engine or of a plugin
import { total } from './cart';         // a file: relative path, .ts and .tsx are found
```

Una importación que no es ninguna de las dos es `Z0119` (dice si un plugin podría proporcionarla). `zinc plugins` lista los módulos,
`zinc add <name>` instala uno. Los archivos de código son `.ts` y `.tsx` (JSX).

## Tipos y números

```ts
const n: i32 = 7;            // machine integers: i8 i16 i32 i64 u8 u16 u32 u64; f32 f64; fx12 fx16 (fixed point)
const x = 1.5;               // number is f64 (f32 on esp32 and other small profiles)
const small: u8 = 250;       // an integer type wraps like the machine's
const names: string[] = ['a', 'b'];
const byId = new Map<i32, string>();
enum Dir { Up, Down }        // numeric enums only
interface Item { id: i32; label: string }
```

Los campos necesitan un valor: `n: i32 = 0` (un campo sin valor es `Z0111`). `??` sobre un valor que no puede ser nulo es `Z0107`.

## Lo que funciona

Clases (herencia, `abstract`, estáticos, `#private`), interfaces, genéricos, uniones, tuplas, closures, desestructuración,
spread, `?.`, `??`, `for`/`for-of`/`while`, plantillas de texto, `try`/`catch`/`finally`, `async`/`await`, generadores,
`Map`, `Set`, `JSON`, expresiones regulares (`/a+/.exec(s)`), `console.log`.

## Lo que no funciona, y qué escribir en su lugar

| No permitido | Código | Escribe en su lugar |
| --- | --- | --- |
| `var x` | Z1001 | `let x` o `const x` |
| `arguments` | Z1002 | parámetros explícitos o rest (`...args`) |
| `eval(text)` | Z1003 | `JSON.parse`, o llama a una función |
| `with (o) { x }` | Z1005 | `o.x` |
| `delete o.field` | Z1007 | un `Map` (`map.delete(k)`), o pon el campo a `null` |
| `import('./x')` | Z1009 | un `import` estático al principio del archivo |
| `Foo.prototype.bar = ...` | Z1010 | declara el método en la clase |
| `[1, , 2]` | Z1011 | escribe el valor, `null` o `undefined` |
| `globalThis.x` | Z1015 | impórtalo, o guárdalo en un módulo |
| `'a' in o` | Z9026 | `map.has('a')`, o compara el campo |
| `any` en un perfil estricto | Z1006 | dale un tipo, o usa `unknown` y redúcelo |
| llamar a un valor de tipo `any` | Z0105 | redúcelo primero (`typeof`, `instanceof`) |
| `Math.min()` sin argumentos, con `--profile ps1` | Z4001 | pasa un argumento |

`any` está permitido en el perfil por defecto (gradual); el perfil estricto es la línea `// zinc-profile: strict` al principio del
archivo de entrada, o `--strict`, y es el perfil por defecto en las placas pequeñas (`esp32`, `ps1`).

## JSX

```tsx
function Row(props: { label: string; className?: string }): i32 {
  return <View className={`flex-row gap-2 ${props.className ?? ''}`}>
    <Text className="text-lg">{props.label}</Text>
    <Button onClick={() => console.log('hi')}><Text>Go</Text></Button>
  </View>;
}
```

| Regla | Código | Solución |
| --- | --- | --- |
| `class="p-4"` o una prop llamada `class` | Z0006 | `className="p-4"`; `zinc migrate jsx-classname --apply` reescribe un proyecto |
| `<view>`, `<text>`, `<scroll>` (en minúsculas) | Z0007 | `<View>`, `<Text>`, `<ScrollView>`; `zinc migrate jsx-capitalised-tags --apply` |

Componentes del anfitrión: `View`, `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input`, `TextArea`. El texto va dentro de `Text`.
Da estilo con `className` (palabras al estilo Tailwind) o `style={{ opacity: 0.5 }}`. Los componentes devuelven `i32` (un nodo).

## La reactividad de un vistazo

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

## La memoria en tres líneas

Los objetos se cuentan por referencias y se liberan cuando se va la última referencia. Un ciclo (un padre y su hijo que se apuntan
mutuamente) pierde memoria: rómpelo con `@weak accessor owner: Node | undefined = undefined`. `using a = Arena.frame()` libera
de golpe todo lo reservado en el bloque.

## Dónde cambian las reglas según el perfil

El perfil por defecto en un ordenador es gradual (`any` permitido, `number` es `f64`). Los destinos pequeños son estrictos (`esp32`: `f32`,
sin `any`, 160 KiB de heap). Prueba un perfil en tu propia máquina con `zinc run --profile esp32`, y comprueba un proyecto entero
contra los límites de sus destinos con `zinc lint`.
