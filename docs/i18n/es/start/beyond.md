---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# Más allá de los componentes

`View`, `Text`, `Button` y los demás elementos construyen la mayoría de las pantallas: formularios, listas, ajustes. Tarde o temprano
quieres algo que no tienen: un gráfico, un interruptor que se desliza, una tarjeta propia, un tablero de juego junto a los botones.
Esta página muestra siete maneras de ir más lejos. Cada una es un programa pequeño que puedes ejecutar y cambiar.

Cada programa es un proyecto en [`docs/start/samples/`](samples/), que se ejecuta como una lección: `zinc run docs/start/samples/chart-gfx`.
La página supone que conoces las lecciones de interfaz ([de la 7 a la 11](../learn/07-components.md)); las dos últimas partes usan también
una escena ([lecciones 13 a 15](../learn/13-a-stage-and-a-sprite.md)).

1. [Dibújalo tú](#draw-it-yourself): un `Canvas` y `zinc:gfx`.
2. [Dibújalo con el canvas de la web](#draw-it-with-the-webs-canvas): un `Canvas` y `zinc:canvas`.
3. [Estilos como objetos](#styles-as-objects): `style` en lugar de `className`.
4. [Componentes propios](#components-of-your-own): props, hijos y un estado propio.
5. [Animaciones y transiciones](#animations-and-transitions): cosas que se mueven solas.
6. [Una escena dentro de una interfaz](#a-scene-inside-an-interface): sprites en una caja de la interfaz.
7. [Una interfaz dentro de una escena](#an-interface-inside-a-scene): botones sobre un objeto de la escena.

## Dibújalo tú

**Lo que verás:** la lluvia de la semana en barras, y un botón que añade un día.

![Barras azules de 3, 6, 2, 4 y 7 mm bajo el título "Rain this week, in mm" y un botón "Add a day"](img/chart-gfx.png)

[`samples/chart-gfx/src/main.tsx`](samples/chart-gfx/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, rect, font, drawText, textWidth } from 'zinc:gfx';

const MORE = [4, 7, 1, 8, 5];                       // the days still to come
const [rain, setRain] = createSignal<number[]>([3, 6, 2]);
const label = font('sans', 14);

function addDay(): void {
  if (rain().length - 3 >= MORE.length) return;
  setRain([...rain(), MORE[rain().length - 3]]);
  console.log(`${rain().length} days, ${rain()[rain().length - 1]} mm today`);
}

function chart(x: i32, y: i32, w: i32, h: i32): void {
  const days = rain();
  const step = w / 8;                               // room for 8 days
  const tall = (h - 24) / 10;                       // pixels for 1 mm
  rect(x, y + h - 24, w, 1, 0xd6d1c7);              // the ground line
  for (let i = 0; i < days.length; i++) {
    const barH = days[i] * tall;
    const left = x + i * step + 8;
    rrect(left, y + h - 24 - barH, step - 16, barH, 6, 0x5ec2f2, 255);
    const text = `${days[i]}`;
    drawText(label, left + (step - 16 - textWidth(label, text, 0)) / 2, y + h - 20, text, 0x625d55, 255, 0);
  }
}

function App(): i32 {
  return <View className="w-full h-full p-6 gap-4 bg-white">
    <View className="flex-row items-center gap-4">
      <Text className="grow text-2xl font-bold text-[#1d1b18]">Rain this week, in mm</Text>
      <Button className="px-4 h-10 rounded-full bg-[#5746e0]" onClick={addDay}>
        <Text className="text-base text-white">Add a day</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={chart} />
  </View>;
}

render(App, 0xffffff, null);
```

Pulsa *Add a day* dos veces. La terminal muestra:

```text
4 days, 4 mm today
5 days, 7 mm today
```

- No hay un elemento de gráfico. Un `<Canvas>` es una caja de la interfaz que pintas tú. El diseño le da su sitio, como a cualquier
  elemento (`grow`: el espacio que deja el título). Luego Zinc llama a su función `onDraw` con esa caja: `x`, `y`, `w`, `h`.
- `chart` dibuja con las funciones de la [parte 1 de las lecciones](../learn/README.md#the-lessons): `rect`, `rrect`, `drawText`.
- Mide todo desde `x` e `y`, la esquina de la caja, nunca desde la esquina de la ventana.
- Las barras salen de una señal, `rain()`. Un Canvas se pinta de nuevo en cada fotograma, así que un día nuevo se ve en cuanto cambia la señal.
- Los tamaños son partes de la caja (`w / 8`, `(h - 24) / 10`): agranda la ventana y el gráfico crece con ella.

**Prueba esto:** dibuja los días de lluvia (más de 5 mm) en un azul más oscuro. Dibuja una línea a la altura del promedio de la semana.

## Dibújalo con el canvas de la web

**Lo que verás:** la misma semana, como una línea suave sobre un azul que se desvanece hacia el suelo.

![Una línea azul suave por 3, 6, 2, 4 y 7 mm, rellena por debajo con un azul que se desvanece hacia abajo](img/chart-canvas.png)

[`samples/chart-canvas/src/main.tsx`](samples/chart-canvas/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const MORE = [4, 7, 1, 8, 5];                       // the days still to come
const [rain, setRain] = createSignal<number[]>([3, 6, 2]);
const ctx = new CanvasRenderingContext2D();

function addDay(): void {
  if (rain().length - 3 >= MORE.length) return;
  setRain([...rain(), MORE[rain().length - 3]]);
  console.log(`${rain().length} days, ${rain()[rain().length - 1]} mm today`);
}

function chart(x: i32, y: i32, w: i32, h: i32): void {
  const days = rain();
  const step = w / 8;                               // room for 8 days
  const ground = h - 24;
  const at = (i: i32): number => step * i + step / 2;           // the middle of day i
  const top = (i: i32): number => ground - days[i] * ground / 10;
  ctx.begin(x, y, w, h);                            // from here, (0, 0) is the Canvas's corner

  // a smooth line from day to day: each piece is a curve that leaves and arrives flat
  ctx.beginPath();
  ctx.moveTo(at(0), top(0));
  for (let i = 1; i < days.length; i++) ctx.bezierCurveTo(at(i) - step / 2, top(i - 1), at(i) - step / 2, top(i), at(i), top(i));
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2b8fd6';
  ctx.stroke();

  // the same line, closed along the ground, filled with a fading blue
  ctx.lineTo(at(days.length - 1), ground);
  ctx.lineTo(at(0), ground);
  const fade = ctx.createLinearGradient(0, 0, 0, ground);
  fade.addColorStop(0, 'rgba(94, 194, 242, 0.6)');
  fade.addColorStop(1, 'rgba(94, 194, 242, 0)');
  ctx.fillGradient = fade;                          // on the web: ctx.fillStyle = fade
  ctx.fill();

  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#625d55';
  for (let i = 0; i < days.length; i++) ctx.fillText(`${days[i]}`, at(i), h - 6);
  ctx.end();
}

function App(): i32 {
  return <View className="w-full h-full p-6 gap-4 bg-white">
    <View className="flex-row items-center gap-4">
      <Text className="grow text-2xl font-bold text-[#1d1b18]">Rain this week, in mm</Text>
      <Button className="px-4 h-10 rounded-full bg-[#5746e0]" onClick={addDay}>
        <Text className="text-base text-white">Add a day</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={chart} />
  </View>;
}

render(App, 0xffffff, null);
```

Pulsa *Add a day* dos veces: las mismas dos líneas de antes.

- El mismo `<Canvas onDraw>`, dibujado con las llamadas del `<canvas>` de la web ([`zinc:canvas`](../plugins/canvas2d.md), parte 4 de
  las lecciones). El código de un tutorial web sobre gráficos se lee igual.
- `ctx.begin(x, y, w, h)` da al contexto la caja del Canvas. Desde ahí, `(0, 0)` es la esquina de la caja, y no se dibuja nada fuera
  de ella. `ctx.end()` la cierra.
- Un trazado se construye punto a punto; luego `stroke` dibuja su contorno y `fill` pinta su interior. Aquí primero se traza la línea,
  después se cierra por el suelo y se rellena.
- `bezierCurveTo` convierte cada tramo de la línea en una curva. Sus dos primeros puntos aplanan la curva en los dos extremos, así que
  los tramos se unen sin picos.
- Un degradado es una pintura que cambia a lo largo de una línea. `createLinearGradient(0, 0, 0, ground)` va de arriba abajo: un azul
  transparente que se desvanece hasta no ser nada.
- ¿Cuál elegir? `zinc:gfx` para cajas, círculos, texto e imágenes; `zinc:canvas` para curvas, contornos, líneas discontinuas y degradados.

**Prueba esto:** dibuja un punto blanco con borde azul en cada día (`arc`, `fill`, luego `stroke`).

## Estilos como objetos

**Lo que verás:** una batería que se vacía y se llena, y se pone roja cuando queda poca.

![Una batería con un nivel verde al 40 % y dos botones, "Use it" y "Charge it"](img/style-objects.png)

[`samples/style-objects/src/main.tsx`](samples/style-objects/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { StyleSheet } from 'zinc:ui';

const [level, setLevel] = createSignal<number>(60);   // the battery, in percent

const styles = StyleSheet.create({
  page: { width: '100%', height: '100%', padding: 40, gap: 20, backgroundColor: '#f3f1ec' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1d1b18' },
  battery: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  track: { width: 400, height: 48, padding: 4, borderRadius: 14, borderWidth: 3, borderColor: '#1d1b18' },
  fill: { height: 34, borderRadius: 9 },
  tip: { width: 8, height: 20, borderRadius: 3, backgroundColor: '#1d1b18' },
  row: { flexDirection: 'row', gap: 12 },
  button: { height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: '#5746e0' },
  label: { fontSize: 16, color: 'white' },
});

function change(by: number): void {
  setLevel(Math.max(0, Math.min(100, level() + by)));
  console.log(`battery ${level()}%`);
}

function App(): i32 {
  return <View style={styles.page}>
    <Text style={styles.title}>{`Battery: ${level()}%`}</Text>
    <View style={styles.battery}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: level() * 3.86, backgroundColor: level() <= 20 ? '#e5484d' : '#30a46c' }]} />
      </View>
      <View style={styles.tip} />
    </View>
    <View style={styles.row}>
      <Button style={styles.button} onClick={() => change(-20)}><Text style={styles.label}>Use it</Text></Button>
      <Button style={styles.button} onClick={() => change(20)}><Text style={styles.label}>Charge it</Text></Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Pulsa *Use it* dos veces y luego *Charge it*. La terminal muestra:

```text
battery 40%
battery 20%
battery 40%
```

- `className` no es la única manera de dar un aspecto. `style` recibe un objeto de valores con nombre, como en React Native:
  `{ fontSize: 28, color: '#1d1b18' }`. Los nombres son las propiedades de CSS escritas en una sola palabra (`backgroundColor` por
  `background-color`); los números son píxeles.
- `StyleSheet.create` da nombre una sola vez a un grupo de estilos, al principio del archivo: `styles.title`, `styles.button`. Úsalo para
  los estilos que nunca cambian.
- Una lista, `style={[a, b]}`, pone unos estilos encima de otros; gana el último. Aquí `styles.fill`, y luego un objeto con valores que
  cambian.
- Ese objeto lee la señal: `width: level() * 3.86` (3,86 píxeles por cada porcentaje), y un color elegido con `? :`. Cambia la señal y
  la barra la sigue.
- ¿Cuál elegir? Las clases son cortas de escribir y de leer. Los objetos van bien para valores que calculas, y son lo que usa el código de
  React Native. Puedes dar los dos a un mismo elemento. Un programa sin ningún `className` es más ligero: Zinc deja fuera el código que
  lee las clases.
- Todas las propiedades: [Object styles and StyleSheet](../ui.md#object-styles-and-stylesheet).

**Prueba esto:** añade un tercer botón que vacíe la batería de golpe. Haz que la barra sea naranja entre el 20 % y el 50 %.

## Componentes propios

**Lo que verás:** dos tarjetas de receta. Cada ingrediente tiene un número, un menos y un más.

![Dos tarjetas blancas, "Pancakes" con huevos y tazas de leche, "Lemonade" con limones, cada una con botones de menos y más](img/own-components.png)

[`samples/own-components/src/main.tsx`](samples/own-components/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';

// A card: a title, and whatever you put between <Card> and </Card>.
interface CardProps { title: string; children: () => i32 }

function Card(props: CardProps): i32 {
  return <View className="w-[280px] p-5 gap-4 rounded-2xl bg-white shadow-md">
    <Text className="text-xl font-bold text-[#1d1b18]">{props.title}</Text>
    {props.children()}
  </View>;
}

// A number with a minus and a plus. Each Stepper keeps its own number, and tells its owner when it changes.
interface StepperProps { label: string; start: i32; onChange: (value: i32) => void }

function Stepper(props: StepperProps): i32 {
  const [value, setValue] = createSignal<i32>(props.start);
  const change = (by: i32): void => {
    if (value() + by < 0) return;
    setValue(value() + by);
    props.onChange(value());
  };
  return <View className="flex-row items-center gap-3">
    <Text className="grow text-base text-[#625d55]">{props.label}</Text>
    <Button className="w-9 h-9 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
      <Text className="text-lg text-[#1d1b18]">-</Text>
    </Button>
    <Text className="w-6 text-lg font-bold text-[#1d1b18]">{`${value()}`}</Text>
    <Button className="w-9 h-9 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
      <Text className="text-lg text-white">+</Text>
    </Button>
  </View>;
}

function App(): i32 {
  return <View className="w-full h-full flex-row items-center justify-center gap-6 bg-[#f3f1ec]">
    <Card title="Pancakes">
      <Stepper label="Eggs" start={2} onChange={(n: i32) => console.log(`pancakes: ${n} eggs`)} />
      <Stepper label="Cups of milk" start={1} onChange={(n: i32) => console.log(`pancakes: ${n} cups of milk`)} />
    </Card>
    <Card title="Lemonade">
      <Stepper label="Lemons" start={3} onChange={(n: i32) => console.log(`lemonade: ${n} lemons`)} />
    </Card>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Pulsa el más de los huevos dos veces, el menos de la leche y luego el menos de los limones. La terminal muestra:

```text
pancakes: 3 eggs
pancakes: 4 eggs
pancakes: 0 cups of milk
lemonade: 2 lemons
```

- Un componente es una función que devuelve elementos. Su nombre empieza con mayúscula, y se usa como cualquier elemento:
  `<Card title="Pancakes">`.
- Lo que escribes en él (`title="Pancakes"`, `start={2}`) llega en `props`, un objeto cuyos campos enumera una `interface`:
  `props.title`, `props.start`.
- Lo que pones entre `<Card>` y `</Card>` llega como `props.children`, una función. `{props.children()}` lo coloca donde quieras
  dentro de la tarjeta.
- `Stepper` guarda su número en una señal creada dentro de él. Cada `<Stepper>` recibe la suya, así que los huevos y los limones no la comparten.
- Un componente cuenta a su dueño lo que pasó con una función que recibió, `onChange`. El dueño decide qué hacer; aquí
  escribe una línea.
- Un componente también puede contener un dibujo: un `<Canvas>` dentro de él hace un indicador, un dial o un medidor que usas como un `<Button>`.

**Prueba esto:** dale a `Stepper` una prop `max` y párate en ella. Añade una tercera tarjeta.

## Animaciones y transiciones

**Lo que verás:** un interruptor que enciende la luz, y la página se funde en un amarillo cálido. Una campana se balancea cuando la tocas.

![Sobre una página amarillo pálido, un interruptor verde encendido y un botón redondo dorado "Ring" girado hacia un lado](img/animation.png)

[`samples/animation/src/main.tsx`](samples/animation/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import * as Animated from 'zinc:ui/animated';

const [on, setOn] = createSignal<boolean>(false);
const swing = new Animated.Value(0);                 // the bell's angle, in degrees

function flip(): void {
  setOn(!on());
  console.log(on() ? 'the light is on' : 'the light is off');
}

function ring(): void {
  console.log('ring!');
  Animated.sequence([
    Animated.timing(swing, { toValue: 25, duration: 120 }),
    Animated.timing(swing, { toValue: -25, duration: 240 }),
    Animated.spring(swing, { toValue: 0, bounciness: 14 }),
  ]).start((finished: boolean) => console.log('the bell is still again'));
}

function App(): i32 {
  return <View className={`w-full h-full flex-row items-center justify-center gap-20 transition-colors duration-500 ${on() ? 'bg-[#fff4c2]' : 'bg-[#2a2833]'}`}>
    <View className={`w-[88px] h-12 p-1 rounded-full transition-colors duration-300 ${on() ? 'bg-[#30a46c]' : 'bg-[#8e8c99]'}`} onClick={flip}>
      <View className="w-10 h-10 rounded-full bg-white transition-transform duration-300 ease-out" style={{ translateX: on() ? 40 : 0 }} />
    </View>
    <Button className="w-28 h-28 rounded-full bg-[#e8b06a]" style={{ rotate: swing.get() }} onClick={ring}>
      <Text className="text-xl font-bold text-[#1d1b18]">Ring</Text>
    </Button>
  </View>;
}

render(App, 0x2a2833, null);
```

Pulsa el interruptor y luego la campana. La terminal muestra:

```text
the light is on
ring!
the bell is still again
```

- Una **transición** suaviza un cambio. La página tiene `transition-colors duration-500`: cuando cambia su color, Zinc pasa del color
  viejo al nuevo en 500 milisegundos. Tu código cambia el valor una vez; no ejecuta nada en cada fotograma.
- La perilla se desliza igual: `transition-transform` suaviza su `translateX` de 0 a 40 píxeles, y `ease-out` empieza rápido y
  frena al final.
- Una **animación** la inicia tu código. `Animated` es el de React Native. `swing` es un `Animated.Value`, un número que se mueve, y
  `style={{ rotate: swing.get() }}` gira la campana con él, en grados.
- `Animated.timing` mueve el valor hasta `toValue` en `duration` milisegundos. `Animated.spring` hace que llegue rebotando como un muelle.
  `Animated.sequence` las reproduce una tras otra, y `start` recibe una función a la que llamar al final.
- ¿Cuál elegir? Una transición para un estado que cambia: encendido, apagado, elegido, abierto. Una animación para un movimiento con
  historia propia: una sacudida, un rebote, un bucle.
- Un objeto de estilo dice lo mismo que las clases con `transitionProperty` y `transitionDuration`. Más en
  [Transitions](../ui.md#transitions) y [Animated](../ui.md#animated-react-natives-api).

**Prueba esto:** haz que la campana crezca mientras suena (`scale`). Haz el interruptor más lento, y luego más rápido.

## Una escena dentro de una interfaz

**Lo que verás:** un panel con un botón, junto a un acuario donde nadan peces. Haz clic en un pez para darle de comer: crece.

![Un panel blanco "Aquarium, 3 fish" con un botón "Add a fish", junto a agua azul con un pez rosa, uno dorado y uno verde](img/scene-in-interface.png)

[`samples/scene-in-interface/src/main.tsx`](samples/scene-in-interface/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, polygon } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0xe8b06a, 0x7bd389, 0xffffff];
const NAMES = ['pink', 'gold', 'green', 'white'];
const [count, setCount] = createSignal<i32>(0);

class Fish extends Sprite {
  speed: number = 50;         // pixels per second, + to the right
  color: u32 = 0;
  override onUpdate(dt: number): void {
    if (stage.width === 0) return;                           // not drawn yet: the tank has no size
    this.x += this.speed * dt;
    if (this.x < 0) this.speed = Math.abs(this.speed);       // turn back at the glass
    if (this.x > stage.width - this.width) this.speed = -Math.abs(this.speed);
  }
  override onDraw(w: number, h: number): void {
    const right = this.speed > 0;                            // which way it swims
    const tail = right ? 0 : w;
    polygon([tail, 0, tail, h, w / 2, h / 2], this.color, 255);
    rrect(right ? w * 0.25 : 0, 0, w * 0.75, h, h / 2, this.color, 255);
    rrect(right ? w - 16 : 10, h / 2 - 6, 6, 6, 3, 0x1c1b20, 255);   // the eye
    registerTapZone(this.name, 0, 0, w, h, () => this.feed());
  }
  feed(): void {
    this.width += 10;
    this.height += 4;
    console.log(`fed the ${this.name} fish, it is ${this.width} pixels long`);
  }
}

const stage = new Stage();

function addFish(): void {
  const n = stage.numChildren;
  const fish = new Fish(NAMES[n % 4]);
  fish.color = COLORS[n % 4];
  fish.x = 30 + 70 * n;
  fish.y = 60 + 80 * n;
  fish.width = 60;
  fish.height = 30;
  stage.addChild(fish);
  setCount(stage.numChildren);
  console.log(`${count()} fish in the tank`);
}

addFish();
addFish();

function App(): i32 {
  return <View className="w-full h-full flex-row">
    <View className="w-[200px] p-6 gap-4 bg-white">
      <Text className="text-2xl font-bold text-[#1d1b18]">Aquarium</Text>
      <Text className="text-base text-[#625d55]">{`${count()} fish`}</Text>
      <Button className="px-2 h-10 rounded-full bg-[#5746e0]" onClick={addFish}>
        <Text className="text-base text-white">Add a fish</Text>
      </Button>
    </View>
    <Canvas className="grow bg-[#2b6f9e]" onDraw={(x: i32, y: i32, w: i32, h: i32) => stage.drawIn(x, y, w, h)} />
  </View>;
}

render(App, 0xffffff, (dt: number) => stage.update(dt));
```

Pulsa *Add a fish*, luego el pez rosa y el pez dorado. La terminal muestra:

```text
1 fish in the tank
2 fish in the tank
3 fish in the tank
fed the pink fish, it is 70 pixels long
fed the gold fish, it is 70 pixels long
```

- Los peces son sprites de una escena ([`zinc:stage`](../reference/stage.md)), como en las lecciones 13 a 15. Cada uno se mueve en
  `onUpdate`, se dibuja en `onDraw` y registra una zona de toque.
- La escena vive en un `<Canvas>`. Su `onDraw` llama a `stage.drawIn(x, y, w, h)`, que organiza y dibuja el escenario en la caja del
  Canvas. El `(0, 0)` del escenario es la esquina de la caja, y `stage.width`, `stage.height` su tamaño.
- El tercer argumento de `render` llama a `stage.update(dt)` en cada fotograma: da el puntero a las zonas de toque y llama a `onUpdate`.
  (Un programa que es solo una escena llama a `stage.frame(dt)`, que hace las dos mitades.)
- Cada lado recibe sus propios clics. *Add a fish* es un botón de la interfaz: su `onClick` llama a `addFish`. Un clic sobre un pez va a
  la zona de toque del pez. Nada de la escena sale de su caja, y sus zonas tampoco: un pez medio fuera del acuario nunca se queda un
  clic pensado para el panel.
- El escenario no tiene tamaño hasta que se dibuja por primera vez; por eso `onUpdate` espera a `stage.width`.
- El agua es el fondo propio del Canvas (`bg-[#2b6f9e]`).

**Prueba esto:** haz que los peces den la vuelta cuando comen. Añade un botón que vacíe el acuario (`stage.removeChildren()`).

## Una interfaz dentro de una escena

**Lo que verás:** globos que suben por el cielo. Un cartel de madera lleva un título y un botón que añade un globo. Haz clic en un globo
para reventarlo. Arrastra el cartel por su barra marrón.

![Un cielo azul con globos que suben y, en medio, un cartel crema con una barra marrón, "5 balloons" y un botón "Add a balloon"](img/interface-in-scene.png)

[`samples/interface-in-scene/src/main.tsx`](samples/interface-in-scene/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, line } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, registerDragZone } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389, 0xb48ef2];
const [signX, setSignX] = createSignal<number>(0);   // where the sign is: the interface follows it
const [signY, setSignY] = createSignal<number>(0);
const [count, setCount] = createSignal<i32>(0);
let made = 0;                                            // balloons made since the start

class Balloon extends Sprite {
  color: u32 = 0;
  override onUpdate(dt: number): void {
    this.y -= 30 * dt;                                   // it rises,
    if (this.y < -100) this.y = 400;                     // and comes back from below
  }
  override onDraw(w: number, h: number): void {
    line(w / 2, h, w / 2, h + 36, 0x5b6470);            // the string
    rrect(0, 0, w, h, w / 2, this.color, 255);
    registerTapZone('balloon', 0, 0, w, h, () => this.pop());
  }
  pop(): void {
    sky.removeChild(this);
    setCount(sky.numChildren);
    console.log(`pop! ${count()} balloons left`);
  }
}

class Sign extends Sprite {
  startX: number = 0;
  startY: number = 0;
  grabX: number = 0;
  grabY: number = 0;
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 12, 0xfff7e6, 255);
    rrect(0, 0, w, 28, 12, 0xc98b4f, 255);              // the bar you drag it by
    registerTapZone('sign', 0, 28, w, h - 28, () => {}); // the interface takes these clicks, not the balloons behind
    registerDragZone('bar', 0, 0, w, 28, (x: number, y: number, phase: i32) => this.drag(x, y, phase));
  }
  drag(x: number, y: number, phase: i32): void {
    if (phase === 0) {
      this.startX = this.x;
      this.startY = this.y;
      this.grabX = x;
      this.grabY = y;
    } else {
      this.x = this.startX + x - this.grabX;
      this.y = this.startY + y - this.grabY;
    }
  }
}

function addBalloon(): void {
  const balloon = new Balloon('balloon');
  balloon.color = COLORS[made % COLORS.length];
  balloon.x = 30 + 80 * (made % 7);
  balloon.y = 380 - 60 * (made % 4);
  made++;
  balloon.width = 50;
  balloon.height = 64;
  sky.addChild(balloon);
  setCount(sky.numChildren);
  console.log(`a new balloon, ${count()} in the sky`);
}

const stage = new Stage();
const sky = new Sprite('sky');                           // the balloons, under the sign
stage.addChild(sky);
const sign = new Sign('sign');
sign.x = 400;
sign.y = 40;
sign.width = 210;
sign.height = 130;
stage.addChild(sign);
for (let i = 0; i < 5; i++) addBalloon();

function App(): i32 {
  return <View className="w-full h-full">
    <Canvas className="w-full h-full bg-[#9fd3f0]" onDraw={(x: i32, y: i32, w: i32, h: i32) => stage.drawIn(x, y, w, h)} />
    <View className="absolute w-[210px] h-[102px] p-4 gap-3" style={{ left: signX(), top: signY() + 28 }}>
      <Text className="text-lg font-bold text-[#1d1b18]">{`${count()} balloons`}</Text>
      <Button className="h-10 rounded-full bg-[#5746e0]" onClick={addBalloon}>
        <Text className="text-base text-white">Add a balloon</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0x9fd3f0, (dt: number) => {
  stage.update(dt);
  setSignX(sign.x);                                      // the scene fills the window: its x and y are the window's
  setSignY(sign.y);
});
```

Revienta el globo verde, arrastra el cartel hacia abajo y a la izquierda, y luego pulsa *Add a balloon* sobre el globo dorado que hay detrás del
cartel. La terminal muestra (después de los cinco globos del principio):

```text
pop! 4 balloons left
a new balloon, 5 in the sky
```

- La escena llena la ventana: un solo `<Canvas className="w-full h-full">` la dibuja con `drawIn`.
- El cartel es un sprite: dibuja el tablero y su barra. La interfaz del cartel es un `<View className="absolute">` colocado sobre él
  con `style={{ left: signX(), top: signY() + 28 }}`. Zinc dibuja los elementos que vienen después de un Canvas encima de él, así que el
  panel se ve sobre el tablero.
- En cada fotograma, después de `stage.update(dt)`, el programa copia dónde está el cartel en dos señales, `signX` y `signY`. Arrastra el
  cartel y el panel lo sigue. (La escena empieza en la esquina de la ventana, así que el `x` y el `y` del cartel son posiciones de la ventana.)
- El botón pertenece a la interfaz: su `onClick` añade un globo. Debajo del panel, el cartel registra una zona de toque que no
  hace nada. Cubre los globos de detrás, así que un clic en el botón nunca revienta también un globo.
- Los globos son hijos de un sprite propio, `sky`, añadido antes que el cartel: suben por detrás de él.

**Prueba esto:** pon un segundo botón en el cartel que reviente todos los globos. Haz que el cartel cuelgue de un globo y suba con él.

## Adónde ir después

- [Cuatro formas de escribir un programa](styles.md): los estilos de dibujo, escena, Canvas e interfaz lado a lado, y cómo se mezclan.
- [zinc:ui a fondo](../ui.md): cada clave de estilo, los eventos, el desplazamiento, las capas, las transiciones.
- [Referencia de zinc:stage](../reference/stage.md), [zinc:canvas](../plugins/canvas2d.md), [referencia de zinc:gfx](../reference/gfx.md).
- [El kit de interfaz](../ui-kit.md): botones, diálogos, menús y pestañas listos para usar, para cuando prefieras no hacerlos tú.
