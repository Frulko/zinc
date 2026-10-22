---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 1. Una ventana y una forma

**Lo que verás:** una ventana con fondo claro, un rectángulo morado en la esquina superior izquierda y un círculo rosa en
el centro.

![Un rectángulo morado y un círculo rosa sobre un fondo claro](img/01-window-and-shape.png)

## El código

Un programa de Zinc es una carpeta con dos archivos. El proyecto está en
[`samples/01-window-and-shape`](samples/01-window-and-shape/).

`zinc.json` describe el proyecto:

```json
{
  "name": "window-and-shape",
  "entry": "src/main.ts",
  "app": { "id": "com.example.learn.shape", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts` es el programa:

```ts
import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';

console.log(`The window is ${width()} by ${height()} pixels.`);

onFrame((dt: number) => {
  clear(0xf3f1ec);
  rect(40, 40, 160, 100, 0x5746e0);
  rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);
});
```

Ejecútalo:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Se abre la ventana y la terminal muestra `The window is 640 by 400 pixels.`

## Línea por línea

**`zinc.json`**

- `"name"`: el nombre del programa. El título de la ventana lo usa.
- `"entry"`: el archivo donde empieza el programa.
- `"app"`: datos de la app. `"id"` es un nombre que ninguna otra app usa, escrito al revés como una dirección web (`com.example...`).
  `"window"` da el tamaño de la ventana en píxeles: 640 de ancho, 400 de alto.

**`src/main.ts`**

- `import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';`
  Zinc incluye módulos: conjuntos de funciones ya hechas. `zinc:gfx` es el que dibuja. Esta línea toma seis de sus
  funciones para que el programa pueda usarlas. Solo importas lo que usas.
- `console.log(...)` imprime una línea en la terminal. Entre las comillas invertidas, `${width()}` se sustituye por el valor de
  `width()`: el ancho de la ventana, 640. Imprimir es la forma más fácil de ver qué está haciendo tu programa.
- `onFrame((dt: number) => { ... });`
  Este es el corazón del programa. Le das a `onFrame` una función (la parte que va de `(dt: number) =>` hasta la `}` final).
  Zinc la llama en cada fotograma, unas 60 veces por segundo, tan a menudo como se refresca la pantalla. Cada llamada dibuja
  la imagen entera otra vez. Aquí la imagen nunca cambia, así que ves una imagen fija; la próxima lección la mueve.
  `dt` es el tiempo desde el último fotograma. `: number` dice que `dt` es un número: Zinc comprueba los tipos de tus valores
  antes de ejecutar el programa.
- `clear(0xf3f1ec);` pinta toda la ventana de un solo color. Los colores son números escritos `0xRRGGBB`: dos dígitos para el rojo,
  dos para el verde, dos para el azul, desde `00` (nada) hasta `ff` (todo). `0xf3f1ec` es un gris claro cálido. Es el mismo código que
  `#f3f1ec` en la web, con `0x` delante en lugar de `#`.
- `rect(40, 40, 160, 100, 0x5746e0);` dibuja un rectángulo relleno. Los números son, en orden: x, y, ancho, alto, color.
  x cuenta los píxeles desde el borde izquierdo de la ventana, y cuenta los píxeles hacia abajo desde el borde superior. Así, la esquina
  superior izquierda de este rectángulo está a 40 píxeles de la izquierda y a 40 de arriba, y mide 160 de ancho y 100 de alto.
- `rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);` dibuja un rectángulo con las esquinas redondeadas.
  Después de x, y, ancho y alto vienen el radio de las esquinas (60) y el color, y luego la opacidad: 255 es sólido,
  0 es invisible, 128 es medio transparente. Un cuadrado de 120 con esquinas de 60 (la mitad de su tamaño) es un círculo.
  `width() / 2` es el centro de la ventana; restar 60 (la mitad del círculo) pone el centro del círculo justo ahí.

El orden de las llamadas de dibujo importa: lo que se dibuja después tapa lo que se dibujó antes. Por eso `clear` va primero.

## Prueba esto

- Cambia el color del fondo a `0x1c1b20` (casi negro).
- Mueve el rectángulo a la esquina inferior derecha. Pista: `width() - 200` está a 200 píxeles del borde derecho.
- Haz el círculo más grande (recuerda: el radio es la mitad del tamaño). Luego dale un ancho de 200 y deja lo demás: se
  convierte en una píldora.
- Dale al círculo una opacidad de 128 y muévelo sobre el rectángulo para ver a través de él.
- Añade `line(0, 0, width(), height(), 0x1d1b18);` (añade `line` a la línea de import): una línea fina que cruza la ventana.
- Cambia el tamaño de la ventana en `zinc.json`. El círculo se queda en el centro porque el código usa `width()` y `height()`.

## Siguiente

[2. Colores y movimiento](02-colours-and-movement.md): haz que las cosas se muevan, con suavidad y a la misma velocidad en cualquier máquina.
