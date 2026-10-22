---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 13. Un escenario y un sprite

**Lo que verás:** tres pelotas de distintos tamaños ruedan de izquierda a derecha sobre un escenario azul oscuro, cada
una a su propia velocidad, y vuelven por la izquierda cuando salen de la ventana.

![Una pelota rosa, una azul y una dorada sobre un fondo azul oscuro](img/13-a-stage-and-a-sprite.png)

La parte 3 escribe programas como una **escena**: un escenario que contiene objetos, cada objeto un pequeño programa
propio que sabe dónde está y cómo dibujarse. Si has hecho juegos de Flash con ActionScript 3, o has usado Haxe y
OpenFL, es la misma idea, con los mismos nombres. Usa el módulo `zinc:stage` y dibuja con las funciones de `zinc:gfx`
de la parte 1.

## El código

El proyecto está en [`samples/13-a-stage-and-a-sprite`](samples/13-a-stage-and-a-sprite/). `src/main.ts`:

```ts
import { onFrame, rrect, width } from 'zinc:gfx';
import { Stage, Sprite, uiState } from 'zinc:stage';

class Ball extends Sprite {
  color: u32 = 0xffffff;
  speed: number = 100;   // pixels per second, to the right

  override onAddedToStage(): void {
    console.log(`The ${this.name} joined the stage.`);
  }

  override onUpdate(dt: number): void {
    this.x += this.speed * dt;
    if (this.x > width()) this.x = -this.width;   // gone on the right: back on the left
    uiState.dirty = true;                         // it moved: the stage must be drawn again
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, this.color, 255);    // (0, 0) is the ball's own top left corner
  }
}

function makeBall(name: string, color: u32, y: number, size: number, speed: number): Ball {
  const ball = new Ball(name);
  ball.color = color;
  ball.y = y;
  ball.width = size;
  ball.height = size;
  ball.speed = speed;
  return ball;
}

const stage = new Stage();
stage.color = 0x14213d;
stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));
stage.addChild(makeBall('blue ball', 0x5ec2f2, 170, 80, 60));
stage.addChild(makeBall('gold ball', 0xe8b06a, 300, 40, 200));
console.log(`The stage holds ${stage.numChildren} balls.`);

let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the pink ball is at x = ${Math.round(stage.getChildAt(0).x)}.`);
    told = true;
  }
});
```

La terminal muestra:

```text
The pink ball joined the stage.
The blue ball joined the stage.
The gold ball joined the stage.
The stage holds 3 balls.
After 1.00 seconds the pink ball is at x = 120.
```

## Objetos, clases y sprites

En la parte 1 una pelota eran dos variables, `x` e `y`, y la función de fotograma la dibujaba. Con tres pelotas
necesitarías seis variables, tres velocidades, tres colores y una función de fotograma que crece con cada pelota nueva.
Una escena pone los números de cada pelota **dentro de la pelota**: un objeto.

Una **clase** es el plano de un objeto: lo que contiene y lo que puede hacer. `class Ball extends Sprite` dice "una Ball
es un Sprite, con un color y una velocidad añadidos". `Sprite` viene de `zinc:stage` y ya tiene lo que necesita todo
objeto de una escena: una posición `x`, `y` (desde la esquina superior izquierda de su padre), un tamaño `width`,
`height`, un `name` e hijos. `new Ball('pink ball')` crea un objeto a partir del plano; puedes crear tantos como
quieras, cada uno con sus propios números.

Un sprite no se dibuja cuando tú quieres: Zinc llama a sus métodos en el momento justo. Tú escribes los que necesites,
con la palabra `override` (sustituyes lo que hace `Sprite`, que es nada):

| Método | Cuándo lo llama Zinc |
|---|---|
| `onAddedToStage()` | una vez, cuando el objeto se une al escenario |
| `onUpdate(dt)` | en cada fotograma: haz avanzarlo `dt` segundos |
| `onDraw(w, h)` | cuando se dibuja el escenario: dibújalo, con `(0, 0)` en su propia esquina superior izquierda y `w`, `h` su tamaño |

El **escenario** (*stage*) es la raíz de la escena. `stage.frame(dt)`, llamado desde `onFrame`, hace un fotograma
completo: llama a `onUpdate` en cada objeto y, si algo ha cambiado, borra la ventana con `stage.color` y llama a cada
`onDraw`, en el orden en que se añadieron los objetos (el último queda encima).

## Línea por línea

- `import { Stage, Sprite, uiState } from 'zinc:stage';` el escenario, la clase base de los objetos y el estado del
  fotograma.
- `class Ball extends Sprite { ... }` el plano de una pelota. Entre las llaves: sus campos y sus métodos.
- `color: u32 = 0xffffff;` un campo: toda pelota tiene un color, blanco hasta que alguien lo cambia. `speed: number = 100;`
  lo mismo con la velocidad.
- `override onAddedToStage(): void` se ejecuta cuando `addChild` pone la pelota en el escenario. `this` es la propia
  pelota: `this.name` es el nombre que se le dio.
- `override onUpdate(dt: number): void` se ejecuta en cada fotograma. `this.x += this.speed * dt;` mueve esta pelota con
  su propia velocidad, como en la lección 2.
- `if (this.x > width()) this.x = -this.width;` cuando se ha ido por la derecha, ponla justo fuera por la izquierda.
- `uiState.dirty = true;` avisa al escenario de que la imagen ha cambiado. Un escenario donde nadie lo activa no dibuja
  nada: la última imagen se queda en pantalla y el ordenador descansa. Aquí las pelotas se mueven siempre, así que
  siempre lo activan.
- `override onDraw(w: number, h: number): void` dibuja la pelota. `rrect(0, 0, w, h, w / 2, ...)` es un círculo que
  llena la caja de la pelota. `(0, 0)` no es la esquina de la ventana: es la esquina de la propia pelota, esté donde
  esté. Zinc mueve el dibujo allí por ti.
- `function makeBall(...)` crea una pelota y fija sus campos, así tres pelotas ocupan tres líneas más abajo.
  `new Ball(name)` crea el objeto; `return ball;` lo devuelve.
- `const stage = new Stage();` el escenario. `stage.color = 0x14213d;` su fondo, azul oscuro.
- `stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));` pone una pelota rosa a 60 píxeles de la parte
  superior, de 60 píxeles de ancho, rodando a 120 píxeles por segundo. Al añadirla se llama a su `onAddedToStage`.
- `stage.numChildren` cuántos objetos contiene el escenario. `stage.getChildAt(0)` el primero, la pelota rosa.
- `onFrame((dt: number) => { stage.frame(dt); ... });` el bucle de fotogramas de la parte 1 entrega cada fotograma al
  escenario. El resto cuenta un segundo e imprime dónde está la pelota rosa: 120 píxeles por segundo durante un segundo,
  120 píxeles desde donde empezó.

## Prueba esto

- Añade una cuarta pelota: una línea más `stage.addChild(makeBall(...))`. Nada más cambia.
- Dale también a `Ball` una velocidad vertical y haz que las pelotas reboten en los bordes, como en el *Prueba esto* de
  la lección 2.
- Quita `uiState.dirty = true;` y ejecuta: las pelotas se mueven (su `x` cambia) pero la imagen se queda quieta, porque
  nadie pide al escenario que dibuje.
- Crea una segunda clase, `Square extends Sprite`, que dibuje un cuadrado y caiga en lugar de rodar. Pon pelotas y
  cuadrados en el mismo escenario.
- En `onDraw`, escribe el nombre de la pelota debajo de ella con `drawText` (lección 5):
  `drawText(f, 0, h + 4, this.name, 0xffffff, 255, 0)`.

## Siguiente

[14. Hijos y coordenadas locales](14-children-and-local-coordinates.md): objetos dentro de objetos, y una luna que gira
alrededor de un planeta que gira alrededor del sol.
