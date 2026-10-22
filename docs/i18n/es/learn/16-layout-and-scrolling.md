---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 16. El diseño y una caja con desplazamiento

**Lo que verás:** una página con una barra de título, *Fruits* a la izquierda y *Tap a fruit* a la derecha, y debajo una lista
blanca de veinte frutas que no cabe en la ventana. Desplázala con la rueda del ratón, con dos dedos en un trackpad, o arrastrándola
con un dedo; sigue un poco cuando la sueltas. Toca una fruta: su fila se pone gris y la barra de título dice *You chose: Lime*.

![Una barra de título "Fruits" y "You chose: Lime" sobre una lista desplazada, con la fila Lime en gris](img/16-layout-and-scrolling.png)

## El código

El proyecto está en [`samples/16-layout-and-scrolling`](samples/16-layout-and-scrolling/). `src/main.ts`:

```ts
import { onFrame, rrect, rect, font, drawText, lineHeight } from 'zinc:gfx';
import {
  Stage, Sprite, ScrollBox, registerTapZone, beginScrollBox, endScrollBox, isLocalRectVisible, isZonePressed,
} from 'zinc:stage';

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry', 'Coconut', 'Fig', 'Grape', 'Kiwi', 'Lemon',
  'Lime', 'Mango', 'Melon', 'Orange', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Raspberry', 'Strawberry'];
const ROW = 44;                                   // the height of one row, in pixels
const bold = font('sans-bold', 22);
const plain = font('sans', 17);
let chosen = '';

// A line of text, centred in its height.
class Label extends Sprite {
  text: string = '';
  fontId: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(this.fontId, 0, (h - lineHeight(this.fontId)) / 2, this.text, 0x1d1b18, 255, 0);
  }
}

// The list of fruits: it draws only the rows you can see, and scrolls with a finger or the wheel.
class FruitList extends Sprite {
  box: ScrollBox = new ScrollBox();

  override onMeasure(): void {
    this.box.contentHeight = FRUITS.length * ROW;
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 12, 0xffffff, 255);
    beginScrollBox(this.box, 0, 0, w, h);         // what is drawn until endScrollBox stays inside the box
    for (let i = 0; i < FRUITS.length; i++) {
      const y = i * ROW - this.box.scrollY;       // scrolled: the rows move up
      if (!isLocalRectVisible(0, y, w, ROW)) continue;
      const id = `row ${i}`;
      if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);
      drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], 0x1d1b18, 255, 0);
      rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);
      registerTapZone(id, 0, y, w, ROW, () => {
        chosen = FRUITS[i];
        status.text = `You chose: ${chosen}`;
        console.log(`tapped ${chosen}, the list is scrolled by ${Math.round(this.box.scrollY)}`);
      });
    }
    endScrollBox();
  }
}

const stage = new Stage();
stage.color = 0xf3f1ec;
stage.direction = 'column';                       // children from top to bottom
stage.alignItems = 'stretch';                     // each one as wide as the stage
stage.setPaddingSymmetric(24, 20);
stage.gap = 12;

const header = new Sprite('header');
header.direction = 'row';                         // children from left to right
header.height = 40;
const title = new Label('title');
title.text = 'Fruits';
title.fontId = bold;
title.flex = 1;                                   // takes the room the status leaves
title.height = 40;
const status = new Label('status');
status.text = 'Tap a fruit';
status.fontId = plain;
status.width = 220;
status.height = 40;
header.addChild(title);
header.addChild(status);

const list = new FruitList('list');
list.flex = 1;                                    // the rest of the height

stage.addChild(header);
stage.addChild(list);
console.log(`${FRUITS.length} fruits, ${FRUITS.length * ROW} pixels of list`);
onFrame((dt: number) => stage.frame(dt));
```

Toca *Cherry*, desplázate tres pasos de la rueda, arrastra la lista hacia arriba 100 píxeles y luego toca la fila que queda bajo
el puntero:

```text
20 fruits, 880 pixels of list
tapped Cherry, the list is scrolled by 0
tapped Lime, the list is scrolled by 244
```

## Filas y columnas

Hasta ahora cada objeto tenía una `x` y una `y` que tú fijabas. Una página con una barra de título y una lista necesitaría muchos
números, todos para cambiar cuando la ventana cambia de tamaño. En su lugar, un padre puede **colocar a sus hijos**:

| Campo | Qué hace |
|---|---|
| `direction = 'column'` | los hijos uno debajo de otro, desde arriba |
| `direction = 'row'` | los hijos uno al lado de otro, desde la izquierda |
| `gap` | píxeles entre dos hijos |
| `setPaddingSymmetric(across, down)` | un margen vacío dentro del padre: `across` a izquierda y derecha, `down` arriba y abajo |
| `alignItems = 'stretch'` | cada hijo ocupa todo el ancho de una columna (o todo el alto de una fila) |
| `flex = 1` | en un hijo: ocupa el espacio que dejan los demás |

Aquí el escenario es una columna: la barra de título (40 píxeles de alto), luego la lista, que ocupa el resto (`flex = 1`). La
barra de título es una fila: el título ocupa lo que deja el estado (220 píxeles de ancho). Cambia el tamaño de la ventana en
`zinc.json` y todo sigue encajando, sin ningún número que cambiar. Antes de dibujar, el escenario llama al `onMeasure()` de cada
objeto: el momento de fijar un tamaño o un valor que el diseño necesita.

## Una caja con desplazamiento

La lista mide 880 píxeles de alto (20 filas de 44) y la ventana 400. Una **caja con desplazamiento** muestra una parte de ella, y
se mueve cuando te desplazas:

- `box: ScrollBox = new ScrollBox();` guarda el estado: `scrollY`, cuánto está desplazada la lista, y `contentHeight`, cuánto mide
  de alto la lista entera.
- `beginScrollBox(this.box, 0, 0, w, h)` ... `endScrollBox()`: lo que se dibuja entre los dos se recorta a la caja, y las zonas
  también. Una fila medio oculta bajo el título no recibe toques en su mitad oculta.
- Dibujas cada fila en `i * ROW - this.box.scrollY`: cuando la lista está desplazada 100, cada fila queda 100 píxeles más arriba.
- `stage.frame` hace el resto: la rueda y el trackpad desplazan la caja que está bajo el puntero; un dedo que se mueve más de 12
  píxeles sobre ella la desplaza (y no toca nada), y un movimiento rápido la lanza.

`isLocalRectVisible` dice si una fila está dentro de la caja: las filas que no se ven no se dibujan, así que una lista de mil
filas no dibuja más de veinte.

## Línea por línea

- `const FRUITS = [...]` las veinte frutas, en una lista. `const ROW = 44;` la altura de una fila.
- `let chosen = '';` la última fruta tocada, `''` (vacío) al empezar.
- `class Label extends Sprite` un texto centrado en su altura: `(h - lineHeight(this.fontId)) / 2` desde arriba. `fontId` dice qué
  fuente, así que el título y el estado comparten la clase.
- `override onMeasure(): void` fija la altura del contenido antes del diseño y del dibujo.
- `rrect(0, 0, w, h, 12, 0xffffff, 255);` la tarjeta blanca de la lista, antes de abrir la caja.
- `for (let i = 0; i < FRUITS.length; i++)` una fila por fruta. `continue` pasa a la siguiente fruta cuando esta fila no se ve.
- ``const id = `row ${i}`;`` el nombre de la zona de la fila: `row 0`, `row 1`... `isZonePressed(id)` es verdadero mientras el
  dedo está sobre ella.
- `if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);` un fondo gris para la fila sujetada o elegida.
  `||` significa "o".
- `drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], ...)` el nombre de la fruta, centrado en su fila.
- `rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);` una línea fina bajo cada fila.
- `registerTapZone(id, 0, y, w, ROW, () => { ... });` la fila recibe toques. La función recuerda `i`: cada fila tiene la suya.
- `status.text = ...` cambia el texto de la etiqueta de estado. `status` se crea más abajo en el archivo; la función se ejecuta
  después, en un toque, cuando ya existe. Un toque ya pide una imagen nueva: el texto nuevo se ve enseguida.
- `stage.direction = 'column'; stage.alignItems = 'stretch';` la página es una columna, con sus hijos tan anchos como la ventana
  menos el relleno.
- `header.direction = 'row';` la barra de título es una fila de dos etiquetas.
- `title.flex = 1;` el título ocupa el ancho que deja el estado; `status.width = 220;` el estado tiene un ancho fijo.
- `list.flex = 1;` la lista ocupa el alto que deja la barra de título.

## Prueba esto

- Haz las filas más altas o más bajas: cambia `ROW`. Todo lo demás se adapta.
- Añade una tercera etiqueta a la barra de título, *20 fruits*, entre el título y el estado.
- Pon el estado al final de la página: añádelo al escenario después de la lista, no a la cabecera.
- Haz la lista tan ancha como la mitad de la ventana: `stage.direction = 'row'`, y una segunda lista al lado.
- Vuelve arriba del todo cuando se toque el título: en el `onDraw` de `Label`, una zona de toque que ponga `list.box.scrollY = 0`.

## Adónde ir ahora

Ya sabes construir una escena: objetos que se mueven y se dibujan solos, un árbol de hijos, toques, arrastres, un diseño y una
lista que se desplaza. Con eso basta para la mayoría de las aplicaciones en una tableta antigua.

- La [referencia de zinc:stage](../reference/stage.md): cada campo, método y función, y lo que tiene ActionScript 3 que `zinc:stage`
  no tiene.
- `zinc new stage` crea una pequeña aplicación para hacer crecer: un título, botones de colores y una pegatina que arrastras.
- [`examples/music-tree`](../../examples/music-tree/src/main.ts) en el repositorio: un reproductor de música entero escrito así,
  rápido en una tableta de 2011.
- [Cuatro maneras de escribir un programa](../start/styles.md), o la parte 4: [17. Trazados y rellenos](17-paths-and-fills.md), el canvas de la web.
