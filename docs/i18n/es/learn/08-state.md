---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 8. El estado

**Lo que verás:** un contador de vasos de agua, una barra azul que crece con él, una frase que cambia y dos botones,
*One less* y *I drank one*.

![2 / 8 en dígitos grandes, una barra azul llena a una cuarta parte, "6 more to go." y dos botones](img/08-state.png)

## El código

El proyecto está en [`samples/08-state`](samples/08-state/). `src/main.tsx`:

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

Pulsa *I drank one* tres veces y luego *One less*: la terminal muestra `glasses: 1`, `glasses: 2`, `glasses: 3`,
`glasses: 2`, y la pantalla sigue cada clic.

## Señales: valores que la pantalla sigue

La función `App` se ejecuta **una sola vez**, cuando se construye la interfaz. Si `glasses` fuera una variable normal
(`let glasses = 0`), cambiarla más tarde no cambiaría nada en pantalla: el texto ya estaba hecho.

Una **señal** es un valor que la interfaz sigue. `createSignal` te da dos funciones:

- `glasses()` lee el valor. Cada parte de la interfaz que lo lee (un texto, un estilo, una clase) recuerda que lo hizo.
- `setGlasses(3)` cambia el valor. Se actualizan todas las partes que lo leyeron, y solo esas.

Esta es toda la idea del estado en `zinc:ui`: guarda lo que puede cambiar en señales, léelas donde se muestran y
cámbialas en tus manejadores de eventos. La pantalla las sigue sola.

## Línea por línea

- `import { createSignal, render } from 'zinc:ui/solid';` `zinc:ui/solid` funciona como [Solid](https://www.solidjs.com),
  una biblioteca web: señales y componentes que se ejecutan una sola vez. (`zinc:ui/react` funciona como React; estas
  lecciones usan Solid.)
- `const GOAL = 8;` el número de vasos que hay que beber, una constante normal: nunca cambia.
- `const [glasses, setGlasses] = createSignal<i32>(0);` una señal que guarda un número entero (`<i32>`), que empieza en 0.
  `createSignal` devuelve dos cosas; los corchetes las nombran, en orden: el lector y el escritor.
- `function drink(by: i32): void { ... }` suma `by` (1 o -1) a la cuenta. `if (next < 0 || next > GOAL) return;`
  se detiene ahí cuando la cuenta bajaría de 0 o subiría de 8 (`||` significa "o"). Luego `setGlasses(next)` cambia el
  valor y la pantalla lo sigue.
- `function message(): string { ... }` elige una frase según la cuenta. Es una función normal, pero lee `glasses()`,
  así que un texto que muestre `message()` también sigue la señal.
- `<Text ...>{`${glasses()} / ${GOAL}`}</Text>` el número grande. El código dentro de un texto va entre `{ }`; aquí una
  plantilla de texto con la cuenta y la meta.
- `<View className="w-[320px] h-4 rounded-full bg-[#e9e6df]">` la barra vacía: 320 píxeles de ancho, de un gris claro.
- `<View className="h-4 rounded-full bg-[#2563c9]" style={{ width: glasses() * 40 }} />` la parte azul que hay dentro.
  `style={{ ... }}` fija un estilo a partir de un valor: su ancho es de 40 píxeles por vaso, así que 8 vasos llenan los
  320. Lee `glasses()`, así que crece cuando cambia la señal. (Las llaves dobles son un objeto de JavaScript
  `{ width: ... }` dentro de las `{ }` de JSX.)
- `<Text ...>{message()}</Text>` la frase, que se actualiza con la cuenta.
- `onClick={() => drink(-1)}` y `onClick={() => drink(1)}`: cada botón llama a `drink` con su propio paso.

## Prueba esto

- Cambia la meta a 6. Ahora la barra se queda corta al llenarse: haz que su ancho sea `glasses() * (320 / GOAL)`.
- Añade un botón *Reset* que llame a `setGlasses(0)`.
- Haz que el número se vuelva verde al alcanzar la meta: `className={...}` también puede leer señales, como muestra la
  lección 10. Prueba
  `className={glasses() === GOAL ? 'text-6xl font-bold text-emerald-600' : 'text-6xl font-bold text-[#1d1b18]'}`.
- Añade una segunda señal, `cups` de té, con sus propios botones y su propia línea.
- Imprime la cuenta con `console.log` dentro de `message()` y mira cuándo se ejecuta: una vez al principio, luego solo
  cuando cambia la cuenta, nunca en los fotogramas intermedios.

## Siguiente

[9. Eventos](09-events.md): los clics son un tipo de evento; también hay pulsaciones, movimientos, pasar el puntero por
encima y teclas.
