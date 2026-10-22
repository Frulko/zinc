---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Aprende Zinc: de una forma a una aplicación

Estas lecciones muestran cómo hacer un programa que pone algo en la pantalla, responde al teclado, al ratón y al tacto,
dibuja, reproduce sonido, y después cómo construir una interfaz con texto y botones, una escena de objetos, o un dibujo con el canvas
de la web. Cada lección es corta. Cada una da el código completo, lo explica línea por línea y termina con cambios para probar.

No necesitas saber Zinc. Un poco de JavaScript ayuda, pero no es obligatorio: cada línea se explica. Los programas de Zinc
se escriben en TypeScript (JavaScript con tipos) con unas pocas reglas extra, así que casi todo lo que aprendes aquí también sirve en
la web.

## Antes de empezar

Instala Zinc con un solo comando (más formas en [Primeros pasos](../guide/01-getting-started.md#install)):

```sh
brew install frulko/zinc/zinc
zinc doctor
```

O instala **Zinc Atelier**, la aplicación que edita y ejecuta programas sin terminal (`--atelier` en el comando de instalación de
[Primeros pasos](../guide/01-getting-started.md#install)).

## Cómo ejecutar una lección

El código de cada lección es un pequeño proyecto en [`docs/learn/samples/`](samples/): un archivo `zinc.json` y una carpeta `src`.
Descarga esa carpeta desde [GitHub](https://github.com/Frulko/zinc/tree/main/docs/learn/samples), o usa tu copia del
repositorio de Zinc.

**En una terminal**, dale a `zinc run` la carpeta de la lección:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Se abre una ventana. Ciérrala para detener el programa. Lo que el programa imprime con `console.log` aparece en la terminal.

**En Zinc Atelier**, elige *Archivo > Abrir boceto…* (Cmd+O en un Mac, Ctrl+O en los demás), escoge la carpeta de la lección y luego
*Boceto > Ejecutar* (Cmd+R o Ctrl+R). Las líneas impresas aparecen en la consola de Atelier. Cambia el código y vuelve a ejecutarlo.

**Tu propio proyecto**: crea una carpeta con los dos archivos de la lección. `zinc.json` dice dónde está el código y de qué tamaño es la
ventana; la lección 1 lo explica. Luego `zinc run` en esa carpeta.

## Las lecciones

**Parte 1: dibujar.** Tu programa dibuja la imagen entera por sí mismo, una y otra vez, muchas veces por segundo. Así funcionan los juegos,
las animaciones y el arte generativo. Usa el módulo `zinc:gfx`.

1. [Una ventana y una forma](01-window-and-shape.md): abre una ventana, pinta el fondo, dibuja un rectángulo y un círculo.
2. [Colores y movimiento](02-colours-and-movement.md): el bucle de fotogramas, el tiempo entre fotogramas, colores hechos con números.
3. [El teclado](03-keyboard.md): mueve un cuadrado con las flechas, lee el nombre de cualquier tecla.
4. [El ratón y el tacto](04-mouse-and-touch.md): dibuja líneas con el ratón o un dedo, la rueda, el botón derecho.
5. [Texto e imágenes](05-text-and-images.md): fuentes y tamaños, texto centrado, una imagen de la carpeta de recursos.
6. [Sonido](06-sound.md): reproduce notas cuando haces clic o pulsas una tecla.

**Parte 2: una interfaz.** Describes la pantalla una sola vez, como elementos en un árbol (una caja contiene un título y un botón), y Zinc
la dibuja y la mantiene al día. Así funcionan las aplicaciones y las herramientas. Usa `zinc:ui`, escrito como React o Solid.

7. [Componentes](07-components.md): `View`, `Text`, `Image`, `Button`, y cómo se colocan.
8. [Estado](08-state.md): un valor que la pantalla sigue por sí sola (una señal).
9. [Eventos](09-events.md): clics, pulsaciones y movimientos del puntero, el teclado.
10. [Estilos](10-styles.md): colores, tamaños, espacios y esquinas con `className`, estilos que cambian.
11. [Un dibujo dentro de una interfaz](11-drawing-in-an-interface.md): un `Canvas` que dibuja con `zinc:gfx` junto a botones.
12. [Una pequeña aplicación completa](12-a-small-app.md): una lista de la compra donde escribes, añades, marcas y borras.

**Parte 3: una escena.** Tu programa está hecho de objetos, cada uno una clase que conoce su lugar, se dibuja a sí misma y responde a toques y
arrastres; un escenario los contiene y dibuja solo cuando algo cambió. Así escriben juegos y aplicaciones ActionScript 3 (Flash) y Haxe,
y así las aplicaciones de Zinc siguen siendo rápidas en tabletas antiguas. Usa `zinc:stage`.

13. [Un escenario y un sprite](13-a-stage-and-a-sprite.md): una clase de pelota, tres pelotas en un escenario, `onUpdate` y `onDraw`.
14. [Hijos y coordenadas locales](14-children-and-local-coordinates.md): una luna alrededor de un planeta alrededor del sol.
15. [Toques y arrastres](15-taps-and-drags.md): un botón que cuenta sus toques, tarjetas que recoges y mueves.
16. [El diseño y una caja con desplazamiento](16-layout-and-scrolling.md): una barra de título en una fila, una lista de frutas que se desplaza.

**Parte 4: el canvas de la web.** El dibujo de la parte 1, con las llamadas que usan las páginas web para dibujar en un `<canvas>`: trazados, contornos,
curvas, transformaciones y degradados. El código de una página web o de un tutorial de canvas se lee igual. Usa `zinc:canvas`.

17. [Trazados y rellenos](17-paths-and-fills.md): una casa con tejado, una puerta, una ventana y un camino curvo.
18. [Transformaciones](18-transforms.md): dos relojes dibujados moviendo, girando y encogiendo el papel.
19. [Una animación](19-animation.md): un molino cuyas aspas giran y nubes que pasan.
20. [Texto y degradados](20-text-and-gradients.md): un cartel con un cielo que se desvanece, un sol brillante y texto centrado.

Cada lección dura de 10 a 20 minutos. Haz las lecciones de una parte en orden: cada una usa lo que enseñó la anterior. Las partes 2, 3
y 4 empiezan todas desde la parte 1, así que después de la parte 1 elige la que más te guste.

## Cuatro formas de poner cosas en pantalla

| | `zinc:gfx` (parte 1) | `zinc:ui` (parte 2) | `zinc:stage` (parte 3) | `zinc:canvas` (parte 4) |
|---|---|---|---|---|
| Escribes | qué dibujar, en cada fotograma | qué contiene la pantalla, una vez | objetos que se dibujan solos | qué dibujar, en cada fotograma, como en la web |
| Bueno para | juegos, animaciones, arte | aplicaciones, formularios, herramientas, ajustes | aplicaciones y juegos en tabletas antiguas | código de canvas web, dibujos vectoriales |
| Posición | das cada x e y | el diseño coloca los elementos | cada objeto en su padre, o en una fila o columna | das cada x e y, o mueves el papel |
| Cambios | dibujas la imagen nueva | cambias un valor, la pantalla lo sigue | mueves un objeto, el escenario dibuja | dibujas la imagen nueva |

Se pueden mezclar: la lección 11 dibuja con `zinc:gfx` dentro de una interfaz. [Cuatro formas de escribir un programa](../start/styles.md) muestra el mismo
programa pequeño escrito de cada forma, lado a lado, y cómo se combinan.

## Palabras que encontrarás

| Palabra | Significado |
|---|---|
| píxel | un punto de la pantalla. Los tamaños y las posiciones se cuentan en píxeles. |
| x, y | una posición: x cuenta píxeles desde el borde izquierdo, y desde el borde de arriba. (0, 0) es la esquina superior izquierda. |
| fotograma | una imagen de la ventana. Un programa muestra unos 60 fotogramas por segundo, como un flipbook. |
| función | un trozo de código con nombre que se ejecuta cuando lo llamas: `clear(0xffffff)` llama a `clear`. |
| callback | una función que le das a Zinc, que la llama más tarde: en cada fotograma, en un clic. |
| módulo | un conjunto de funciones que puedes importar: `zinc:gfx` dibuja, `zinc:audio` reproduce sonido, `zinc:ui` construye interfaces. |
| tipo | qué clase de valor guarda una variable: `number`, `string` (texto), `boolean` (verdadero o falso). Zinc los comprueba antes de ejecutar. |
| señal | un valor que la interfaz sigue: cámbialo y cada texto o estilo que lo lee cambia también. |
| componente | un trozo de interfaz, escrito como una función que devuelve elementos: `View`, `Text`, `Button`, o el tuyo. |
| clase | el plano de un objeto: qué guarda (campos) y qué hace (métodos). `new Ball()` crea un objeto a partir del plano `Ball`. |
| sprite | un objeto de una escena (parte 3): una posición, un tamaño, hijos, y los métodos que Zinc llama para actualizarlo y dibujarlo. |
| trazado | una forma que el canvas construye punto a punto (parte 4) antes de rellenarla o dibujar su contorno. |

## Cuando ya sepas esto

- [Referencia de zinc:gfx](../reference/gfx.md): cada función de dibujo y de entrada, agrupadas.
- [Eventos de zinc:ui](../reference/ui-events.md): cada evento de la interfaz, qué te da, cuándo se dispara.
- [Referencia de zinc:stage](../reference/stage.md): cada clase y función de la parte 3.
- [zinc:canvas](../plugins/canvas2d.md): cada función de la parte 4, y las pocas diferencias con la web.
- [Aplicaciones de interfaz](../guide/03-ui-apps.md) y [zinc:ui a fondo](../ui.md): desplazamiento, campos de texto, animaciones, capas.
- [El kit de interfaz](../ui-kit.md): botones, diálogos, menús y pestañas listos para usar.
- [Sonido](../plugins/audio.md): cada función de `zinc:audio`.
- Los ejemplos de Zinc Atelier (*Archivo > Ejemplos…*) y `zinc new game-2d`, un pequeño juego completo para leer y cambiar;
  `zinc new stage` y `zinc new canvas` inician un proyecto al estilo de la parte 3 o de la parte 4.
