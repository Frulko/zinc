---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 6. Sonido

**Lo que verás (y oirás):** ocho barras de colores, una por cada nota de una escala. Haz clic en una barra, o pulsa una tecla del 1 al 8,
y suena su nota mientras la barra se ilumina y crece.

![Ocho barras de colores llamadas C D E F G A B C](img/06-sound.png)

## El código

El proyecto está en [`samples/06-sound`](samples/06-sound/). `src/main.ts`:

```ts
import { tone } from 'zinc:audio';
import { onFrame, clear, rrect, font, drawText, textWidth, width, height, pointerX, pointerDown, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const HERTZ = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3];   // how fast the air shakes, per second
const COLORS: u32[] = [0x5746e0, 0x2563c9, 0x0e7c86, 0x2f8f57, 0xb7791f, 0xcf3a2b, 0xb5357d, 0x5746e0];

const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));   // made once, played many times
const glow: number[] = HERTZ.map((hz: number) => 0);                   // 1 just after a note, then fades to 0
const label = font('sans-bold', 22);
let wasDown = false;

function play(i: number): void {
  notes[i].play();
  glow[i] = 1;
  console.log(`play ${NAMES[i]} (${HERTZ[i]} Hz)`);
}

onFrame((dt: number) => {
  const bar = width() / NAMES.length;

  if (pointerDown() && !wasDown) play(Math.min(NAMES.length - 1, Math.floor(pointerX() / bar)));
  wasDown = pointerDown();

  for (let k = 0; k < keyCount(); k++) {   // the keys 1 to 8 play too
    const n = parseInt(keyName(k));
    if (keyKind(k) === KeyKind.Down && n >= 1 && n <= 8) play(n - 1);
  }

  clear(0x1c1b20);
  for (let i = 0; i < NAMES.length; i++) {
    glow[i] = Math.max(0, glow[i] - dt * 2);
    const tall = height() * 0.6 + glow[i] * 40;
    rrect(i * bar + 6, height() - tall - 12, bar - 12, tall, 12, COLORS[i], Math.round(140 + 115 * glow[i]));
    drawText(label, i * bar + (bar - textWidth(label, NAMES[i], 0)) / 2, height() - 50, NAMES[i], 0xffffff, 255, 0);
  }
});
```

Haz clic en la tercera barra: oyes un E y la terminal muestra `play E (329.6 Hz)`.

## Hacer un sonido

El módulo `zinc:audio` reproduce sonido. `tone(hz, seconds, wave)` crea un sonido de la nada:

- `hz` es el tono: cuántas veces por segundo vibra el aire. 440 es el A al que se afinan las orquestas; el doble (880)
  es la misma nota una octava más aguda.
- `seconds` es cuánto dura.
- `wave` es la forma del sonido: `'sine'` (suave, una flauta), `'triangle'` (algo más brillante), `'square'` (un videojuego
  antiguo), `'sawtooth'` (zumbante), `'noise'` (un siseo, para tambores y viento).

`tone` devuelve un sonido que puedes reproducir tantas veces como quieras con `play()`. Cada `play()` empieza una copia nueva, así que una nota
pulsada dos veces rápido suena dos veces, superpuesta. Para reproducir una grabación, pon un archivo WAV, MP3, OGG o FLAC en la
carpeta `assets` y usa `load('coin.wav')` en lugar de `tone`.

Un programa ejecutado sin ventana, como lo ejecutan las pruebas, es silencioso: todas las llamadas funcionan y no se oye nada.

## Línea por línea

- `import { tone } from 'zinc:audio';` una función del módulo de sonido. Las dos líneas `import` pueden ir en cualquier orden.
- `const NAMES = [...]`, `HERTZ`, `COLORS`: tres listas de la misma longitud, una entrada por barra. Las notas C, D, E, F, G,
  A, B, C forman una escala mayor; el último C está una octava por encima del primero (523.3 es casi el doble de 261.6).
- `const COLORS: u32[] = [...]` una lista de colores: `u32[]` es «una lista de u32».
- `const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));` `map` crea una lista nueva llamando a una función con
  cada entrada: aquí, un sonido de medio segundo por cada tono. Los sonidos se crean una sola vez, al principio, no en cada clic.
- `const glow: number[] = HERTZ.map((hz: number) => 0);` una lista de ocho ceros: cuánto brilla cada barra.
- `function play(i: number): void { ... }` reproduce la nota número `i`, ilumina su barra y la imprime. `: void` significa que no
  devuelve nada. Tanto el clic como las teclas la llaman, así que el código se escribe una sola vez.
- `const bar = width() / NAMES.length;` el ancho de una barra: la ventana partida en ocho.
- `if (pointerDown() && !wasDown) play(...)` una pulsación nueva, como en la lección 4. `Math.floor(pointerX() / bar)` convierte la
  x del puntero en un número de barra: 0 para la primera barra, 7 para la última. `Math.min(NAMES.length - 1, ...)` se asegura de que
  nunca sea 8, ni siquiera en el borde derecho del todo.
- `const n = parseInt(keyName(k));` convierte el nombre de la tecla en un número: `'5'` pasa a ser `5`. Una tecla que no es un dígito
  (`'a'`) da `NaN` («no es un número»), que no es ni `>= 1` ni `<= 8`, así que no suena nada.
- `play(n - 1)` la tecla 1 toca la barra 0: las listas cuentan desde 0.
- `glow[i] = Math.max(0, glow[i] - dt * 2);` la luz de cada barra se apaga a razón de 2 por segundo: de 1 a 0 en medio segundo.
- `const tall = height() * 0.6 + glow[i] * 40;` una barra iluminada es hasta 40 píxeles más alta.
- `Math.round(140 + 115 * glow[i])` la opacidad: 140 en reposo, 255 recién tocada.
- El último `drawText` escribe el nombre de la nota, centrado en su barra como en la lección 5.

## Prueba esto

- Cambia la onda a `'square'`, y luego a `'sine'`. ¿Cuál te gusta más?
- Toca un acorde: una pulsación toca tres notas a la vez (las barras `i`, `i + 2` e `i + 4`).
- Haz un sonido más fuerte o más suave: `notes[i].volume = 0.3;` antes de `play()`. `pan` lo mueve a la izquierda (-1) o a la derecha (1).
- Graba un sonido con tu teléfono, guárdalo como `assets/clap.wav` y reprodúcelo con `load('clap.wav').play()` cuando pulses
  la barra espaciadora.
- Toca una melodía: una lista de números de barra, y un temporizador en `onFrame` que toque la siguiente cada medio segundo.
- Todas las funciones de `zinc:audio` (bucles, volumen, archivos, sonidos calculados muestra a muestra) están en [la página del
  plugin de audio](../plugins/audio.md).

## Siguiente

Empieza la parte 2: [7. Componentes](07-components.md), una interfaz hecha de cajas, texto, una imagen y un botón.
