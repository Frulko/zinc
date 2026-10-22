---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 2. Colores y movimiento

**Lo que verás:** una pelota naranja rueda sobre el césped verde de izquierda a derecha, vuelve a aparecer por la izquierda cuando sale de
la ventana, y el cielo pasa despacio de azul oscuro a violeta y vuelve.

![Una pelota naranja sobre césped verde bajo un cielo azul oscuro](img/02-colours-and-movement.png)

## El código

El proyecto está en [`samples/02-colours-and-movement`](samples/02-colours-and-movement/); su `zinc.json` es el de la
lección 1 con otro nombre. `src/main.ts`:

```ts
import { onFrame, clear, rrect, rect, width, height } from 'zinc:gfx';

function rgb(red: number, green: number, blue: number): u32 {
  return Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue);
}

const SPEED = 160;   // pixels per second
const SIZE = 60;
let x = 0;           // the left edge of the ball
let time = 0;        // seconds since the start
let told = false;

onFrame((dt: number) => {
  time += dt;
  x += SPEED * dt;
  if (x > width()) x = -SIZE;

  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the ball is at x = ${Math.round(x)}.`);
    told = true;
  }

  const glow = (Math.sin(time * 2) + 1) / 2;   // goes from 0 to 1 and back, again and again
  clear(rgb(20, 20, 40 + 60 * glow));
  rect(0, height() - 40, width(), 40, 0x2f8f57);
  rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);
});
```

Después de un segundo, la terminal muestra `After 1.00 seconds the ball is at x = 160.` (en tu máquina los números pueden ser un
poco distintos, como explica la siguiente parte).

## Cómo funciona el movimiento

Una película es una serie de imágenes fijas mostradas muy rápido. Un programa hace lo mismo: en cada fotograma dibuja una imagen donde la
pelota está un poco más lejos. Para mover la pelota cambias un número (`x`) y dibujas la pelota en `x`.

¿Cuánto debe avanzar la pelota en cada fotograma? No un número fijo de píxeles: una pantalla rápida muestra 120 fotogramas por segundo, una máquina
lenta 30, y la pelota rodaría cuatro veces más rápido en una que en otra. En su lugar das una velocidad en píxeles por
**segundo** y la multiplicas por `dt`, el tiempo desde el último fotograma, en segundos. A 60 fotogramas por segundo `dt` es más o menos
0,0167, así que la pelota avanza 160 × 0,0167 ≈ 2,7 píxeles por fotograma; a 30 fotogramas por segundo avanza el doble en cada fotograma, pero
la mitad de veces. En los dos casos recorre 160 píxeles en un segundo.

## Línea por línea

- `function rgb(red: number, green: number, blue: number): u32 { ... }` crea una función propia. Toma tres
  números de 0 a 255 y devuelve el color que forman. `: u32` dice que devuelve un número entero que no puede ser
  negativo: el tipo de los colores en `zinc:gfx`.
- `Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue)` construye el número del color. `0xRRGGBB` es el rojo
  por 65536, más el verde por 256, más el azul: `rgb(255, 0, 0)` es `0xff0000`, rojo puro. `Math.round` convierte
  `127.6` en `128`, porque cada parte debe ser un número entero.
- `const SPEED = 160;` un valor que nunca cambia es un `const`. Escribirlo en mayúsculas es una costumbre que significa «un ajuste».
  El comentario después de `//` es para las personas; Zinc lo ignora.
- `let x = 0;` un valor que cambia es un `let`. `x` es dónde está la pelota; `time` cuenta los segundos desde el inicio;
  `told` recuerda si el programa ya imprimió su línea.
- `time += dt;` suma el tiempo de este fotograma a `time`. `x += SPEED * dt;` mueve la pelota su velocidad por el tiempo.
- `if (x > width()) x = -SIZE;` cuando la pelota ha salido de la ventana por la derecha, la vuelve a poner justo fuera, a la izquierda.
- `if (!told && time >= 1) { ... }` se ejecuta una sola vez: cuando ha pasado un segundo y todavía no se ha imprimido nada (`!told` significa
  «told es falso»). `time.toFixed(2)` escribe el número con dos cifras después del punto.
- `const glow = (Math.sin(time * 2) + 1) / 2;` `Math.sin` va suavemente de -1 a 1 y vuelve, para siempre. Sumar 1 y
  dividir entre 2 hace que vaya de 0 a 1. `time * 2` hace que vaya el doble de rápido. Es la forma más fácil de hacer que
  algo lata, se balancee o respire.
- `clear(rgb(20, 20, 40 + 60 * glow));` el cielo: su azul va de 40 a 100 cuando `glow` va de 0 a 1.
- `rect(0, height() - 40, width(), 40, 0x2f8f57);` el césped: una franja verde de 40 píxeles de alto abajo del todo.
- `rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);` la pelota, apoyada en el
  césped. Su color va de naranja a amarillo con `glow`.

## Prueba esto

- Haz que la pelota vaya el doble de rápido. Luego haz que vaya hacia atrás: una velocidad negativa (y cambia el `if` para que vuelva a entrar
  por la derecha).
- Haz que rebote: guarda una velocidad `vy` para arriba y abajo, suma `vy += 900 * dt` en cada fotograma (gravedad), `y += vy * dt`, y cuando
  la pelota toque el césped, `vy = -vy * 0.8`.
- Haz que la pelota gire alrededor del centro de la ventana: `const bx = width() / 2 + Math.cos(time) * 100` y
  `const by = height() / 2 + Math.sin(time) * 100`.
- Usa `rgb` también para el césped, y haz que cambie de color con la hora del día: un día entero en 20 segundos.
- Dibuja diez pelotas en un bucle: `for (let i = 0; i < 10; i++) { ... }`, cada una un poco más tarde que la anterior.

## Siguiente

[3. El teclado](03-keyboard.md): mueve un cuadrado con las flechas.
