---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 4. El ratón y el tacto

**Lo que verás:** una hoja para dibujar. Pulsa y mueve el ratón (o un dedo en una pantalla táctil) para dibujar una línea. La
rueda hace el pincel más grueso o más fino, el botón derecho borra la hoja, y cada dedo en una pantalla táctil muestra un
anillo rosa.

![Dos líneas moradas, una fina y una gruesa, y dos anillos rosas](img/04-mouse-and-touch.png)

## El código

El proyecto está en [`samples/04-mouse-and-touch`](samples/04-mouse-and-touch/). `src/main.ts`:

```ts
import { onFrame, clear, stroke, rrect, font, drawText, pointerX, pointerY, pointerDown, pointerButtons, wheel, touchCount, touchX, touchY } from 'zinc:gfx';

const lines: number[][] = [];   // every line drawn so far, as points: [x0, y0, x1, y1, ...]
const sizes: number[] = [];     // the brush size of each line
let brush = 6;
let wasDown = false;
const label = font('sans', 18);

onFrame((dt: number) => {
  const x = pointerX(), y = pointerY(), down = pointerDown();

  if (down && !wasDown) {                       // just pressed: start a new line
    lines.push([x, y]);
    sizes.push(brush);
    console.log(`pressed at ${Math.round(x)}, ${Math.round(y)}`);
  } else if (down) {                            // still pressed: add a point, if the pointer moved
    const line = lines[lines.length - 1];
    if (x !== line[line.length - 2] || y !== line[line.length - 1]) {
      line.push(x);
      line.push(y);
    }
  } else if (wasDown) {                         // just released
    console.log(`released at ${Math.round(x)}, ${Math.round(y)}: ${lines.length} line(s)`);
  }
  wasDown = down;

  if ((pointerButtons() & 2) !== 0) {           // the right button wipes the page
    lines.splice(0, lines.length);
    sizes.splice(0, sizes.length);
  }
  if (wheel() !== 0) {                          // the wheel changes the brush
    brush = Math.max(2, Math.min(40, brush + wheel() * 2));
    console.log(`brush ${brush}`);
  }

  clear(0xfffefc);
  for (let i = 0; i < lines.length; i++) stroke(lines[i], sizes[i], 0x5746e0, 255, false);
  for (let i = 0; i < touchCount(); i++) {      // one ring under each finger on a touch screen
    rrect(touchX(i) - 30, touchY(i) - 30, 60, 60, 30, 0xf27aa6, 110);
  }
  rrect(x - brush / 2, y - brush / 2, brush, brush, brush / 2, 0x1d1b18, 90);
  drawText(label, 16, 12, `brush ${brush}   lines ${lines.length}   fingers ${touchCount()}`, 0x625d55, 255, 0);
});
```

Dibuja: la terminal muestra dónde pulsaste y dónde soltaste, por ejemplo `pressed at 80, 120`, y luego
`released at 340, 180: 1 line(s)`.

## El puntero

`zinc:gfx` llama **puntero** al ratón. En una pantalla táctil el primer dedo también es el puntero, así que el mismo código funciona
con un ratón, un trackpad, un lápiz o un dedo:

| Función | Devuelve |
|---|---|
| `pointerX()`, `pointerY()` | dónde está el puntero, en píxeles desde la esquina superior izquierda de la ventana |
| `pointerDown()` | `true` mientras el botón principal (o un dedo) está pulsado |
| `pointerButtons()` | todos los botones pulsados: 1 izquierdo, 2 derecho, 4 central, sumados |
| `wheel()` | cuántos pasos giró la rueda en este fotograma: más de 0 hacia arriba, menos de 0 hacia abajo |
| `touchCount()` | cuántos dedos tocan la pantalla; `touchX(i)`, `touchY(i)` dónde está el dedo `i` |

No hay una función «clic»: un clic es el momento en que `pointerDown()` pasa a ser `true`. El programa lo encuentra recordando
el valor del fotograma anterior, en `wasDown`.

## Línea por línea

- `const lines: number[][] = [];` todas las líneas dibujadas hasta ahora. Una línea es una lista de números, `[x0, y0, x1, y1, ...]`
  (`number[]`), así que todas las líneas son una lista de listas (`number[][]`). Empieza vacía: `[]`.
- `const sizes: number[] = [];` el tamaño del pincel de cada línea, en el mismo orden.
- `const x = pointerX(), y = pointerY(), down = pointerDown();` lee el puntero una vez al principio del fotograma.
- `if (down && !wasDown)` pulsado ahora y no antes: el botón acaba de pulsarse. `lines.push([x, y])` añade una línea nueva
  que empieza aquí; `push` añade al final de una lista.
- `else if (down)` sigue pulsado: el puntero está arrastrando. `lines[lines.length - 1]` es la última línea, la que se está dibujando.
  Su último punto es `line[line.length - 2]`, `line[line.length - 1]`; el punto nuevo solo se añade si el puntero se movió.
- `else if (wasDown)` suelto ahora, pulsado antes: el botón acaba de soltarse.
- `wasDown = down;` recuerda el valor de este fotograma para el siguiente.
- `if ((pointerButtons() & 2) !== 0)` ¿está pulsado el botón derecho? `&` se queda con la parte del número que vale 2: no es
  0 cuando el botón derecho está entre los botones pulsados. `splice(0, lines.length)` vacía una lista.
- `brush + wheel() * 2` cada paso de la rueda cambia el pincel en 2 píxeles, entre 2 y 40.
- `stroke(lines[i], sizes[i], 0x5746e0, 255, false);` dibuja una línea que pasa por todos los puntos de una lista, con extremos redondos.
  Los argumentos: los puntos, el grosor, el color, la opacidad, y `false` para una línea abierta (`true` uniría el
  último punto con el primero).
- `for (let i = 0; i < touchCount(); i++)` un anillo por dedo, transparente (opacidad 110 de 255).
- El último `rrect` es un puntito oscuro que sigue al puntero, tan grande como el pincel.
- `drawText(...)` muestra el tamaño del pincel, el número de líneas y el número de dedos.

## Prueba esto

- Dale a cada línea su propio color: guarda una lista de colores como `sizes`, y elige un color nuevo en cada pulsación.
- Haz que el botón central (4) deshaga la última línea: `lines.pop()` y `sizes.pop()`.
- Dibuja con todos los dedos a la vez: una línea por dedo, usando `touchId(i)` para saber qué dedo es cuál de un fotograma al
  siguiente.
- Añade formas `closed`: dibuja la línea con `true` como último argumento y mira cómo se cierra.
- Dibuja un punto suave en cada punto en lugar de una línea: `rrect` con poca opacidad, para un aerosol.
- Trazos rápidos con un lápiz: `penCount()`, `penX(i)`, `penY(i)` y `penPressure(i)` dan cada muestra del lápiz desde
  el último fotograma, con su presión de 0 a 1 (la [referencia](../reference/gfx.md#input) las enumera).

## Siguiente

[5. Texto e imágenes](05-text-and-images.md): escribe palabras y muestra imágenes.
