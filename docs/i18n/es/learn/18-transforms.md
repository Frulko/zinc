---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 18. Transformaciones

**Lo que verás:** dos relojes de estación que marcan las diez y diez, uno grande a la derecha y una copia pequeña arriba a la
izquierda, cada uno con sesenta marcas, una aguja de las horas, una de los minutos y un segundero rojo.

![Un reloj grande y un reloj pequeño, los dos a las diez y diez](img/18-transforms.png)

## El código

El proyecto está en [`samples/18-transforms`](samples/18-transforms/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const HOURS = 10, MINUTES = 10;
let told = false;

// One hand, drawn straight up from the centre, after turning by `turn` (0 to 1: a whole turn).
function hand(turn: number, length: number, thickness: number, color: string): void {
  ctx.save();                                   // remember the transform...
  ctx.rotate(turn * 2 * Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(0, -length);
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();                                // ...and go back to it
}

// A clock of radius 150 around (0, 0): wherever the transform puts (0, 0).
function clock(): void {
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d1b18';
  ctx.stroke();

  for (let i = 0; i < 60; i++) {                // 60 ticks: draw one at the top, turn by a sixtieth, again
    ctx.beginPath();
    ctx.moveTo(0, -136);
    ctx.lineTo(0, i % 5 === 0 ? -112 : -126);
    ctx.lineWidth = i % 5 === 0 ? 6 : 2;
    ctx.stroke();
    ctx.rotate((2 * Math.PI) / 60);
  }                                             // 60 sixtieths: a whole turn, back where it started

  hand((HOURS + MINUTES / 60) / 12, 70, 10, '#1d1b18');
  hand(MINUTES / 60, 110, 6, '#1d1b18');
  hand(0.25, 120, 2, '#e63946');
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#e63946';
  ctx.fill();
}

// Where the transform puts (0, 0), and how much it scales: e and f, and a (a is the scale when nothing is turned).
function tell(where: string): void {
  const m = ctx.getTransform();
  console.log(`${where}, (0, 0) is at ${m.e}, ${m.f} and the scale is ${m.a.toFixed(2)}.`);
}

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#f3f1ec';
  ctx.fillRect(0, 0, 640, 400);

  ctx.save();
  ctx.translate(410, 200);                      // (0, 0) is now the middle of the big clock
  clock();
  if (!told) tell('In the big clock');
  ctx.restore();

  ctx.save();
  ctx.translate(110, 110);                      // the small clock: move, then make everything smaller
  ctx.scale(0.45, 0.45);
  clock();
  if (!told) tell('In the small clock');
  ctx.restore();

  if (!told) tell('After restore');
  ctx.end();
  told = true;
});
```

El terminal muestra:

```text
In the big clock, (0, 0) is at 410, 200 and the scale is 1.00.
In the small clock, (0, 0) is at 110, 110 and the scale is 0.45.
After restore, (0, 0) is at 0, 0 and the scale is 1.00.
```

## Mover el papel

Dibujar sesenta marcas alrededor de un círculo con `Math.cos` y `Math.sin` funciona, pero es mucha aritmética. Un canvas tiene una
manera más sencilla: en vez de mover el lápiz, **mueve el papel**. Una transformación cambia dónde cae todo lo que se dibuja
después:

- `ctx.translate(x, y)` mueve el papel: `(0, 0)` está ahora donde antes estaba `(x, y)`.
- `ctx.rotate(angle)` gira el papel alrededor de `(0, 0)`, con un ángulo en radianes (una vuelta completa es `2 * Math.PI`), en el
  sentido de las agujas del reloj.
- `ctx.scale(sx, sy)` hace todo más grande o más pequeño: `0.45` es un poco menos de la mitad. El grosor de las líneas también
  se reduce.

Se suman: `translate(110, 110)` y luego `scale(0.45, 0.45)` pone `(0, 0)` en (110, 110) y dibuja al 45 %. Así el reloj se escribe una
sola vez, alrededor de `(0, 0)`, como si estuviera solo en la página; dónde cae y cuán grande es se decide antes de llamarlo.

Las marcas usan esto: dibuja una marca recta hacia arriba, gira el papel una sexagésima parte de vuelta, dibuja la misma marca de
nuevo, sesenta veces. Tras sesenta giros de una sexagésima, el papel vuelve a donde empezó.

`ctx.save()` recuerda la transformación (y los colores y los ajustes de línea); `ctx.restore()` vuelve a lo guardado. Cada aguja
gira el papel con su propio ángulo, entre un `save` y un `restore`, así que la siguiente aguja parte del papel derecho. Los
`save` pueden ir dentro de otros `save`, como la aguja dentro del reloj: cada `restore` deshace el último `save`.

`ctx.getTransform()` da la transformación como seis números, de `a` a `f`: `e` y `f` son el lugar donde cae `(0, 0)`, `a` y `d` la
escala cuando nada está girado. El programa los imprime para mostrar los tres estados.

## Línea por línea

- `const HOURS = 10, MINUTES = 10;` la hora que marcan los relojes.
- `function hand(turn, length, thickness, color)` dibuja una aguja. `turn` va de 0 (recta hacia arriba, las doce) a 1 (una vuelta
  entera).
- `ctx.rotate(turn * 2 * Math.PI);` gira el papel esa parte de una vuelta completa.
- `ctx.moveTo(0, 16); ctx.lineTo(0, -length);` una línea desde un poco por debajo del centro hasta `length` píxeles por encima.
  En el papel siempre va recta hacia arriba; el giro la hace apuntar a la hora.
- `function clock()` dibuja un reloj entero alrededor de `(0, 0)`: la esfera, las marcas, las agujas y el centro rojo.
- `ctx.lineTo(0, i % 5 === 0 ? -112 : -126);` una de cada cinco marcas (`i % 5 === 0`: `i` dividido entre 5 no deja resto) es más
  larga y más gruesa: las horas.
- `hand((HOURS + MINUTES / 60) / 12, ...)` la aguja de las horas: 10 horas y 10 minutos son 10,17 horas, sobre 12 para una vuelta.
- `hand(MINUTES / 60, ...)` la aguja de los minutos: 10 minutos de 60. `hand(0.25, ...)` el segundero a un cuarto: 15 segundos.
- `ctx.save(); ctx.translate(410, 200); clock(); ... ctx.restore();` el reloj grande, con su centro en (410, 200).
- `ctx.translate(110, 110); ctx.scale(0.45, 0.45);` el reloj pequeño: el mismo `clock()`, movido y reducido. El orden importa: el
  `translate` va en píxeles de la ventana; el `scale` reduce después lo que viene tras él.
- `if (!told) tell('After restore');` tras el último `restore` el papel vuelve a ser normal: `(0, 0)` es la esquina de la ventana.

## Prueba esto

- Añade un tercer reloj, boca abajo: `ctx.rotate(Math.PI)` después de su `translate`.
- Muestra la hora real: `const now = new Date();` y luego `now.getHours()`, `now.getMinutes()`, `now.getSeconds()`, y mueve el
  segundero con `now.getSeconds() / 60`.
- Haz el reloj grande más ancho que alto: `ctx.scale(1.3, 1)` después de su `translate`. Mira qué pasa con las marcas.
- Olvida un `ctx.restore()` en `hand` y observa: cada aguja gira desde donde terminó la anterior.
- Escribe números en la esfera: en el bucle, cada cinco marcas, `ctx.fillText(...)` (la lección 20 muestra cómo fijar la fuente y
  centrar el texto).

## Siguiente

[19. Una animación](19-animation.md): un molino cuyas aspas giran y nubes que pasan, fotograma tras fotograma.
