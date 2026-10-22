---
source: 6feb1df07edd49722e71a16656309caa55687473
---
# Cuatro formas de escribir un programa

Zinc te deja poner cosas en la pantalla de cuatro formas. Funcionan con el mismo motor, en la misma ventana y con los mismos comandos
(`zinc new`, `zinc run`, `zinc dev`); cambia la manera de pensar la pantalla. Elige la que te resulte más natural, o la que
encaje con lo que haces. Puedes mezclarlas y puedes cambiar más tarde: el lenguaje, el sonido, los archivos y la red son iguales en
las cuatro.

| | Dibujo | Escena | Canvas | Interfaz |
| --- | --- | --- | --- | --- |
| Módulo | `zinc:gfx` | `zinc:stage` | `zinc:canvas` | `zinc:ui` |
| Se parece a | Processing, p5.js, LÖVE | ActionScript 3 (Flash), Haxe y OpenFL | el `<canvas>` de la web | React, Solid, React Native |
| Tú escribes | una función que dibuja toda la imagen, en cada fotograma | objetos que se dibujan a sí mismos, en un árbol | la misma función de fotograma, con las llamadas del canvas de la web | los elementos de la pantalla, una vez, en JSX |
| Sirve para | juegos, animaciones, arte, un primer programa | apps y juegos en tabletas antiguas, objetos que tocas y arrastras | código de canvas web, dibujos vectoriales, gráficos | apps, formularios, listas, ajustes, herramientas |
| Empieza con | `zinc new game` | `zinc new stage` | `zinc new canvas` | `zinc new desktop-app` |
| Lecciones | [1 a 6](../learn/README.md#the-lessons) | [13 a 16](../learn/13-a-stage-and-a-sprite.md) | [17 a 20](../learn/17-paths-and-fills.md) | [7 a 12](../learn/07-components.md) |

Dónde elegir: `zinc new` solo te pregunta qué quieres hacer y luego, para un juego o un dibujo (Dibujo, Escena, Canvas) y para una
app con ventanas (Interfaz, Escena), cómo quieres escribirlo. En Zinc Atelier, **Boceto nuevo**, arriba en la vista de inicio,
ofrece los cuatro estilos, cada uno un pequeño programa para empezar, y los ejemplos de abajo están agrupados por estilo.

## El mismo programa, cuatro veces

Una pelota rebota por la ventana. Un clic (o un toque) sobre la pelota cambia su color y suma un punto a la puntuación, arriba a la izquierda.
Aquí está en cada estilo. Los cuatro programas se ven igual:

![Una pelota dorada sobre fondo oscuro, "Score: 2" arriba a la izquierda](img/bounce.png)

Cada versión es un proyecto pequeño en [`docs/start/samples/`](samples/), que se ejecuta como una lección: `zinc run docs/start/samples/drawing`
(o `scene`, `canvas`, `interface`). Cada una imprime una línea cuando golpeas la pelota:

```text
hit: score 1, the ball is blue
hit: score 2, the ball is gold
```

### Dibujo (`zinc:gfx`)

[`samples/drawing/src/main.ts`](samples/drawing/src/main.ts):

```ts
import { onFrame, clear, rrect, font, drawText, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const label = font('sans', 20);

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  // a press on the ball: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown) {
    const dx = pointerX() - x, dy = pointerY() - y;
    if (dx * dx + dy * dy <= R * R) {
      color = (color + 1) % COLORS.length;
      score++;
      console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
    }
  }
  wasDown = down;

  // draw the whole picture again
  clear(0x1c1b20);
  rrect(x - R, y - R, 2 * R, 2 * R, R, COLORS[color], 255);
  drawText(label, 16, 12, `Score: ${score}`, 0xffffff, 255, 0);
});
```

- Todo vive en variables: dónde está la pelota, su velocidad, su color, la puntuación.
- Una función se ejecuta unas 60 veces por segundo. Mueve la pelota, mira el ratón y luego pinta de nuevo toda la ventana, desde el
  fondo hacia arriba.
- Nadie avisa al programa de un clic: él pregunta a `pointerDown()` en cada fotograma y compara con el fotograma anterior
  (`wasDown`) para ver el momento en que se pulsó el botón. Después mide la distancia al centro de la pelota.

### Escena (`zinc:stage`)

[`samples/scene/src/main.ts`](samples/scene/src/main.ts):

```ts
import { onFrame, rrect, font, drawText, width, height } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const label = font('sans', 20);

class Score extends Sprite {
  points: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(label, 0, 0, `Score: ${this.points}`, 0xffffff, 255, 0);
  }
}

class Ball extends Sprite {
  vx: number = 150;           // its speed, in pixels per second
  vy: number = 110;
  color: i32 = 0;             // which colour of COLORS it has
  override onUpdate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > width() - this.width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height() - this.height) this.vy = -this.vy;
    uiState.dirty = true;     // it moved: draw the next frame
  }
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, COLORS[this.color], 255);           // (0, 0) is the ball's own corner
    registerTapZone('ball', 0, 0, w, h, () => this.hit());
  }
  hit(): void {
    this.color = (this.color + 1) % COLORS.length;
    score.points++;
    console.log(`hit: score ${score.points}, the ball is ${NAMES[this.color]}`);
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
const score = new Score('score');
score.x = 16;
score.y = 12;
const ball = new Ball('ball');
ball.x = 70;                  // the corner: the centre is at 100, 80
ball.y = 50;
ball.width = 60;
ball.height = 60;
stage.addChild(ball);
stage.addChild(score);
onFrame((dt: number) => stage.frame(dt));
```

- La pelota y la puntuación son objetos, cada uno una clase con sus propios campos. El escenario los guarda, como un escenario guarda a los actores.
- Cada objeto se dibuja a sí mismo en sus propias coordenadas: `(0, 0)` es la esquina superior izquierda de la pelota, esté donde esté. Zinc mueve el
  dibujo al lugar correcto.
- La pelota dice dónde se la puede tocar (`registerTapZone`) mientras se dibuja, y da la función que hay que llamar. El escenario encuentra la zona
  que está bajo el dedo y llama a `hit()`.
- `uiState.dirty = true` pide una imagen nueva. Una escena en la que nada se mueve no dibuja nada, y por eso les gusta a las tabletas antiguas.

### Canvas (`zinc:canvas`)

[`samples/canvas/src/main.ts`](samples/canvas/src/main.ts):

```ts
import { onFrame, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const COLORS = ['#f27aa6', '#5ec2f2', '#e8b06a', '#7bd389'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const ctx = new CanvasRenderingContext2D();

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  ctx.begin(0, 0, width(), height());          // the canvas is the whole window
  ctx.fillStyle = '#1c1b20';
  ctx.fillRect(0, 0, width(), height());

  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  // a press inside the ball's path: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown && ctx.isPointInPath(pointerX(), pointerY())) {
    color = (color + 1) % COLORS.length;
    score++;
    console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
  }
  wasDown = down;
  ctx.fillStyle = COLORS[color];
  ctx.fill();

  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';
  ctx.fillText(`Score: ${score}`, 16, 12);
  ctx.end();
});
```

- La misma función de fotograma que en el estilo de dibujo; las llamadas de dibujo son las de la web: `fillStyle`, `beginPath`, `arc`, `fill`, `fillText`.
  El código de una página web o de un tutorial de MDN se lee igual.
- `ctx.begin(0, 0, width(), height())` hace que toda la ventana sea el canvas; no hay página, ni elemento `<canvas>`, ni JSX.
- Los colores son cadenas CSS (`'#f27aa6'`, `'white'`, `'rgba(0, 0, 0, 0.5)'`).
- El clic se lee de `zinc:gfx`, como en el estilo de dibujo. El canvas responde a la pregunta «¿está este punto dentro de la forma que acabo de
  construir?» con `isPointInPath`.

### Interfaz (`zinc:ui`)

[`samples/interface/src/main.tsx`](samples/interface/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';

const COLORS = ['bg-[#f27aa6]', 'bg-[#5ec2f2]', 'bg-[#e8b06a]', 'bg-[#7bd389]'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
const [x, setX] = createSignal<number>(100);   // the centre of the ball
const [y, setY] = createSignal<number>(80);
const [color, setColor] = createSignal<i32>(0);
const [score, setScore] = createSignal<i32>(0);
let vx = 150, vy = 110;       // its speed, in pixels per second

function move(dt: number): void {
  setX(x() + vx * dt);
  setY(y() + vy * dt);
  if (x() < R || x() > width() - R) vx = -vx;
  if (y() < R || y() > height() - R) vy = -vy;
}

function hit(): void {
  setColor((color() + 1) % COLORS.length);
  setScore(score() + 1);
  console.log(`hit: score ${score()}, the ball is ${NAMES[color()]}`);
}

function App(): i32 {
  return <View className="w-full h-full">
    <View className={`absolute w-[60px] h-[60px] rounded-full ${COLORS[color()]}`}
      style={{ left: x() - R, top: y() - R }} onClick={hit} />
    <Text className="absolute text-xl text-white" style={{ left: 16, top: 12 }}>{`Score: ${score()}`}</Text>
  </View>;
}

render(App, 0x1c1b20, move);
```

- La pantalla se describe una vez: una caja que llena la ventana, con una caja redonda (la pelota) y un texto (la puntuación). El aspecto viene
  de `className`, como con Tailwind en la web.
- Los valores que muestra la pantalla son señales (signals): `setX`, `setColor`, `setScore` las cambian, y la pelota y el texto las siguen
  solos. Nada se dibuja a mano.
- `onClick={hit}` en la pelota: Zinc llama a `hit` cuando se pulsa y se suelta la pelota. El tercer argumento de `render` se llama en
  cada fotograma, aquí para mover la pelota.
- Una interfaz brilla con campos de texto, listas, botones y páginas; una pelota que se mueve es el caso más difícil para ella, y aun así ocupa pocas líneas.

### Qué cambia de una a otra

| | Dibujo | Escena | Canvas | Interfaz |
| --- | --- | --- | --- | --- |
| Dónde está la pelota | dos variables | la `x` y la `y` del sprite | dos variables | dos señales |
| Cómo se encuentra el clic | la distancia al centro | una zona de toque que la pelota registró | `isPointInPath` | `onClick` en la caja de la pelota |
| Qué se dibuja en un fotograma | todo | solo cuando algo cambió | todo | solo cuando una señal cambió |
| Líneas | 36 | 49 | 43 | 34 |

## Cada estilo en detalle

### Dibujo, como Processing

**Sirve para** un primer programa, juegos, animaciones, arte generativo, visualizaciones; personas que conocen Processing, p5.js, LÖVE o Pico-8.

**Cómo se piensa:** un folioscopio. En cada fotograma empiezas con una página vacía y lo dibujas todo donde está ahora: el fondo,
luego las formas, luego el texto encima. Lo que cambia vive en tus variables; mover algo es cambiar un número.

**Cómo llegan los eventos a tu código:** tú preguntas. `pointerX()`, `pointerY()` y `pointerDown()` dicen dónde está el ratón o el primer dedo,
`isDown(Btn.Left)` si una tecla o un botón del mando está pulsado, `keyCount()` y `keyName(i)` qué teclas llegaron desde el último fotograma.
Para ver un clic, compara con el fotograma anterior. Nada te llama salvo el fotograma.

**En dispositivos antiguos:** cada fotograma cuesta lo que dibuja, siempre, aunque nada se mueva. Las formas, las imágenes y un poco de texto se redibujan
rápido en todas partes, así funcionan los juegos; llama a `keep()` en un fotograma en el que nada cambió para mostrar de nuevo la última imagen gratis.

### Escena, como ActionScript 3 y Haxe

**Sirve para** apps y juegos hechos de muchos objetos: tarjetas que arrastras, botones que tocas, listas que se desplazan, páginas que entran deslizándose; personas que hicieron
juegos o apps en Flash, o que conocen Haxe/OpenFL, Starling o Pixi. Es el estilo que usan las demos de Zinc en tabletas antiguas (la HP TouchPad, la
Nexus 7, una Raspberry Pi 3: [`examples/music-tree`](../../examples/music-tree/src/main.ts)).

**Cómo se piensa:** un teatro de marionetas. Cada objeto es una clase que conoce su lugar en su padre (`x`, `y`), su tamaño, sus hijos,
cómo dibujarse (`onDraw`) y qué hace en cada fotograma (`onUpdate`). Un hijo se mueve con su padre. Una fila o una columna puede colocar
a los hijos por ti.

**Cómo llegan los eventos a tu código:** un objeto dice, mientras se dibuja, qué rectángulo recibe un toque (`registerTapZone`) o un arrastre
(`registerDragZone`), con la función que hay que llamar. `stage.frame(dt)` encuentra la zona más alta bajo el dedo y la llama. Las teclas se
leen de `zinc:gfx`, como en el estilo de dibujo.

**En dispositivos antiguos:** el más ligero de los cuatro. No se dibuja nada mientras nada cambia (`uiState.dirty`), no hay hoja de estilos que
aplicar ni árbol de elementos que comparar, así que una pantalla en reposo cuesta casi nada y una en movimiento cuesta lo que dibuja.

### Canvas, a la manera de la web

**Sirve para** personas que conocen el canvas de la web, código portado de una página web o de un tutorial de JavaScript, dibujos vectoriales con curvas,
trazos y degradados, gráficos.

**Cómo se piensa:** un lápiz con ajustes. Eliges un color (`fillStyle`), un grosor de línea (`lineWidth`), luego construyes un trazado
(`moveTo`, `lineTo`, `arc`, `bezierCurveTo`) y lo rellenas con `fill` o lo trazas con `stroke`. `translate`, `rotate` y `scale` mueven el papel bajo el lápiz;
`save` y `restore` lo devuelven a su sitio. Los ajustes se quedan hasta que los cambies, incluso en el fotograma siguiente, como en la web.

**Cómo llegan los eventos a tu código:** como en el estilo de dibujo, desde `zinc:gfx`; no hay `addEventListener`. `isPointInPath(x, y)` dice
si un punto está dentro del trazado que acabas de construir, lo que facilita las pruebas de impacto en cualquier forma.

**En dispositivos antiguos:** cada curva se convierte en muchos segmentos pequeños, y cada forma se rellena con bordes suaves (16 muestras por píxel) y
degradados calculados píxel a píxel. Una ventana entera de curvas y degradados en cada fotograma es el trabajo más pesado de los cuatro para una
tableta de 2011. Mantén pequeña la parte que se mueve y dibuja lo que no se mueve una sola vez en un `Canvas` fuera de pantalla que muestras con `drawImage`
([zinc:canvas](../plugins/canvas2d.md#drawing-targets)).

### Interfaz, como React y Solid

**Sirve para** apps: formularios, listas, ajustes, herramientas, paneles, todo lo que tenga campos de texto y botones; personas que conocen React, Solid,
React Native, o HTML y CSS con Tailwind.

**Cómo se piensa:** una descripción. Dices una vez qué contiene la pantalla, como cajas dentro de cajas (`<View>`, `<Text>`, `<Button>`,
`<Image>`), y cómo se ven (`className="p-4 rounded-xl bg-white"`). Los valores que cambian son señales; cambia una y cada texto y
estilo que la lea la sigue. El diseño lo coloca todo: casi nunca das una x ni una y.

**Cómo llegan los eventos a tu código:** atributos en los elementos: `onClick`, `onPointerDown`, `onKeyDown`, `onInput`... Zinc llama a tu
función con lo que pasó ([los eventos](../reference/ui-events.md)). Los campos de texto, el foco, el teclado, el desplazamiento y los lectores
de pantalla vienen incluidos.

**En dispositivos antiguos:** el que más trabajo pide por elemento: un diseño flexbox, estilos, composición de texto, un árbol de elementos guardado en memoria. Es la
opción para un ordenador, una Raspberry Pi 4 o un teléfono de los últimos cinco años; en una tableta más antigua, escribe la misma pantalla como una escena
([`examples/GUIDELINES.md`](../../examples/GUIDELINES.md)).

## Cómo se mezclan

- **Un dibujo dentro de una interfaz.** `<Canvas className="grow" onDraw={fn} />` es una caja de la interfaz que dibujas tú:
  `fn(x, y, w, h)` recibe su lugar y su tamaño y dibuja con `zinc:gfx`. [La lección 11](../learn/11-drawing-in-an-interface.md) pone una
  flor junto a unos botones de esta manera.
- **Un Canvas dentro de una interfaz.** El mismo `<Canvas onDraw>`, con un contexto de canvas: `ctx.begin(x, y, w, h)` al principio de `fn`,
  `ctx.end()` al final ([zinc:canvas](../plugins/canvas2d.md)).
- **Un Canvas dentro de un dibujo.** En una función de fotograma, las llamadas de `zinc:gfx` y un contexto de canvas pueden turnarse: `ctx.begin(x, y, w, h)`
  le da su caja al contexto, y lo que dibujas después de `ctx.end()` va encima.
- **Dibujo y Canvas dentro de una escena.** El `onDraw` de un sprite dibuja con `zinc:gfx` en sus propias coordenadas; un contexto de canvas también funciona ahí:
  `ctx.begin(0, 0, w, h)` dibuja en las coordenadas del sprite y se mueve con él.
- **Un escenario es toda la ventana**, y también lo es el `render` de una interfaz: un programa elige una de las dos para su pantalla. El dibujo y el Canvas
  van dentro de cualquiera de ellas.

¿No estás seguro? Empieza con el estilo de dibujo y [las lecciones](../learn/README.md): todos los demás estilos usan lo que enseñan. Para elegir qué
tipo de programa hacer (un juego, una app, un servidor, una placa), mira [Elige tu tipo de programa](choose.md).
