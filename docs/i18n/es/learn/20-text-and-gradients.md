---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 20. Texto y degradados

**Lo que verás:** un cartel para una feria de verano. El cielo pasa de rosa arriba a amarillo pálido abajo, un sol amarillo suave
brilla en el centro, *Summer Fair* está escrito grande y centrado, la fecha está en una píldora blanca justo debajo, y dos líneas
pequeñas ocupan las esquinas de abajo.

![Un cartel: "Summer Fair" sobre un cielo de rosa a amarillo con un sol brillante, la fecha en una píldora blanca](img/20-text-and-gradients.png)

## El código

El proyecto está en [`samples/20-text-and-gradients`](samples/20-text-and-gradients/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TITLE = 'Summer Fair';
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());

  // the sky: a linear gradient from the top of the window to the bottom
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#ff9a8b');
  sky.addColorStop(0.6, '#ffc3a0');
  sky.addColorStop(1, '#ffe8c2');
  ctx.fillGradient = sky;                    // on the web: ctx.fillStyle = sky
  ctx.fillRect(0, 0, 640, 400);

  // the sun: a radial gradient, yellow in the middle, fading out at the edge
  const glow = ctx.createRadialGradient(320, 250, 30, 320, 250, 150);
  glow.addColorStop(0, 'rgba(255, 236, 140, 1)');
  glow.addColorStop(1, 'rgba(255, 236, 140, 0)');
  ctx.fillGradient = glow;
  ctx.beginPath();
  ctx.arc(320, 250, 150, 0, 2 * Math.PI);
  ctx.fill();

  // the title, centred: textAlign says which point of the text x is
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(TITLE, 320, 130);

  // a label in a pill: measureText says how wide the text is, the pill is drawn around it
  ctx.font = '20px sans-serif';
  const words = 'Saturday, 10 am to 6 pm';
  const w = ctx.measureText(words).width;
  ctx.beginPath();
  ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(words, 320, 180);

  // two corners: x is where the text starts (left) or where it ends (right)
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#7b2cbf';
  ctx.textAlign = 'left';
  ctx.fillText('Town square', 24, 370);
  ctx.textAlign = 'right';
  ctx.fillText('Free entry', 616, 370);

  if (!told) {
    ctx.font = 'bold 56px sans-serif';
    console.log(`The title is ${Math.round(ctx.measureText(TITLE).width)} pixels wide, the label ${Math.round(w)}.`);
    told = true;
  }
  ctx.end();
});
```

El terminal muestra (los números dependen un poco de la fuente):

```text
The title is 347 pixels wide, the label 229.
```

## Degradados

Un **degradado** es una pintura que cambia de color por el camino. Creas uno, le das colores en puntos a lo largo de su longitud, y
luego pintas con él:

- `ctx.createLinearGradient(x0, y0, x1, y1)` cambia a lo largo de una línea, de (x0, y0) a (x1, y1). De (0, 0) a (0, 400) es de
  arriba abajo.
- `ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)` cambia de un círculo a otro: aquí del círculo pequeño de radio 30 al grande de
  radio 150, los dos alrededor del centro del sol.
- `addColorStop(offset, colour)` pone un color en un lugar del degradado: `0` es el principio, `1` el final, `0.6` un poco más
  allá de la mitad. Entre dos paradas los colores se mezclan. Un color puede ser transparente: `rgba(255, 236, 140, 0)` es el mismo
  amarillo con una opacidad de 0, así que el sol se funde con el cielo.

En la web escribirías `ctx.fillStyle = sky`. Zinc escribe `ctx.fillGradient = sky`, porque en Zinc un campo tiene un solo tipo y
`fillStyle` es un texto. Volver a poner `fillStyle` con un color (`ctx.fillStyle = 'white'`) detiene el degradado, como en la web.

## Texto

`ctx.fillText(text, x, y)` escribe texto con el color de `fillStyle`. Tres ajustes dicen cómo:

- `ctx.font` se escribe como en CSS: `'bold 56px sans-serif'` (negrita, 56 píxeles de alto, la fuente sans-serif que viene con
  Zinc), o `'20px monospace'`.
- `ctx.textAlign` dice qué punto del texto es `x`: `'left'` (o `'start'`, el valor por defecto) su comienzo, `'center'` su
  centro, `'right'` su final. Así, `textAlign = 'center'` y `x = 320` centran un texto en una ventana de 640 píxeles, sea cual sea
  su longitud.
- `ctx.textBaseline` dice qué línea del texto es `y`: `'alphabetic'` (el valor por defecto) la línea sobre la que se apoyan las
  letras, `'top'` la parte de arriba, `'middle'` el medio. `'middle'` es la forma fácil de centrar texto en una caja: `y` es el
  medio de la caja.

`ctx.measureText(text).width` dice cuánto medirá de ancho un texto con la fuente actual, antes de dibujarlo: aquí, para dar tamaño
a la píldora blanca de modo que la fecha quepa con 18 píxeles a cada lado.

## Línea por línea

- `const sky = ctx.createLinearGradient(0, 0, 0, 400);` un degradado desde la parte de arriba de la ventana hasta la de abajo.
- `sky.addColorStop(0, '#ff9a8b'); sky.addColorStop(0.6, '#ffc3a0'); sky.addColorStop(1, '#ffe8c2');` rosa arriba, melocotón un
  poco por debajo del medio, amarillo pálido abajo.
- `ctx.fillGradient = sky; ctx.fillRect(0, 0, 640, 400);` toda la ventana, pintada con el degradado.
- `ctx.createRadialGradient(320, 250, 30, 320, 250, 150);` dentro del radio 30 el primer color, más allá de 150 el último, y una
  mezcla entre los dos.
- `ctx.arc(320, 250, 150, 0, 2 * Math.PI); ctx.fill();` el disco sobre el que se pinta el resplandor: tan grande como el círculo
  exterior del degradado, así que su borde es del todo transparente y no se ve.
- `ctx.font = 'bold 56px sans-serif'; ctx.fillText(TITLE, 320, 130);` el título, con su centro en x = 320, apoyado en la línea
  y = 130.
- `const w = ctx.measureText(words).width;` el ancho de la fecha con la fuente de 20 píxeles.
- `ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);` la píldora: tan ancha como el texto más 18 píxeles a cada lado, 40 de
  alto, extremos redondos (un radio de la mitad de su altura).
- `ctx.textBaseline = 'middle'; ctx.fillText(words, 320, 180);` la fecha, centrada en la píldora en los dos sentidos: 180 es el
  medio de la píldora (160 + 40 / 2).
- `ctx.textAlign = 'left'; ctx.fillText('Town square', 24, 370);` empieza a 24 píxeles del borde izquierdo.
  `ctx.textAlign = 'right'; ctx.fillText('Free entry', 616, 370);` termina a 24 píxeles del borde derecho.

## Prueba esto

- Haz el cielo un atardecer: un degradado lineal de izquierda a derecha, `createLinearGradient(0, 0, 640, 0)`, de naranja a violeta.
- Pinta el título con un degradado: `ctx.fillGradient = ...` antes de su `fillText`. Zinc dibuja el texto con el primer color del
  degradado (una diferencia con la web, indicada en [la página de zinc:canvas](../plugins/canvas2d.md#deviations-from-the-web)).
- Añade una segunda píldora bajo la primera, *Free entry*, dimensionada también con `measureText`.
- Escribe tu nombre abajo en el centro, con `textAlign = 'center'`.
- Haz que el sol lata: da al degradado radial un radio exterior de `150 + 20 * Math.sin(time)`, con un `time` que crezca con `dt`.

## Adónde ir ahora

Ya sabes dibujar con el canvas de la web: trazados, rellenos y contornos, transformaciones, animaciones, texto y degradados.

- [La página de zinc:canvas](../plugins/canvas2d.md): cada función, un `Canvas` fuera de pantalla cuyos píxeles se conservan entre
  fotogramas, imágenes, y las diferencias con la web.
- `zinc new canvas` crea un boceto para hacer crecer: un cielo con degradado, una estrella que gira, burbujas donde haces clic.
- [`examples/canvas/sketch`](../../examples/canvas/sketch/main.tsx) en el repositorio: un reloj, fuegos artificiales y formas
  dibujadas en canvas dentro de una interfaz.
- [Dibújalo con el canvas de la web](../start/beyond.md#draw-it-with-the-webs-canvas): un gráfico dibujado con estas llamadas en una caja de una
  interfaz, junto a sus botones.
- [Cuatro maneras de escribir un programa](../start/styles.md): cómo se mezcla el canvas con los otros estilos. [Volver al
  inicio del recorrido](README.md).
