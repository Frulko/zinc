---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 19. Una animación

**Lo que verás:** un molino sobre hierba verde. Sus cuatro aspas rojas giran sin parar, un cuarto de vuelta por segundo, y
nubes blancas cruzan el cielo azul, y vuelven por la izquierda cuando salen por la derecha.

![Un molino con cuatro aspas rojas delante de una nube, sobre hierba verde](img/19-animation.png)

## El código

El proyecto está en [`samples/19-animation`](samples/19-animation/). `src/main.ts`:

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TURN_SPEED = Math.PI / 2;   // the blades turn a quarter of a turn per second
let angle = 0;                    // how far the blades have turned, in radians
let cloudX = 0;                   // how far the clouds have moved
let time = 0;
let told = false;

function cloud(x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, 2 * Math.PI);
  ctx.arc(x + 30, y - 12, 32, 0, 2 * Math.PI);
  ctx.arc(x + 64, y, 24, 0, 2 * Math.PI);
  ctx.fill();
}

onFrame((dt: number) => {
  time += dt;
  angle += TURN_SPEED * dt;
  cloudX = (cloudX + 40 * dt) % 800;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the blades turned ${Math.round((angle * 180) / Math.PI)} degrees.`);
    told = true;
  }

  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#9fd3f5';                    // every frame starts from an empty sky
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 320, 640, 80);

  ctx.fillStyle = 'white';                      // two clouds drift to the right and come back on the left
  cloud(cloudX - 100, 80);
  cloud(((cloudX + 400) % 800) - 100, 130);

  ctx.beginPath();                              // the tower
  ctx.moveTo(300, 320);
  ctx.lineTo(312, 170);
  ctx.lineTo(328, 170);
  ctx.lineTo(340, 320);
  ctx.closePath();
  ctx.fillStyle = '#e9e6df';
  ctx.fill();

  ctx.save();                                   // the blades: move to the hub, turn by the angle, draw four blades
  ctx.translate(320, 170);
  ctx.rotate(angle);
  ctx.fillStyle = '#e63946';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -20);
    ctx.lineTo(10, -120);
    ctx.lineTo(-6, -120);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(320, 170, 9, 0, 2 * Math.PI);
  ctx.fillStyle = '#1d1b18';
  ctx.fill();
  ctx.end();
});
```

Después de un segundo el terminal muestra:

```text
After 1.00 seconds the blades turned 90 degrees.
```

## Una animación es una imagen, una y otra vez

No hay nada nuevo que aprender para mover un canvas: es el libro de animación de la lección 2. En cada fotograma, `onFrame` te da
`dt`, el tiempo desde el último fotograma; avanzas tus números con una velocidad por `dt`, y luego dibujas la imagen entera otra
vez desde el cielo hacia arriba. El canvas no recuerda lo que dibujó en el fotograma anterior (en la web llamarías primero a
`clearRect`; aquí el `fillRect` del cielo lo cubre todo).

Hay dos cosas que el canvas **sí** recuerda de un fotograma al siguiente: sus ajustes y su transformación. Un `translate` o un
`rotate` que no se deshace sigue ahí en el siguiente fotograma, y en el siguiente, y se va sumando: el molino saldría volando. Por
eso las aspas se dibujan entre `save()` y `restore()`. Lo mismo vale para `fillStyle` o `lineWidth`: fija lo que necesites antes
de dibujar.

El ángulo crece sin fin (90 grados tras un segundo, 900 tras diez); una rotación de 900 grados se ve igual que una de 180, así que
no hace falta devolverlo. Las nubes sí lo necesitan: `%` (el resto de una división) devuelve `cloudX` a 0 cuando llega a 800.

## Línea por línea

- `const TURN_SPEED = Math.PI / 2;` un cuarto de vuelta (la mitad de `Math.PI`, que es media vuelta) por segundo.
- `angle += TURN_SPEED * dt;` las aspas giran la velocidad por el tiempo del fotograma, así que giran igual de rápido en una
  máquina lenta que en una rápida.
- `cloudX = (cloudX + 40 * dt) % 800;` las nubes se mueven 40 píxeles por segundo; al pasar de 800 empiezan otra vez desde 0.
- `Math.round((angle * 180) / Math.PI)` convierte radianes en grados para el mensaje: media vuelta son `Math.PI` radianes, 180
  grados.
- `function cloud(x, y)` tres círculos en un trazado, rellenos de una vez: una nube. `arc` añade un círculo al trazado sin levantar
  el lápiz, y el relleno cubre los tres.
- `cloud(cloudX - 100, 80);` la primera nube empieza 100 píxeles a la izquierda de la ventana, así que se desliza hacia dentro en
  vez de aparecer de golpe.
- `cloud(((cloudX + 400) % 800) - 100, 130);` la segunda nube va 400 píxeles por detrás de la primera, en el mismo bucle.
- `ctx.moveTo(300, 320); ... ctx.closePath();` la torre: más estrecha arriba que abajo.
- `ctx.translate(320, 170); ctx.rotate(angle);` el buje del molino pasa a ser `(0, 0)`, girado por el ángulo.
- `ctx.moveTo(0, 0); ctx.lineTo(18, -20); ctx.lineTo(10, -120); ctx.lineTo(-6, -120);` un aspa, que apunta hacia arriba desde el
  buje. `ctx.rotate(Math.PI / 2)` gira un cuarto: el bucle dibuja las cuatro aspas con las mismas líneas.
- `ctx.restore();` deshace el translate y las cuatro rotaciones de una vez, de vuelta a la esquina de la ventana.
- `ctx.arc(320, 170, 9, ...)` el buje negro, dibujado el último, encima de las aspas.

## Prueba esto

- Haz que sople más viento: duplica `TURN_SPEED` y la velocidad de las nubes.
- Haz que las aspas giren al revés: resta en vez de sumar.
- Quita `ctx.save()` y `ctx.restore()` y ejecuta: los movimientos y los giros se suman fotograma tras fotograma, y las aspas salen
  volando de la ventana.
- Haz que un clic acelere las aspas: lee `pointerDown()` de `zinc:gfx`, como en la [página de estilos](../start/styles.md), y suma
  a la velocidad en cada pulsación. Luego frénala un poco en cada fotograma: `speed *= 0.99`.
- Haz que sea de noche: un cielo oscuro, una luna (un círculo) y unas cuantas estrellas (pequeños `fillRect` en sitios fijos).

## Siguiente

[20. Texto y degradados](20-text-and-gradients.md): un cartel con un cielo que pasa de un color a otro, un sol brillante y texto
centrado.
