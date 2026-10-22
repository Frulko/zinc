---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 5. Texto e imágenes

**Lo que verás:** un título en el centro, arriba, un cohete que sube y baja, y dos líneas de texto más pequeño
abajo, una de ellas contando los segundos.

![Un cohete bajo el título "Hello, space"](img/05-text-and-images.png)

## El código

El proyecto está en [`samples/05-text-and-images`](samples/05-text-and-images/). Tiene una tercera parte: una carpeta `assets`
con la imagen, `rocket.svg`. `zinc.json` nombra esa carpeta:

```json
{
  "name": "text-and-images",
  "entry": "src/main.ts",
  "assets": "assets",
  "app": { "id": "com.example.learn.text", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts`:

```ts
import { onFrame, clear, font, drawText, textWidth, lineHeight, image, imageWidth, imageHeight, drawImage, width, height } from 'zinc:gfx';

const title = font('sans-bold', 40);
const body = font('sans', 18);
const rocket = image('rocket.svg');   // the file assets/rocket.svg

console.log(`The rocket picture is ${imageWidth(rocket)} by ${imageHeight(rocket)} pixels.`);

let time = 0;

onFrame((dt: number) => {
  time += dt;
  clear(0x1c1b20);

  // A title in the middle: measure it, then start half of what is left from the left edge.
  const words = 'Hello, space';
  const w = textWidth(title, words, 0);
  drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);

  // Two lines of smaller text, one under the other.
  const left = 40;
  let y = height() - 2 * lineHeight(body) - 30;
  drawText(body, left, y, 'Pictures come from the assets folder.', 0xbcb6ab, 255, 0);
  y += lineHeight(body);
  drawText(body, left, y, `Flight time: ${Math.floor(time)} s`, 0xbcb6ab, 255, 0);

  // The picture, bobbing up and down, drawn at twice its size.
  const size = imageWidth(rocket) * 2;
  const bob = Math.sin(time * 3) * 10;
  drawImage(rocket, (width() - size) / 2, height() / 2 - size / 2 + bob, size, size, 255, 0);
});
```

La terminal muestra `The rocket picture is 96 by 96 pixels.`

## Fuentes

Antes de escribir, pides una fuente: una familia y un tamaño en píxeles, una sola vez, al principio. Zinc te devuelve un número que
representa esa fuente, y cada llamada de texto usa ese número. Las familias que vienen con Zinc:

| Familia | Cómo se ve |
|---|---|
| `'sans'` | letras sencillas (Inter) |
| `'sans-bold'` | lo mismo, en negrita |
| `'mono'` | todas las letras igual de anchas, para código (JetBrains Mono) |

Una fuente propia: pon un archivo `.ttf` en `assets` y pide `loadFont('MyFont.ttf', 32)`.

## Línea por línea

- `const title = font('sans-bold', 40);` una fuente en negrita, de 40 píxeles de alto. `body` es una normal a 18.
- `const rocket = image('rocket.svg');` una imagen de la carpeta `assets`, por el nombre de su archivo. Funcionan PNG y SVG. Como una
  fuente, recibes un número que representa la imagen. Si falta el archivo, el número es `-1` y no se dibuja nada.
- `imageWidth(rocket)`, `imageHeight(rocket)`: el tamaño de la imagen, en píxeles.
- `const w = textWidth(title, words, 0);` cuánto medirán de ancho las palabras en esa fuente, antes de dibujarlas. El último
  argumento es espacio extra entre las letras, 0 para ninguno.
- `drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);` escribe las palabras. Los argumentos: la fuente, x e
  y de la esquina superior izquierda del texto, las palabras, el color, la opacidad, el espacio extra entre letras.
  `(width() - w) / 2` centra el texto: lo que sobra del ancho, partido en dos, a cada lado.
- `lineHeight(body)` es la altura de una línea en esa fuente, con el espacio entre líneas. El programa empieza dos líneas
  y un margen por encima del borde inferior, y luego baja una altura de línea para la segunda línea.
- `` `Flight time: ${Math.floor(time)} s` `` construye el texto en cada fotograma. `Math.floor` quita lo que hay después del punto,
  así que el número cambia una vez por segundo.
- `drawImage(rocket, x, y, size, size, 255, 0);` dibuja la imagen dentro de una caja: x, y, ancho, alto, opacidad y el
  radio de las esquinas redondeadas (0: esquinas cuadradas). La caja mide el doble que la imagen, así que se dibuja el doble de grande. Una
  imagen SVG es un dibujo, no puntos, así que se mantiene nítida.
- `Math.sin(time * 3) * 10` hace que el cohete suba y baje 10 píxeles, tres veces más rápido que un segundo.

## Prueba esto

- Escribe tu nombre debajo del título, también centrado.
- Haz que el título aparezca poco a poco: una opacidad de `Math.min(255, time * 100)`.
- Escribe una frase larga y pártela tú mismo en líneas: sepárala en palabras, mide cada una con `textWidth`, y empieza una línea nueva
  cuando la palabra siguiente no quepa (el ejemplo *Text* de Atelier lo hace).
- Dibuja el cohete más pequeño, muchas veces, en sitios al azar: `Math.random() * width()`. Elige los sitios una sola vez, antes de
  `onFrame`, o saltarán en cada fotograma.
- Dibuja tu propia imagen en cualquier editor de vectores (Inkscape, Figma), expórtala como SVG a `assets` y muéstrala.
- Gira el cohete con las flechas: `drawImageRect` admite una rotación (la [referencia](../reference/gfx.md#images)
  muestra cómo).

## Siguiente

[6. Sonido](06-sound.md): toca notas.
