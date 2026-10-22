---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 11. Un dibujo dentro de una interfaz

**Lo que verás:** un panel blanco a la izquierda con un título, el número de pétalos y dos botones; a la derecha, una
flor que gira despacio. *More* y *Fewer* añaden y quitan pétalos.

![Un panel con los botones Fewer y More junto a una flor rosa con siete pétalos](img/11-drawing-in-an-interface.png)

## El código

El proyecto está en [`samples/11-drawing-in-an-interface`](samples/11-drawing-in-an-interface/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, stroke } from 'zinc:gfx';

const [petals, setPetals] = createSignal<i32>(6);
let time = 0;   // seconds since the start, moved forward every frame

function change(by: i32): void {
  const next = petals() + by;
  if (next < 3 || next > 12) return;
  setPetals(next);
  console.log(`petals: ${petals()}`);
}

function flower(x: i32, y: i32, w: i32, h: i32): void {
  const cx = x + w / 2, cy = y + h / 2;          // the middle of the canvas
  const reach = Math.min(w, h) * 0.22;           // how far the petals are from the middle
  stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);
  for (let i = 0; i < petals(); i++) {
    const angle = time * 0.5 + (i * 2 * Math.PI) / petals();
    const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;
    rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);
  }
  rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);
}

function App(): i32 {
  return <View className="w-full h-full flex-row">
    <View className="w-[200px] p-6 gap-4 bg-white">
      <Text className="text-2xl font-bold text-[#1d1b18]">Flower</Text>
      <Text className="text-base text-[#625d55]">{`${petals()} petals`}</Text>
      <Button className="px-2 h-10 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
        <Text className="text-base text-[#1d1b18]">Fewer</Text>
      </Button>
      <Button className="px-2 h-10 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
        <Text className="text-base text-white">More</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={flower} />
  </View>;
}

render(App, 0xdff3e4, (dt: number) => { time += dt; });
```

Pulsa *More* dos veces y *Fewer* una: la terminal muestra `petals: 7`, `petals: 8`, `petals: 7`.

## Un Canvas: la parte 1 dentro de la parte 2

Algunas cosas son más fáciles de dibujar que de construir con cajas: un gráfico, un tablero de juego, un dibujo, una
onda de sonido. Un `Canvas` es un elemento de la interfaz que dibujas tú mismo, con las funciones de `zinc:gfx` de la
parte 1. El diseño le da su lugar y su tamaño como a cualquier elemento (`grow` aquí: todo el ancho que deja el panel).
Después Zinc llama a su función `onDraw` con ese lugar: `x`, `y` (su esquina superior izquierda, en la ventana) y `w`,
`h` (su ancho y su alto). Tú dibujas dentro de esa caja.

Un Canvas se dibuja de nuevo en cada fotograma, así que un dibujo que se mueve solo tiene que leer el tiempo. (Una
interfaz sin Canvas se dibuja solo cuando cambia algo en ella, lo que ahorra batería; `style={{ lazy: 1 }}` hace que un
Canvas también espere a un cambio.)

## Línea por línea

- `import { rrect, stroke } from 'zinc:gfx';` las funciones de dibujo que usa este programa, como en la parte 1. No
  llamas a `onFrame` ni a `clear`: `zinc:ui` ejecuta los fotogramas y pinta el fondo.
- `const [petals, setPetals] = createSignal<i32>(6);` el número de pétalos, una señal: el texto `6 petals` la sigue.
- `let time = 0;` los segundos desde el inicio, una variable normal: solo la lee el dibujo, y el Canvas se dibuja en
  cada fotograma de todos modos.
- `function change(by: i32): void` añade o quita un pétalo, entre 3 y 12.
- `function flower(x: i32, y: i32, w: i32, h: i32): void` la función de dibujo del Canvas. Zinc le da la caja.
- `const cx = x + w / 2, cy = y + h / 2;` el centro de la caja. Dibuja siempre a partir de `x` y `y`: el Canvas no está
  en la esquina superior izquierda de la ventana, empieza a 200 píxeles del borde izquierdo, después del panel.
- `const reach = Math.min(w, h) * 0.22;` a qué distancia del centro están los pétalos: una parte del lado menor de la
  caja, así la flor cabe cuando la ventana cambia de tamaño.
- `stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);` el tallo: una línea verde gruesa desde el centro hasta el
  fondo de la caja.
- `for (let i = 0; i < petals(); i++)` un pétalo por vuelta del bucle. `petals()` lee la señal: el dibujo usa el número
  nuevo en el siguiente fotograma.
- `const angle = time * 0.5 + (i * 2 * Math.PI) / petals();` dónde está el pétalo en el círculo. Una vuelta completa es
  `2 * Math.PI` (unos 6,28); los pétalos se la reparten a partes iguales, y `time * 0.5` los gira a todos despacio.
- `const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;` el punto con ese ángulo en un círculo de
  radio `reach` alrededor del centro. `cos` da la parte horizontal, `sin` la parte hacia abajo.
- `rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);` un pétalo redondo de 80 píxeles alrededor de ese punto, un poco
  transparente, para que se vean los pétalos que se solapan.
- `rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);` el corazón amarillo, dibujado el último para quedar encima.
- `<View className="w-full h-full flex-row">` la ventana es una fila: el panel y luego el Canvas.
- `<View className="w-[200px] p-6 gap-4 bg-white">` el panel: 200 píxeles de ancho, blanco, con sus hijos en una
  columna.
- `<Canvas className="grow" onDraw={flower} />` el Canvas ocupa el resto de la fila y dibuja con `flower`.
- `render(App, 0xdff3e4, (dt: number) => { time += dt; });` el tercer argumento de `render`, que antes era `null`, es
  una función a la que Zinc llama en cada fotograma con `dt`, el tiempo desde el fotograma anterior, como hace
  `onFrame` en la parte 1. Hace avanzar el reloj del dibujo.

## Prueba esto

- Haz que la flor gire más rápido, o al revés (una velocidad negativa).
- Dale a cada pétalo su propio color, a partir de una lista como en la lección 6.
- Añade una señal para el tamaño de los pétalos, con dos botones más.
- Haz que los pétalos respiren: su tamaño por `1 + 0.1 * Math.sin(time * 3)`.
- Pulsa en el Canvas para mover la flor: dale `onPointerDown={(e: ui.PointerEvent) => ...}` (lección 9) y guarda el
  centro en dos variables. `e.x`, `e.y` están dentro del Canvas, así que suma `x`, `y` al dibujar.
- Dibuja un gráfico de barras en su lugar: un `rect` por cada valor de una lista, tan alto como el valor.

[Más allá de los componentes](../start/beyond.md) va más lejos con un Canvas: un gráfico de barras con `zinc:gfx`, el mismo gráfico como una
curva suave con el canvas de la web, y una escena entera de sprites dentro de una interfaz.

## Siguiente

[12. Una pequeña aplicación completa](12-a-small-app.md): todo junto.
