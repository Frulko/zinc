---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 14. Hijos y coordenadas locales

**Lo que verás:** un sol amarillo en el centro de la ventana. Un pequeño planeta gris gira rápido a su alrededor; un
planeta azul, la Tierra, gira despacio más lejos, con su nombre debajo y una pequeña luna que gira a su alrededor.

![Un sol amarillo, un planeta gris cerca de él y la Tierra azul con su luna y su nombre](img/14-children-and-local-coordinates.png)

## El código

El proyecto está en [`samples/14-children-and-local-coordinates`](samples/14-children-and-local-coordinates/). `src/main.ts`:

```ts
import { onFrame, rrect, font, drawText, textWidth } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, uiState } from 'zinc:stage';

// A sun, a planet or a moon: a disc centred on its own (0, 0), turning around its parent's (0, 0).
class Body extends Sprite {
  color: u32 = 0xffffff;
  radius: number = 10;
  orbit: number = 0;    // how far from the parent's centre, in pixels (0: it does not turn)
  speed: number = 0;    // how fast it turns, in radians per second
  angle: number = 0;

  override onUpdate(dt: number): void {
    if (this.orbit === 0) return;
    this.angle += this.speed * dt;
    this.x = Math.cos(this.angle) * this.orbit;
    this.y = Math.sin(this.angle) * this.orbit;
    uiState.dirty = true;
  }

  override onDraw(w: number, h: number): void {
    rrect(-this.radius, -this.radius, this.radius * 2, this.radius * 2, this.radius, this.color, 255);
  }
}

// A name written under its parent, centred on the parent's (0, 0).
const small = font('sans', 14);
class Name extends Sprite {
  text: string = '';
  override onDraw(w: number, h: number): void {
    drawText(small, -textWidth(small, this.text, 0) / 2, 0, this.text, 0xc9c3e6, 255, 0);
  }
}

function body(name: string, color: u32, radius: number, orbit: number, speed: number): Body {
  const b = new Body(name);
  b.color = color;
  b.radius = radius;
  b.orbit = orbit;
  b.speed = speed;
  b.x = orbit;          // its place before it starts turning
  return b;
}

// Where a node is in the window: its x and y, plus its parent's, plus the parent's parent's...
function windowX(node: DisplayObject): number {
  let x = 0;
  let n: DisplayObject | null = node;
  while (n !== null) {
    x += (n as DisplayObject).x;
    n = (n as DisplayObject).parent;
  }
  return x;
}
function windowY(node: DisplayObject): number {
  let y = 0;
  let n: DisplayObject | null = node;
  while (n !== null) {
    y += (n as DisplayObject).y;
    n = (n as DisplayObject).parent;
  }
  return y;
}

const stage = new Stage();
stage.color = 0x0b1026;

const sun = body('sun', 0xffd166, 40, 0, 0);
sun.x = 320;
sun.y = 200;
const mercury = body('mercury', 0xb8b0a8, 8, 70, 2);
const earth = body('earth', 0x5ec2f2, 16, 150, 0.6);
const moon = body('moon', 0xe9e6df, 6, 34, 3);
const label = new Name('label');
label.text = 'Earth';
label.y = 22;

stage.addChild(sun);
sun.addChild(mercury);
sun.addChild(earth);
earth.addChild(moon);
earth.addChild(label);

function tell(): void {
  console.log(`The moon is at ${Math.round(moon.x)}, ${Math.round(moon.y)} in the earth, ` +
    `at ${Math.round(windowX(moon))}, ${Math.round(windowY(moon))} in the window.`);
}

tell();
let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    tell();
    told = true;
  }
});
```

La terminal muestra dónde está la luna al principio y, un segundo después:

```text
The moon is at 34, 0 in the earth, at 504, 200 in the window.
The moon is at -34, 5 in the earth, at 410, 289 in the window.
```

## Un árbol de objetos

Un objeto de una escena puede contener otros objetos: sus **hijos**. `sun.addChild(earth)` pone la Tierra dentro del sol,
y `earth.addChild(moon)` la luna dentro de la Tierra. Los objetos forman un árbol, como carpetas dentro de carpetas:

```text
stage
└── sun
    ├── mercury
    └── earth
        ├── moon
        └── label ("Earth")
```

La `x` y la `y` de un hijo se cuentan **desde su padre**, no desde la ventana: son sus coordenadas locales. La luna solo
sabe "estoy a 34 píxeles a la derecha del centro de la Tierra". No sabe dónde está la Tierra y no lo necesita: cuando
la Tierra se mueve, todo lo que hay dentro de ella se mueve también. Así es como la luna sigue a la Tierra alrededor del
sol sin una línea de código para ello, y como el nombre se queda debajo de la Tierra.

Para saber dónde está algo en la ventana, suma las posiciones a lo largo del árbol. Al principio el sol está en 320, 200
en la ventana, la Tierra a 150, 0 del sol, la luna a 34, 0 de la Tierra: 320 + 150 + 34 = 504 y 200 + 0 + 0 = 200. Eso
es lo que calculan `windowX` y `windowY`, recorriendo desde la luna hasta el escenario con `parent`.

Un padre se dibuja antes que sus hijos, así que los hijos quedan encima, y los hijos en el orden en que se añadieron.

## Línea por línea

- `class Body extends Sprite` una clase para el sol, los planetas y la luna: solo se diferencian por sus números.
- `orbit`, `speed`, `angle` a qué distancia de su padre gira el cuerpo, con qué rapidez y cuánto ha girado ya. Un ángulo
  va en radianes: una vuelta completa es `2 * Math.PI`, unos 6,28.
- `if (this.orbit === 0) return;` el sol no gira: `return` sale de `onUpdate` de inmediato.
- `this.x = Math.cos(this.angle) * this.orbit;` y `this.y = Math.sin(this.angle) * this.orbit;` el punto con ese ángulo
  en un círculo de radio `orbit` alrededor del `(0, 0)` del padre (la lección 11 usó las mismas dos líneas para los
  pétalos).
- `rrect(-this.radius, -this.radius, this.radius * 2, ...)` el disco se dibuja alrededor de `(0, 0)`, no desde él: así
  la `x`, `y` del cuerpo es su centro, y un hijo que gira alrededor de `(0, 0)` gira alrededor del centro.
- `class Name extends Sprite` un sprite que solo escribe texto. `-textWidth(small, this.text, 0) / 2` empieza el texto a
  la izquierda la mitad de su ancho, así queda centrado bajo el centro del padre.
- `b.x = orbit;` cada cuerpo empieza a la derecha de su padre, antes de girar.
- `function windowX(node: DisplayObject): number` suma la `x` desde el nodo hasta el escenario. `DisplayObject` es el
  tipo de todo objeto de una escena (`Sprite` es otro nombre para él). `n` es el nodo en el que estamos;
  `n = (n as DisplayObject).parent` sube un nivel. `parent` es `null` por encima del escenario: el bucle se detiene ahí.
- `sun.x = 320; sun.y = 200;` el centro del sol, en la ventana: el sol es hijo del escenario, que empieza en la esquina
  superior izquierda.
- `label.y = 22;` el nombre, 22 píxeles bajo el centro de la Tierra. Es hijo de la Tierra: gira con ella.
- `stage.addChild(sun); sun.addChild(mercury); ...` construye el árbol dibujado arriba.

## Prueba esto

- Añade Marte: `body('mars', 0xe76f51, 12, 110, 1)`, hijo del sol.
- Dale a Marte dos lunas pequeñas, hijas de Marte, a distintas distancias y velocidades.
- Mueve todo el sistema: cambia `sun.x` en un `onUpdate` del sol (o en `onFrame`) y mira cómo todo lo sigue.
- Haz que la luna sea hija del sol en lugar de la Tierra (`sun.addChild(moon)`): ahora gira alrededor del sol, a 34
  píxeles de él.
- Todo objeto tiene `mouseX` y `mouseY`: el puntero en sus propias coordenadas. Imprime `earth.mouseX` en `onFrame` y
  mueve el ratón sobre la Tierra: está cerca de 0 cuando el puntero está en su centro, esté donde esté la Tierra.

## Siguiente

[15. Toques y arrastres](15-taps-and-drags.md): un botón que tocas y tarjetas que coges y mueves.
