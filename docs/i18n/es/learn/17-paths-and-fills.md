---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 17. Trazados y rellenos

**Lo que verás:** una casa sobre hierba verde bajo un cielo azul: paredes crema con un contorno marrón, un tejado rojo, una puerta
con esquinas redondeadas, una ventana con una cruz, un camino que serpentea por la hierba y un sol amarillo.

![Una casa con tejado rojo, una puerta, una ventana y un camino curvo, bajo un cielo azul con un sol amarillo](img/17-paths-and-fills.png)

La parte 4 dibuja con el **canvas de la web**: el `CanvasRenderingContext2D` que usan las páginas web para dibujar en un
`<canvas>`. Si has seguido un tutorial de canvas en MDN o has dibujado gráficos en JavaScript, ya conoces estas llamadas. En Zinc
no hay página ni elemento `<canvas>`: la ventana es el canvas, y el bucle de fotogramas de la parte 1 llama a tu dibujo. Usa el
módulo `zinc:canvas`.

## El código

El proyecto está en [`samples/17-paths-and-fills`](samples/17-paths-and-fills/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());   // the canvas is the whole window

  // the sky and the grass: rectangles
  ctx.fillStyle = '#bde0fe';
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 300, 640, 100);

  // the sun: a full circle
  ctx.beginPath();
  ctx.arc(540, 80, 44, 0, 2 * Math.PI);
  ctx.fillStyle = 'gold';
  ctx.fill();

  // the walls of the house, filled then outlined
  ctx.fillStyle = '#f4e1c1';
  ctx.fillRect(220, 180, 200, 140);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5c4033';
  ctx.strokeRect(220, 180, 200, 140);

  // the roof: a path of three points, closed
  ctx.beginPath();
  ctx.moveTo(200, 184);
  ctx.lineTo(320, 90);
  ctx.lineTo(440, 184);
  ctx.closePath();
  ctx.fillStyle = '#c0392b';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!told) {
    console.log(`Is 320, 140 in the roof? ${ctx.isPointInPath(320, 140)}. And 120, 140? ${ctx.isPointInPath(120, 140)}.`);
  }

  // the door: a rectangle with round corners
  ctx.beginPath();
  ctx.roundRect(295, 240, 50, 80, 10);
  ctx.fillStyle = '#8e5a3c';
  ctx.fill();

  // a window: two lines make the cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(245, 210, 40, 40);
  ctx.strokeRect(245, 210, 40, 40);
  ctx.beginPath();
  ctx.moveTo(265, 210);
  ctx.lineTo(265, 250);
  ctx.moveTo(245, 230);
  ctx.lineTo(285, 230);
  ctx.lineWidth = 2;
  ctx.stroke();

  // a path in the grass: a curve
  ctx.beginPath();
  ctx.moveTo(320, 320);
  ctx.quadraticCurveTo(300, 360, 360, 400);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d9c5a0';
  ctx.stroke();

  ctx.end();
  told = true;
});
```

El terminal muestra:

```text
Is 320, 140 in the roof? true. And 120, 140? false.
```

## Un lápiz con ajustes

El canvas dibuja como un lápiz que preparas antes de cada línea:

1. **Elige la pintura.** `ctx.fillStyle` es el color que rellena las formas, `ctx.strokeStyle` el color de los contornos,
   `ctx.lineWidth` lo gruesos que son los contornos. Los colores se escriben como en la web: `'#c0392b'`, `'gold'`,
   `'rgb(255, 120, 60)'`, `'rgba(0, 0, 0, 0.5)'` (medio transparente).
2. **Construye un trazado.** `ctx.beginPath()` empieza uno nuevo. `moveTo(x, y)` levanta el lápiz y lo apoya en un punto;
   `lineTo(x, y)` dibuja una línea recta hasta otro; `arc(x, y, radius, start, end)` un trozo de círculo; `quadraticCurveTo` y
   `bezierCurveTo` curvas; `rect` y `roundRect` rectángulos enteros; `closePath()` vuelve al primer punto. Todavía no se ve nada:
   un trazado es solo un plan.
3. **Píntalo.** `ctx.fill()` rellena el interior del trazado con `fillStyle`; `ctx.stroke()` dibuja su contorno con
   `strokeStyle` y `lineWidth`. Puedes hacer las dos cosas sobre el mismo trazado.

Los rectángulos son tan comunes que tienen formas cortas que no necesitan trazado: `fillRect(x, y, w, h)` y
`strokeRect(x, y, w, h)`.

Los ajustes se quedan hasta que los cambias: después de `ctx.lineWidth = 4`, todos los contornos miden 4 píxeles de grosor, en
este fotograma y en los siguientes (en la web también). Por eso este programa fija el grosor de línea antes de cada contorno que
necesita otro.

`ctx.begin(0, 0, width(), height())` y `ctx.end()` son propios de Zinc: dicen "el canvas es toda la ventana, durante este
fotograma". Todo lo que dibujas va entre los dos.

## Línea por línea

- `import { onFrame, width, height } from 'zinc:gfx';` el bucle de fotogramas y el tamaño de la ventana, de la parte 1.
  `zinc:canvas` solo dibuja.
- `const ctx = new CanvasRenderingContext2D();` el contexto: el lápiz y sus ajustes. En la web escribirías
  `canvas.getContext('2d')`; aquí lo creas tú, una vez.
- `ctx.fillStyle = '#bde0fe'; ctx.fillRect(0, 0, 640, 400);` pinta toda la ventana de azul claro: cada fotograma empieza por el
  cielo, como hacía `clear` en la parte 1.
- `ctx.arc(540, 80, 44, 0, 2 * Math.PI);` un círculo alrededor de (540, 80) con radio 44: un arco desde el ángulo 0 hasta una
  vuelta completa, `2 * Math.PI`. `fill()` lo convierte en un disco.
- `ctx.strokeRect(220, 180, 200, 140);` el contorno de las paredes, dibujado sobre el rectángulo relleno. Un contorno se centra
  en el borde: la mitad de sus 4 píxeles cae dentro, la otra mitad fuera.
- `ctx.moveTo(200, 184); ctx.lineTo(320, 90); ctx.lineTo(440, 184); ctx.closePath();` el tejado: un triángulo, desde la esquina
  izquierda hasta la cima, hasta la esquina derecha, y de vuelta.
- `ctx.lineJoin = 'round';` las esquinas de un contorno: `'miter'` (en punta, el valor por defecto), `'round'` (redondeadas) o
  `'bevel'` (cortadas).
- `ctx.isPointInPath(320, 140)` pregunta si un punto está dentro del trazado actual, aquí el tejado. Así sabe un programa de canvas
  que un clic cayó sobre una forma (la [página de estilos](../start/styles.md#canvas-zinccanvas) lo usa con una pelota).
- `ctx.roundRect(295, 240, 50, 80, 10);` un rectángulo con esquinas de radio 10, añadido a un trazado nuevo.
- `ctx.moveTo(265, 210); ctx.lineTo(265, 250); ctx.moveTo(245, 230); ctx.lineTo(285, 230);` un trazado con dos líneas separadas:
  `moveTo` levanta el lápiz entre ellas. Un solo `stroke()` dibuja las dos.
- `ctx.quadraticCurveTo(300, 360, 360, 400);` una curva desde el punto actual (320, 320) hasta (360, 400), atraída hacia
  (300, 360) por el camino, como la atraería un imán.
- `ctx.lineCap = 'round';` los extremos de una línea abierta: `'butt'` (cortado en plano al final, el valor por defecto),
  `'round'` o `'square'`.
- `told = true;` la línea se imprime solo en el primer fotograma.

## Prueba esto

- Pinta el sol con un contorno naranja grueso: `ctx.lineWidth = 6; ctx.strokeStyle = 'orange'; ctx.stroke();` después de su
  `fill()`.
- Dibuja una segunda ventana a la derecha de la puerta.
- Añade una chimenea al tejado: un `fillRect` dibujado antes del tejado, para que el tejado cubra su parte de abajo.
- Dibuja una valla a lo largo de la hierba con un bucle: `for (let x = 10; x < 640; x += 30) ctx.fillRect(x, 280, 8, 40);`.
- Sustituye la curva cuadrática por `ctx.bezierCurveTo(260, 350, 420, 370, 360, 400)`: dos imanes, un camino en forma de S.
- Todas las funciones del contexto, y las pocas diferencias con la web, están en [la página de zinc:canvas](../plugins/canvas2d.md).

## Siguiente

[18. Transformaciones](18-transforms.md): mueve, gira y encoge el papel bajo el lápiz, y dibuja un reloj.
