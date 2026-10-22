---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# Oltre i componenti

`View`, `Text`, `Button` e gli altri elementi costruiscono la maggior parte delle schermate: moduli, liste, impostazioni. Prima o poi
vuoi qualcosa che non hanno: un grafico, un interruttore che scorre, una scheda tutta tua, una scacchiera di gioco accanto ai
pulsanti. Questa pagina mostra sette modi per andare oltre. Ognuno è un piccolo programma che puoi eseguire e cambiare.

Ogni programma è un progetto in [`docs/start/samples/`](samples/), che si esegue come una lezione: `zinc run docs/start/samples/chart-gfx`. La pagina
presume che tu conosca le lezioni sull'interfaccia ([da 7 a 11](../learn/07-components.md)); le ultime due parti usano anche una scena
([lezioni da 13 a 15](../learn/13-a-stage-and-a-sprite.md)).

1. [Disegnalo tu](#draw-it-yourself): un `Canvas` e `zinc:gfx`.
2. [Disegnalo con il canvas del web](#draw-it-with-the-webs-canvas): un `Canvas` e `zinc:canvas`.
3. [Stili come oggetti](#styles-as-objects): `style` invece di `className`.
4. [I tuoi componenti](#components-of-your-own): props, figli e uno stato proprio.
5. [Animazioni e transizioni](#animations-and-transitions): cose che si muovono da sole.
6. [Una scena dentro un'interfaccia](#a-scene-inside-an-interface): sprite in un riquadro dell'interfaccia.
7. [Un'interfaccia dentro una scena](#an-interface-inside-a-scene): pulsanti su un oggetto della scena.

## Disegnalo tu

**Cosa vedrai:** la pioggia della settimana come barre, e un pulsante che aggiunge un giorno.

![Barre blu di 3, 6, 2, 4 e 7 mm sotto il titolo "Rain this week, in mm" e un pulsante "Add a day"](img/chart-gfx.png)

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

Clicca due volte *Add a day*. Il terminale mostra:

```text
4 days, 4 mm today
5 days, 7 mm today
```

- Non c'è un elemento grafico. Un `<Canvas>` è un riquadro dell'interfaccia che dipingi tu. Il layout gli dà il suo posto, come a
  qualsiasi elemento (`grow`: lo spazio che il titolo lascia libero). Poi Zinc chiama la sua funzione `onDraw` con quel riquadro: `x`, `y`, `w`, `h`.
- `chart` disegna con le funzioni della [parte 1 delle lezioni](../learn/README.md#the-lessons): `rect`, `rrect`, `drawText`.
- Misura tutto a partire da `x` e `y`, l'angolo del riquadro, mai dall'angolo della finestra.
- Le barre vengono da un signal, `rain()`. Un Canvas viene ridipinto a ogni frame, quindi un nuovo giorno si vede appena il signal cambia.
- Le dimensioni sono parti del riquadro (`w / 8`, `(h - 24) / 10`): ingrandisci la finestra e il grafico cresce con lei.

**Prova tu:** disegna i giorni di pioggia (più di 5 mm) con un blu più scuro. Disegna una linea all'altezza della media della settimana.

## Disegnalo con il canvas del web

**Cosa vedrai:** la stessa settimana, come una linea morbida sopra un blu che sfuma nel terreno.

![Una linea blu morbida attraverso 3, 6, 2, 4 e 7 mm, riempita sotto con un blu che sfuma verso il basso](img/chart-canvas.png)

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

Clicca due volte *Add a day*: le stesse due righe di prima.

- Lo stesso `<Canvas onDraw>`, disegnato con le chiamate del `<canvas>` del web ([`zinc:canvas`](../plugins/canvas2d.md), parte 4 delle
  lezioni). Il codice di un tutorial web sui grafici si legge allo stesso modo.
- `ctx.begin(x, y, w, h)` dà al contesto il riquadro del Canvas. Da lì, `(0, 0)` è l'angolo del riquadro, e fuori da esso non si
  disegna nulla. `ctx.end()` lo chiude.
- Un tracciato si costruisce punto per punto, poi `stroke` ne disegna il contorno e `fill` ne dipinge l'interno. Qui la linea viene prima
  tracciata, poi chiusa lungo il terreno e riempita.
- `bezierCurveTo` fa di ogni pezzo della linea una curva. I suoi primi due punti rendono la curva piatta alle due estremità, così i pezzi si
  uniscono senza spigoli.
- Un gradiente è una vernice che cambia lungo una linea. `createLinearGradient(0, 0, 0, ground)` va dall'alto verso il basso: un blu
  trasparente che sfuma fino a sparire.
- Quale scegliere? `zinc:gfx` per riquadri, cerchi, testo e immagini; `zinc:canvas` per curve, contorni, tratteggi e gradienti.

**Prova tu:** disegna su ogni giorno un punto bianco con un contorno blu (`arc`, `fill`, poi `stroke`).

## Stili come oggetti

**Cosa vedrai:** una batteria che si svuota e si riempie, e diventa rossa quando è scarica.

![Una batteria con un livello verde al 40% e due pulsanti, "Use it" e "Charge it"](img/style-objects.png)

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

Clicca due volte *Use it*, poi *Charge it*. Il terminale mostra:

```text
battery 40%
battery 20%
battery 40%
```

- `className` non è l'unico modo di dare un aspetto. `style` prende un oggetto di valori con nome, come in React Native:
  `{ fontSize: 28, color: '#1d1b18' }`. I nomi sono le proprietà del CSS scritte in una parola (`backgroundColor` per
  `background-color`); i numeri sono pixel.
- `StyleSheet.create` dà un nome a un gruppo di stili una volta sola, in cima al file: `styles.title`, `styles.button`. Usalo per gli stili
  che non cambiano mai.
- Una lista, `style={[a, b]}`, mette gli stili uno sopra l'altro; vince l'ultimo. Qui `styles.fill`, poi un oggetto di valori che
  cambiano.
- Quell'oggetto legge il signal: `width: level() * 3.86` (3,86 pixel per ogni percento), e un colore scelto con `? :`. Cambia il
  signal e la barra lo segue.
- Quale scegliere? Le classi sono brevi da scrivere e da leggere. Gli oggetti vanno bene per i valori che calcoli, e sono quelli che usa il codice
  di React Native. Puoi dare entrambi allo stesso elemento. Un programma senza alcun `className` è più leggero: Zinc lascia fuori il codice che legge le classi.
- Tutte le proprietà: [Object styles and StyleSheet](../ui.md#object-styles-and-stylesheet).

**Prova tu:** aggiungi un terzo pulsante che svuota subito la batteria. Rendi la barra arancione tra il 20% e il 50%.

## I tuoi componenti

**Cosa vedrai:** due schede di ricette. Ogni ingrediente ha un numero, un meno e un più.

![Due schede bianche, "Pancakes" con uova e tazze di latte, "Lemonade" con limoni, ognuna con i pulsanti meno e più](img/own-components.png)

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

Clicca due volte il più delle uova, il meno del latte, poi il meno dei limoni. Il terminale mostra:

```text
pancakes: 3 eggs
pancakes: 4 eggs
pancakes: 0 cups of milk
lemonade: 2 lemons
```

- Un componente è una funzione che restituisce elementi. Il suo nome comincia con una lettera maiuscola, e lo usi come qualsiasi elemento:
  `<Card title="Pancakes">`.
- Quello che scrivi su di esso (`title="Pancakes"`, `start={2}`) arriva in `props`, un oggetto i cui campi sono elencati da un'`interface`:
  `props.title`, `props.start`.
- Quello che metti tra `<Card>` e `</Card>` arriva come `props.children`, una funzione. `{props.children()}` lo mette dove vuoi
  nella scheda.
- `Stepper` tiene il suo numero in un signal creato al suo interno. Ogni `<Stepper>` ha il suo, quindi le uova e i limoni non lo condividono.
- Un componente dice a chi lo usa che cosa è successo con una funzione che ha ricevuto, `onChange`. Chi lo usa decide che cosa fare; qui
  stampa una riga.
- Un componente può contenere anche un disegno: un `<Canvas>` al suo interno crea un indicatore, un quadrante o un misuratore che usi come un `<Button>`.

**Prova tu:** dai a `Stepper` una prop `max` e fermati lì. Aggiungi una terza scheda.

## Animazioni e transizioni

**Cosa vedrai:** un interruttore che accende la luce, e la pagina sfuma in un giallo caldo. Una campana oscilla quando la suoni.

![Su una pagina giallo pallido, un interruttore verde acceso e un pulsante tondo dorato "Ring" girato di lato](img/animation.png)

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

Clicca l'interruttore, poi la campana. Il terminale mostra:

```text
the light is on
ring!
the bell is still again
```

- Una **transizione** addolcisce un cambiamento. La pagina ha `transition-colors duration-500`: quando il suo colore cambia, Zinc passa dal vecchio
  colore al nuovo in 500 millisecondi. Il tuo codice cambia il valore una volta sola; non esegue nulla a ogni frame.
- Il pomello scorre allo stesso modo: `transition-transform` addolcisce il suo `translateX` da 0 a 40 pixel, e `ease-out` parte veloce e
  rallenta alla fine.
- Un'**animazione** la fa partire il tuo codice. `Animated` è quello di React Native. `swing` è un `Animated.Value`, un numero che si muove, e
  `style={{ rotate: swing.get() }}` fa girare la campana con quel valore, in gradi.
- `Animated.timing` porta il valore a `toValue` in `duration` millisecondi. `Animated.spring` lo fa rimbalzare fin lì come una molla.
  `Animated.sequence` le esegue una dopo l'altra, e `start` prende una funzione da chiamare alla fine.
- Quale scegliere? Una transizione per uno stato che cambia: acceso, spento, scelto, aperto. Un'animazione per un movimento con una storia sua: uno
  scossone, un rimbalzo, un ciclo.
- Un oggetto di stile dice la stessa cosa delle classi con `transitionProperty` e `transitionDuration`. Altro in
  [Transitions](../ui.md#transitions) e [Animated](../ui.md#animated-react-natives-api).

**Prova tu:** fai ingrandire la campana mentre suona (`scale`). Rendi l'interruttore più lento, poi più veloce.

## Una scena dentro un'interfaccia

**Cosa vedrai:** un pannello con un pulsante, accanto a un acquario dove nuotano dei pesci. Clicca un pesce per dargli da mangiare: cresce.

![Un pannello bianco "Aquarium, 3 fish" con un pulsante "Add a fish", accanto ad acqua blu con un pesce rosa, uno dorato e uno verde](img/scene-in-interface.png)

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

Clicca *Add a fish*, poi il pesce rosa e il pesce dorato. Il terminale mostra:

```text
1 fish in the tank
2 fish in the tank
3 fish in the tank
fed the pink fish, it is 70 pixels long
fed the gold fish, it is 70 pixels long
```

- I pesci sono sprite di una scena ([`zinc:stage`](../reference/stage.md)), come nelle lezioni da 13 a 15. Ognuno si muove in `onUpdate`,
  si disegna in `onDraw` e registra una zona di tocco.
- La scena vive in un `<Canvas>`. Il suo `onDraw` chiama `stage.drawIn(x, y, w, h)`, che dispone e disegna il palco nel riquadro
  del Canvas. Lo `(0, 0)` del palco è l'angolo del riquadro, e `stage.width`, `stage.height` ne sono la dimensione.
- Il terzo argomento di `render` chiama `stage.update(dt)` a ogni frame: dà il puntatore alle zone di tocco e chiama `onUpdate`. (Un
  programma che è solo una scena chiama `stage.frame(dt)`, che fa entrambe le metà.)
- Ogni lato riceve i suoi clic. *Add a fish* è un pulsante dell'interfaccia: il suo `onClick` chiama `addFish`. Un clic su un pesce va alla
  zona di tocco del pesce. Niente della scena esce dal suo riquadro, nemmeno le sue zone: un pesce mezzo fuori dalla vasca non prende mai un
  clic destinato al pannello.
- Il palco non ha una dimensione prima di essere disegnato la prima volta, per questo `onUpdate` aspetta `stage.width`.
- L'acqua è lo sfondo del Canvas stesso (`bg-[#2b6f9e]`).

**Prova tu:** fai girare i pesci quando mangiano. Aggiungi un pulsante che svuota la vasca (`stage.removeChildren()`).

## Un'interfaccia dentro una scena

**Cosa vedrai:** dei palloncini salgono nel cielo. Un cartello di legno porta un titolo e un pulsante che aggiunge un palloncino. Clicca un palloncino
per farlo scoppiare. Trascina il cartello dalla sua barra marrone.

![Un cielo blu con palloncini che salgono e, al centro, un cartello color crema con una barra marrone, "5 balloons" e un pulsante "Add a balloon"](img/interface-in-scene.png)

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

Fai scoppiare il palloncino verde, trascina il cartello in basso a sinistra, poi clicca *Add a balloon* sopra il palloncino dorato dietro il cartello. Il
terminale mostra (dopo i cinque palloncini dell'inizio):

```text
pop! 4 balloons left
a new balloon, 5 in the sky
```

- La scena riempie la finestra: un solo `<Canvas className="w-full h-full">` la disegna con `drawIn`.
- Il cartello è uno sprite: disegna la tavola e la sua barra. L'interfaccia sul cartello è una `<View className="absolute">` posta sopra di esso
  con `style={{ left: signX(), top: signY() + 28 }}`. Zinc disegna sopra un Canvas gli elementi che vengono dopo di lui, quindi il pannello si vede
  sulla tavola.
- A ogni frame, dopo `stage.update(dt)`, il programma copia la posizione del cartello in due signal, `signX` e `signY`. Trascina il
  cartello e il pannello lo segue. (La scena parte dall'angolo della finestra, quindi `x` e `y` del cartello sono posizioni della finestra.)
- Il pulsante appartiene all'interfaccia: il suo `onClick` aggiunge un palloncino. Sotto il pannello, il cartello registra una zona di tocco che non
  fa nulla. Copre i palloncini dietro, quindi un clic sul pulsante non fa mai scoppiare anche un palloncino.
- I palloncini sono figli di uno sprite a parte, `sky`, aggiunto prima del cartello: salgono dietro di esso.

**Prova tu:** metti sul cartello un secondo pulsante che fa scoppiare tutti i palloncini. Fai pendere il cartello da un palloncino e salire con lui.

## Dove andare dopo

- [Quattro modi di scrivere un programma](styles.md): gli stili a disegno, scena, Canvas e interfaccia affiancati, e come si mescolano.
- [zinc:ui in profondità](../ui.md): ogni chiave di stile, gli eventi, lo scorrimento, i livelli, le transizioni.
- [Riferimento di zinc:stage](../reference/stage.md), [zinc:canvas](../plugins/canvas2d.md), [riferimento di zinc:gfx](../reference/gfx.md).
- [Il kit UI](../ui-kit.md): pulsanti, finestre di dialogo, menu e schede già pronti, per quando preferisci non crearli.
