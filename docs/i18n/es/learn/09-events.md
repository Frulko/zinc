---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 9. Eventos

**Lo que verás:** una caja blanca con un punto rosa. Pulsa dentro de la caja y el punto salta ahí; arrastra y te sigue;
las flechas del teclado lo mueven; el borde de la caja se vuelve morado mientras el puntero está encima. Una frase dice
qué ha pasado y un botón *Reset* devuelve el punto al centro.

![Una caja blanca con borde morado, un punto rosa, una frase y un botón Reset](img/09-events.png)

## El código

El proyecto está en [`samples/09-events`](samples/09-events/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

const [dotX, setDotX] = createSignal<number>(150);
const [dotY, setDotY] = createSignal<number>(100);
const [pressed, setPressed] = createSignal<boolean>(false);
const [over, setOver] = createSignal<boolean>(false);
const [news, setNews] = createSignal<string>('Press in the box, drag, or use the arrow keys.');

function moveTo(x: number, y: number): void {
  setDotX(Math.max(0, Math.min(300, x)));
  setDotY(Math.max(0, Math.min(200, y)));
}

function down(e: ui.PointerEvent): void {
  setPressed(true);
  moveTo(e.x, e.y);
  setNews(`Pressed at ${Math.round(e.x)}, ${Math.round(e.y)} inside the box.`);
  console.log(news());
}

function drag(e: ui.PointerEvent): void {
  if (pressed()) moveTo(e.x, e.y);
}

function up(e: ui.PointerEvent): void {
  setPressed(false);
  setNews(`Let go at ${Math.round(e.x)}, ${Math.round(e.y)}.`);
  console.log(news());
}

ui.onKey((e: ui.KeyEvent) => {
  if (e.key === 'ArrowLeft') moveTo(dotX() - 10, dotY());
  else if (e.key === 'ArrowRight') moveTo(dotX() + 10, dotY());
  else if (e.key === 'ArrowUp') moveTo(dotX(), dotY() - 10);
  else if (e.key === 'ArrowDown') moveTo(dotX(), dotY() + 10);
  else return;
  e.preventDefault();   // this key is used: it does not also move the keyboard focus
  setNews(`Key ${e.key}: the dot is at ${dotX()}, ${dotY()}.`);
  console.log(news());
});

function reset(): void {
  moveTo(150, 100);
  setNews('Back to the middle.');
  console.log(news());
}

function App(): i32 {
  return <View className="w-full h-full items-center justify-center gap-4">
    <View className={`w-[300px] h-[200px] rounded-xl bg-white border-2 ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}
      onPointerDown={down} onPointerMove={drag} onPointerUp={up}
      onPointerEnter={(e: ui.PointerEvent) => setOver(true)} onPointerLeave={(e: ui.PointerEvent) => setOver(false)}>
      <View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />
    </View>
    <Text className="text-base text-[#625d55]">{news()}</Text>
    <Button className="h-10 px-5 rounded-full bg-[#5746e0]" onClick={reset}>
      <Text className="text-base text-white">Reset</Text>
    </Button>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Pulsa en la caja cerca de su esquina superior izquierda, arrastra, suelta y pulsa la flecha izquierda: la terminal
muestra `Pressed at 30, 28 inside the box.`, `Let go at 230, 148.`, `Key ArrowLeft: the dot is at 220, 148.`

## Qué es un evento

Un **evento** es algo que ocurre: una pulsación, un movimiento, una tecla. Le das a un elemento una función para un
evento, en un atributo cuyo nombre empieza por `on`; Zinc llama a la función cuando el evento ocurre en ese elemento.

| Atributo | Cuándo se ejecuta | Lo que recibe la función |
|---|---|---|
| `onClick` | el elemento se pulsó y se soltó (ratón, dedo, o Enter y Espacio cuando tiene el foco del teclado) | nada |
| `onPointerDown` | un botón o un dedo baja sobre el elemento | un `PointerEvent` |
| `onPointerMove` | el puntero se mueve sobre él; después de pulsar en él, en cualquier sitio hasta que se suelta | un `PointerEvent` |
| `onPointerUp` | el botón o el dedo sube, después de una pulsación en el elemento | un `PointerEvent` |
| `onPointerEnter`, `onPointerLeave` | el puntero llega al elemento o sale de él | un `PointerEvent` |
| `onKeyDown` | una tecla baja mientras el elemento (o uno de su interior) tiene el foco del teclado | un `KeyEvent` |

Un `PointerEvent` dice dónde: `e.x` y `e.y` se miden **desde la esquina superior izquierda del elemento**, no de la
ventana (`e.gx`, `e.gy` son desde la esquina de la ventana). También dice qué botón (`e.button`: 0 izquierdo, 1 central,
2 derecho) y qué teclas se mantenían pulsadas (`e.shift`, `e.ctrl`, `e.alt`, `e.meta`). Todos los eventos y lo que
ofrecen están en [la referencia de eventos de zinc:ui](../reference/ui-events.md); también hay toques, pulsaciones
largas, arrastres y pellizcos.

## Línea por línea

- `import * as ui from 'zinc:ui';` toma todo el módulo `zinc:ui` con el nombre `ui`: de él vienen los tipos
  `ui.PointerEvent` y `ui.KeyEvent` y la función `ui.onKey`.
- Cinco señales: `dotX` y `dotY` (dónde está el punto, dentro de la caja), `pressed` (¿hay un botón pulsado?), `over`
  (¿está el puntero sobre la caja?) y `news`, la frase bajo la caja. `createSignal<number>(150)` guarda cualquier número,
  `<boolean>` verdadero o falso, `<string>` texto.
- `function moveTo(x: number, y: number): void` pone el punto en (x, y), sin salir de la caja de 300 por 200.
- `function down(e: ui.PointerEvent): void` se ejecuta al pulsar: recuerda que hay un botón pulsado, mueve el punto
  adonde está el puntero (`e.x`, `e.y`, dentro de la caja), escribe la frase y la imprime.
- `function drag(e: ui.PointerEvent): void` se ejecuta en cada movimiento sobre la caja, y tras pulsar en la caja, en
  cada movimiento en cualquier sitio: la caja **captura** el puntero hasta que se suelta, así que un arrastre que sale
  de la caja no se pierde. Mueve el punto solo mientras `pressed()` es verdadero.
- `function up(e: ui.PointerEvent): void` se ejecuta al soltar.
- `ui.onKey((e: ui.KeyEvent) => { ... });` un manejador de teclas para toda la ventana: recibe las teclas que nadie más
  ha usado. `e.key` es el nombre de la tecla, como en la lección 3 (`'ArrowLeft'`, `'a'`, `'Enter'`).
- `else return;` cualquier otra tecla: no hace nada y deja la tecla a Zinc.
- `e.preventDefault();` dice "esta tecla se ha usado". Sin ello, las flechas también moverían el foco del teclado de
  botón en botón, como en cualquier aplicación.
- `function reset(): void` devuelve el punto a su sitio y lo dice.
- `className={`... ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}` el borde de la caja: morado mientras `over()`
  es verdadero, gris claro en caso contrario. La clase lee una señal, así que cambia con ella.
- `onPointerDown={down} onPointerMove={drag} onPointerUp={up}` da a la caja sus tres funciones. Una función se puede dar
  por su nombre (`down`) o escribirse allí mismo (`(e: ui.PointerEvent) => setOver(true)`).
- `<View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />` el
  punto. `absolute` lo saca del diseño: `left` y `top` lo colocan desde la esquina superior izquierda de su padre, la
  caja. Restar 12 (la mitad de su tamaño) lo centra en el punto.
- `<Button ... onClick={reset}>` el botón ejecuta `reset` al pulsarlo.

## Prueba esto

- Haz que un doble clic devuelva el punto al centro: `onDoubleClick={(e: ui.PointerEvent) => reset()}` en la caja.
- Haz que un clic derecho cambie el color del punto: en `down`, comprueba `e.button === 2`.
- Mantén Shift para moverte de 50 en 50 con las flechas: `const step = e.shift ? 50 : 10;`.
- Dibuja una estela: guarda las últimas posiciones en una señal que contenga una lista y muestra un `View` pequeño por
  posición.
- Usa `onKeyDown` en lugar de `ui.onKey`: pon `focusable onKeyDown={...}` en la caja. Ahora las teclas funcionan solo
  después de hacer clic en la caja (tiene el foco), que es lo que quieres cuando una ventana tiene varias cajas así.
- Sustituye los tres manejadores de puntero por uno solo, `onDrag={(e: ui.PointerEvent) => moveTo(e.x, e.y)}`: un
  arrastre empieza cuando el puntero se ha movido 8 píxeles, y `e.phase` dice si empieza (0), se mueve (1) o termina (2).

## Siguiente

[10. Estilos](10-styles.md): colores, tamaños, bordes y sombras con `className`.
