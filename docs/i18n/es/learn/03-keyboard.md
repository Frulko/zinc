---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 3. El teclado

**Lo que verás:** un cuadrado que mueves con las flechas. La barra espaciadora cambia su color. El nombre de la última tecla que
pulsaste aparece en la esquina superior izquierda.

![Un cuadrado azul sobre un fondo oscuro, con "Space" escrito en la esquina](img/03-keyboard.png)

## El código

El proyecto está en [`samples/03-keyboard`](samples/03-keyboard/). `src/main.ts`:

```ts
import { onFrame, clear, rrect, font, drawText, width, height, isDown, wasPressed, Btn, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const SPEED = 240;   // pixels per second
const SIZE = 48;
let x = 100, y = 100;
let color: u32 = 0xe8b06a;
let lastKey = 'Press a key';
const label = font('sans', 24);

onFrame((dt: number) => {
  // 1. Keys held down: ask every frame.
  if (isDown(Btn.Left)) x -= SPEED * dt;
  if (isDown(Btn.Right)) x += SPEED * dt;
  if (isDown(Btn.Up)) y -= SPEED * dt;
  if (isDown(Btn.Down)) y += SPEED * dt;
  x = Math.max(0, Math.min(width() - SIZE, x));
  y = Math.max(0, Math.min(height() - SIZE, y));

  // 2. A key pressed this frame (not held since before).
  if (wasPressed(Btn.A)) color = color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a;

  // 3. Every key that went down since the last frame, by name.
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Down) {
      lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);
      console.log(`key "${lastKey}", the square is at x = ${Math.round(x)}`);
    }
  }

  clear(0x1c1b20);
  rrect(x, y, SIZE, SIZE, 10, color, 255);
  drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);
});
```

Pulsa teclas: la terminal muestra cada una, por ejemplo `key "a", the square is at x = 220`.

## Dos formas de leer el teclado

**Preguntar, en cada fotograma: ¿está esta tecla pulsada?** `isDown(Btn.Left)` es `true` mientras la tecla se mantiene pulsada. Es lo que usan los juegos
para mover cosas: mientras mantienes la flecha, el cuadrado se mueve un poco en cada fotograma. `zinc:gfx` nombra un pequeño conjunto de
botones, los de un mando de juego, así que el mismo código funciona con un teclado, un mando o los botones de una consola portátil:

| Botón | Teclas en un teclado |
|---|---|
| `Btn.Up`, `Btn.Down`, `Btn.Left`, `Btn.Right` | las flechas, o W, S, A, D |
| `Btn.A` | Espacio o Z |
| `Btn.B`, `Btn.X`, `Btn.Y` | X, C, V |
| `Btn.L`, `Btn.R` | Q, E |
| `Btn.Start`, `Btn.Select` | Intro, Tab |

**Leer la lista de teclas pulsadas desde el último fotograma.** Cada tecla que baja, sube o se repite (mantenida el tiempo suficiente
para escribir otra vez) es un evento con un nombre: `'a'`, `'1'`, `' '` (Espacio), `'Enter'`, `'Escape'`, `'ArrowLeft'`, `'F5'`...
Es la forma de leer cualquier tecla, letras incluidas, y no se pierde ninguna aunque dos teclas lleguen en el mismo fotograma.

## Línea por línea

- `import { ... } from 'zinc:gfx';` novedades esta vez: `font` y `drawText` (la lección 5 los explica), `isDown`,
  `wasPressed` y `Btn` para los botones del juego, `keyCount`, `keyKind`, `keyName` y `KeyKind` para los eventos de teclas.
- `let x = 100, y = 100;` dónde está el cuadrado. `let color: u32 = 0xe8b06a;` su color, un `u32` como todos los colores.
- `let lastKey = 'Press a key';` el texto que se muestra en la esquina. Las palabras entre comillas son un `string`.
- `const label = font('sans', 24);` una fuente, pedida una sola vez al principio: la familia `'sans'` a 24 píxeles.
- `if (isDown(Btn.Left)) x -= SPEED * dt;` mientras Izquierda esté pulsada, se mueve a la izquierda. Arriba es `y -= ...` porque y crece hacia abajo.
- `x = Math.max(0, Math.min(width() - SIZE, x));` mantiene el cuadrado dentro de la ventana. `Math.min(a, b)` es el menor
  de los dos, `Math.max(a, b)` el mayor: juntos mantienen `x` entre 0 y `width() - SIZE`.
- `if (wasPressed(Btn.A)) color = ...;` `wasPressed` es `true` solo en el fotograma en que el botón baja, no mientras
  sigue pulsado. Si mantienes la barra espaciadora, el color cambia una vez, no 60 veces por segundo.
- `color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a` se lee «si el color es naranja, entonces azul, si no naranja». `===` compara,
  `? :` elige uno de dos valores.
- `for (let i = 0; i < keyCount(); i++) { ... }` recorre los eventos de teclas de este fotograma, del primero (el número 0)
  al último.
- `if (keyKind(i) === KeyKind.Down)` se queda solo con las teclas que bajan. Las otras son `KeyKind.Up` (soltada),
  `KeyKind.Repeat` (mantenida, escribiendo otra vez) y `KeyKind.Text` (texto escrito, cuando un campo de texto lo pidió).
- `lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);` el nombre de la tecla. El nombre de la barra espaciadora es un espacio, que
  no verías en pantalla, así que el programa escribe `Space` en su lugar. Los nombres no cambian con Mayús: Mayús+A sigue siendo `'a'`.
- `drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);` escribe `lastKey` en (20, 16) en gris claro.

## Prueba esto

- Haz que Mayús vaya más rápido: `import { modifiers, Mod }` y `const fast = (modifiers() & Mod.Shift) !== 0;`.
- Haz que Intro (`Btn.Start`) devuelva el cuadrado al centro.
- Cuenta las teclas pulsadas y muestra la cuenta debajo del nombre.
- Dibuja el cuadrado más grande mientras la barra espaciadora está pulsada (`isDown(Btn.A)`), y más pequeño cuando se suelta.
- Haz que el cuadrado dé la vuelta: cuando sale por la derecha, vuelve por la izquierda, como en la lección 2.
- Escape cierra un programa de `zinc:gfx` (o sale de la pantalla completa). Para usar Escape tú mismo, llama a `escapeByApp(true)` una vez.

## Siguiente

[4. El ratón y el tacto](04-mouse-and-touch.md): dibuja con el ratón o con un dedo.
