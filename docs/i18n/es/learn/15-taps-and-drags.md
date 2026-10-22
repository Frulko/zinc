---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 15. Toques y arrastres

**Lo que verás:** un botón violeta *Taps: 0* arriba a la izquierda, y tres tarjetas, verde, rosa y azul, una encima de otra.
Toca el botón y su número sube; se oscurece mientras tu dedo está sobre él. Coge una tarjeta y muévela: pasa por encima de las
demás y gana un borde blanco mientras la sujetas.

![Un botón "Taps: 2" y tres tarjetas; la tarjeta verde está cogida, encima, con un borde blanco](img/15-taps-and-drags.png)

## El código

El proyecto está en [`samples/15-taps-and-drags`](samples/15-taps-and-drags/). `src/main.ts`:

```ts
import { onFrame, rrect, border, font, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, registerTapZone, registerDragZone, isZonePressed } from 'zinc:stage';

const label = font('sans', 18);

// A button that counts its taps.
class Counter extends Sprite {
  taps: i32 = 0;
  override onDraw(w: number, h: number): void {
    const held = isZonePressed(this.name);                 // a finger is on it right now
    rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);
    const words = `Taps: ${this.taps}`;
    drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, words, 0xffffff, 255, 0);
    registerTapZone(this.name, 0, 0, w, h, () => {
      this.taps++;
      console.log(`tap ${this.taps}`);
    });
  }
}

// A card you pick up and move.
class Card extends Sprite {
  color: u32 = 0;
  startX: number = 0;   // where the card was when it was picked up
  startY: number = 0;
  grabX: number = 0;    // where the finger took it, in the card
  grabY: number = 0;

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 14, this.color, 255);
    if (isZonePressed(this.name)) border(0, 0, w, h, 14, 3, 0xffffff, 255);
    registerDragZone(this.name, 0, 0, w, h, (x: number, y: number, phase: i32) => this.drag(x, y, phase));
  }

  drag(x: number, y: number, phase: i32): void {
    if (phase === 0) {                                     // pressed
      this.startX = this.x;
      this.startY = this.y;
      this.grabX = x;
      this.grabY = y;
      (this.parent as DisplayObject).addChild(this);       // added again: now on top of the other cards
      console.log(`picked up the ${this.name} at ${Math.round(x)}, ${Math.round(y)} in the card`);
    } else if (phase === 1) {                              // moved
      this.x = this.startX + x - this.grabX;
      this.y = this.startY + y - this.grabY;
    } else if (phase === 2) {                              // let go
      console.log(`dropped the ${this.name} at ${Math.round(this.x)}, ${Math.round(this.y)}`);
    }
  }
}

function card(name: string, color: u32, x: number, y: number): Card {
  const c = new Card(name);
  c.color = color;
  c.x = x;
  c.y = y;
  c.width = 120;
  c.height = 160;
  return c;
}

const stage = new Stage();
stage.color = 0xf3f1ec;
const counter = new Counter('counter');
counter.x = 24;
counter.y = 24;
counter.width = 140;
counter.height = 44;
stage.addChild(counter);
stage.addChild(card('green card', 0x7bd389, 200, 120));
stage.addChild(card('pink card', 0xf27aa6, 260, 150));
stage.addChild(card('blue card', 0x5ec2f2, 320, 180));
onFrame((dt: number) => stage.frame(dt));
```

Toca el botón dos veces, luego coge la tarjeta verde por su esquina superior izquierda y muévela hacia arriba y a la derecha:

```text
tap 1
tap 2
picked up the green card at 30, 30 in the card
dropped the green card at 400, 70
```

## Zonas: dónde un objeto recibe el dedo

Un objeto de una escena dice, mientras se dibuja, qué parte de él responde al puntero: una **zona**, un rectángulo en sus propias
coordenadas, con un nombre y la función a llamar. Hay dos tipos:

- `registerTapZone(name, x, y, w, h, onTap)`: una pulsación y una suelta en la zona, sin moverse más de 12 píxeles, llaman a
  `onTap()`. Es un clic con el ratón, un toque con el dedo.
- `registerDragZone(name, x, y, w, h, onDrag)`: una pulsación en la zona llama a `onDrag(x, y, phase)` con `phase` 0, cada
  movimiento con `phase` 1 (en cada fotograma mientras el puntero sigue pulsado), la suelta con `phase` 2. `x` e `y` son el puntero
  **en las coordenadas del objeto**, medidas desde donde estaba el objeto cuando empezó la pulsación: (30, 30) está 30 píxeles a
  la derecha y debajo de la esquina de la tarjeta.

`stage.frame` guarda las zonas de la última imagen. Cuando el puntero baja, busca la zona más alta bajo él, la dibujada en último
lugar, así que una tarjeta encima de otra recibe el dedo primero. `isZonePressed(name)` dice si el dedo está ahora mismo sobre esa
zona, para dibujarla pulsada. Un toque, un arrastre y la propia pulsación activan `uiState.dirty`: la escena se dibuja de nuevo
sin que lo pidas.

El teclado se lee como en la parte 1, con `zinc:gfx` (`keyCount`, `keyName`, `isDown`), en un `onUpdate` o en `onFrame`.

## Línea por línea

- `class Counter extends Sprite` el botón: un sprite con un número de toques.
- `const held = isZonePressed(this.name);` es verdadero mientras un dedo está sobre este botón. El nombre de la zona es el nombre
  del sprite, `'counter'`, así que dos botones nunca comparten uno.
- `rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);` una píldora tan grande como el botón, más oscura mientras se
  sujeta. `held ? a : b` es `a` cuando `held` es verdadero, y `b` si no.
- `drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, ...)` las palabras centradas en el botón:
  la mitad de lo que sobra a cada lado, a lo ancho y a lo alto.
- `registerTapZone(this.name, 0, 0, w, h, () => { ... });` todo el botón recibe toques. `() => { ... }` es la función a llamar:
  suma uno a `taps` y lo imprime. La siguiente imagen muestra el número nuevo.
- `class Card extends Sprite` una tarjeta recuerda dónde estaba y dónde se la cogió: `startX`, `startY`, `grabX`, `grabY`.
- `registerDragZone(this.name, 0, 0, w, h, (x, y, phase) => this.drag(x, y, phase));` toda la tarjeta se puede arrastrar; cada
  paso va al método `drag` de la tarjeta.
- `if (phase === 0)` la pulsación: guarda dónde está la tarjeta y dónde está el dedo dentro de ella.
- `(this.parent as DisplayObject).addChild(this);` añadir un hijo que ya está lo mueve al final de la lista: ahora se dibuja el
  último, encima. `parent` puede ser `null` en general; `as DisplayObject` dice "aquí no lo es".
- `else if (phase === 1)` un movimiento: la tarjeta va a donde estaba, más lo que avanzó el dedo (`x - this.grabX`). El dedo
  se queda en el mismo punto de la tarjeta.
- `else if (phase === 2)` la suelta: di dónde se soltó la tarjeta.
- `function card(...)` crea una tarjeta de 120 por 160 píxeles.
- `stage.addChild(card('green card', 0x7bd389, 200, 120));` las tres tarjetas, cada una un poco más abajo y a la derecha de la
  anterior.

## Prueba esto

- Añade un segundo botón que cuente hacia atrás, o que ponga el primero a 0.
- Mantén las tarjetas dentro de la ventana: en `drag`, limita `this.x` entre `0` y `640 - this.width` con `Math.max` y `Math.min`.
- Haz que una tarjeta se ajuste a una cuadrícula de 20 píxeles al soltarla: en la fase 2, `this.x = Math.round(this.x / 20) * 20`.
- Haz que la zona de toque del botón sea más pequeña que su imagen (`registerTapZone(this.name, 10, 10, w - 20, h - 20, ...)`) y
  mira dónde deja de responder.
- Distingue un toque de un arrastre: en la fase 2, si la tarjeta está a menos de 5 píxeles de `startX`, `startY`, solo la
  tocaron: cambia su color.

## Siguiente

[16. El diseño y una caja con desplazamiento](16-layout-and-scrolling.md): una barra de título y una lista de veinte frutas que se desplaza.
