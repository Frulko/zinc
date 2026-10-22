---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# Jenseits der Komponenten

`View`, `Text`, `Button` und die anderen Elemente bauen die meisten Bildschirme: Formulare, Listen, Einstellungen. Früher oder später willst du etwas,
das sie nicht haben: ein Diagramm, einen Schalter, der gleitet, eine Karte nach deinem Geschmack, ein Spielbrett neben den Buttons. Diese Seite zeigt sieben Wege,
weiterzugehen. Jeder ist ein kleines Programm, das du ausführen und ändern kannst.

Jedes Programm ist ein Projekt in [`docs/start/samples/`](samples/) und läuft wie eine Lektion: `zinc run docs/start/samples/chart-gfx`. Die Seite
setzt voraus, dass du die Lektionen zur Oberfläche kennst ([7 bis 11](../learn/07-components.md)); die letzten zwei Teile nutzen auch eine Szene
([Lektionen 13 bis 15](../learn/13-a-stage-and-a-sprite.md)).

1. [Zeichne es selbst](#draw-it-yourself): ein `Canvas` und `zinc:gfx`.
2. [Zeichne es mit dem Canvas des Webs](#draw-it-with-the-webs-canvas): ein `Canvas` und `zinc:canvas`.
3. [Styles als Objekte](#styles-as-objects): `style` statt `className`.
4. [Eigene Komponenten](#components-of-your-own): Props, Kinder und ein eigener Zustand.
5. [Animationen und Übergänge](#animations-and-transitions): Dinge, die sich von allein bewegen.
6. [Eine Szene in einer Oberfläche](#a-scene-inside-an-interface): Sprites in einer Box der Oberfläche.
7. [Eine Oberfläche in einer Szene](#an-interface-inside-a-scene): Buttons auf einem Objekt der Szene.

## Zeichne es selbst

**Das wirst du sehen:** den Regen der Woche als Balken und einen Button, der einen Tag hinzufügt.

![Blaue Balken von 3, 6, 2, 4 und 7 mm unter dem Titel "Rain this week, in mm" und ein Button "Add a day"](img/chart-gfx.png)

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

Klicke zweimal auf *Add a day*. Das Terminal zeigt:

```text
4 days, 4 mm today
5 days, 7 mm today
```

- Es gibt kein Diagramm-Element. Ein `<Canvas>` ist eine Box der Oberfläche, die du selbst bemalst. Das Layout gibt ihm seinen Platz, wie jedem
  Element (`grow`: der Platz, den der Titel übrig lässt). Dann ruft Zinc seine `onDraw`-Funktion mit dieser Box auf: `x`, `y`, `w`, `h`.
- `chart` zeichnet mit den Funktionen aus [Teil 1 der Lektionen](../learn/README.md#the-lessons): `rect`, `rrect`, `drawText`.
- Miss alles ab `x` und `y`, der Ecke der Box, nie ab der Ecke des Fensters.
- Die Balken kommen aus einem Signal, `rain()`. Ein Canvas wird in jedem Frame neu gemalt, ein neuer Tag erscheint also, sobald sich das Signal ändert.
- Die Größen sind Anteile der Box (`w / 8`, `(h - 24) / 10`): Mach das Fenster größer, und das Diagramm wächst mit.

**Probier das aus:** Zeichne die Regentage (mehr als 5 mm) in einem dunkleren Blau. Zeichne eine Linie auf der Höhe des Durchschnitts der Woche.

## Zeichne es mit dem Canvas des Webs

**Das wirst du sehen:** dieselbe Woche als weiche Linie über einem Blau, das zum Boden hin verblasst.

![Eine weiche blaue Linie durch 3, 6, 2, 4 und 7 mm, darunter gefüllt mit einem Blau, das nach unten verblasst](img/chart-canvas.png)

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

Klicke zweimal auf *Add a day*: dieselben zwei Zeilen wie oben.

- Derselbe `<Canvas onDraw>`, gezeichnet mit den Aufrufen des `<canvas>` im Web ([`zinc:canvas`](../plugins/canvas2d.md), Teil 4 der
  Lektionen). Code aus einem Web-Tutorial über Diagramme liest sich genauso.
- `ctx.begin(x, y, w, h)` gibt dem Kontext die Box des Canvas. Ab dort ist `(0, 0)` die Ecke der Box, und außerhalb wird nichts
  gezeichnet. `ctx.end()` schließt sie.
- Ein Pfad entsteht Punkt für Punkt, dann zeichnet `stroke` seinen Umriss und `fill` füllt sein Inneres. Hier wird zuerst die Linie gezogen,
  dann am Boden geschlossen und gefüllt.
- `bezierCurveTo` macht aus jedem Stück der Linie eine Kurve. Ihre ersten zwei Punkte ziehen die Kurve an beiden Enden flach, die Stücke gehen also
  weich ineinander über.
- Ein Verlauf ist eine Farbe, die sich entlang einer Linie ändert. `createLinearGradient(0, 0, 0, ground)` geht von oben nach unten: ein
  durchsichtiges Blau, das zu nichts verblasst.
- Welches nehmen? `zinc:gfx` für Kästen, Kreise, Text und Bilder; `zinc:canvas` für Kurven, Umrisse, Strichlinien und Verläufe.

**Probier das aus:** Zeichne an jedem Tag einen weißen Punkt mit blauem Rand (`arc`, `fill`, dann `stroke`).

## Styles als Objekte

**Das wirst du sehen:** eine Batterie, die sich leert und füllt und rot wird, wenn sie fast leer ist.

![Eine Batterie mit grünem Füllstand bei 40 % und zwei Buttons, "Use it" und "Charge it"](img/style-objects.png)

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

Klicke zweimal auf *Use it*, dann auf *Charge it*. Das Terminal zeigt:

```text
battery 40%
battery 20%
battery 40%
```

- `className` ist nicht der einzige Weg, etwas zu gestalten. `style` nimmt ein Objekt mit benannten Werten, wie in React Native:
  `{ fontSize: 28, color: '#1d1b18' }`. Die Namen sind die Eigenschaften von CSS in einem Wort geschrieben (`backgroundColor` für
  `background-color`); Zahlen sind Pixel.
- `StyleSheet.create` benennt eine Gruppe von Styles einmal, oben in der Datei: `styles.title`, `styles.button`. Nimm es für Styles,
  die sich nie ändern.
- Eine Liste, `style={[a, b]}`, legt Styles übereinander; der letzte gewinnt. Hier `styles.fill`, dann ein Objekt mit Werten, die sich
  ändern.
- Dieses Objekt liest das Signal: `width: level() * 3.86` (3,86 Pixel pro Prozent) und eine Farbe, die mit `? :` gewählt wird. Ändere das
  Signal, und der Balken folgt.
- Welches nehmen? Klassen sind kurz zu schreiben und zu lesen. Objekte passen zu Werten, die du berechnest, und React-Native-Code benutzt sie. Du
  kannst einem Element beides geben. Ein Programm ganz ohne `className` ist leichter: Zinc lässt den Code weg, der Klassen liest.
- Jede Eigenschaft: [Object styles and StyleSheet](../ui.md#object-styles-and-stylesheet).

**Probier das aus:** Füge einen dritten Button hinzu, der die Batterie sofort leert. Mach den Balken orange zwischen 20 % und 50 %.

## Eigene Komponenten

**Das wirst du sehen:** zwei Rezeptkarten. Jede Zutat hat eine Zahl, ein Minus und ein Plus.

![Zwei weiße Karten, "Pancakes" mit Eiern und Tassen Milch, "Lemonade" mit Zitronen, jede mit Minus- und Plus-Buttons](img/own-components.png)

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

Klicke zweimal auf das Plus der Eier, auf das Minus der Milch und dann auf das Minus der Zitronen. Das Terminal zeigt:

```text
pancakes: 3 eggs
pancakes: 4 eggs
pancakes: 0 cups of milk
lemonade: 2 lemons
```

- Eine Komponente ist eine Funktion, die Elemente zurückgibt. Ihr Name beginnt mit einem Großbuchstaben, und du benutzt sie wie jedes Element:
  `<Card title="Pancakes">`.
- Was du an sie schreibst (`title="Pancakes"`, `start={2}`), kommt in `props` an, einem Objekt, dessen Felder ein `interface` auflistet:
  `props.title`, `props.start`.
- Was du zwischen `<Card>` und `</Card>` setzt, kommt als `props.children` an, eine Funktion. `{props.children()}` setzt es dorthin, wo du es
  in der Karte haben willst.
- `Stepper` hält seine Zahl in einem Signal, das in ihm entsteht. Jeder `<Stepper>` bekommt sein eigenes, die Eier und die Zitronen teilen sich also nichts.
- Eine Komponente sagt ihrem Besitzer, was passiert ist, über eine Funktion, die sie bekommen hat, `onChange`. Der Besitzer entscheidet, was er tut; hier
  schreibt er eine Zeile.
- Eine Komponente kann auch eine Zeichnung enthalten: Ein `<Canvas>` darin ergibt eine Anzeige, ein Zifferblatt oder ein Messgerät, das du wie einen `<Button>` benutzt.

**Probier das aus:** Gib `Stepper` eine Prop `max` und halte dort an. Füge eine dritte Karte hinzu.

## Animationen und Übergänge

**Das wirst du sehen:** einen Schalter, der das Licht anmacht, und die Seite wird sanft warmgelb. Eine Glocke schwingt, wenn du sie läutest.

![Auf einer blassgelben Seite ein grüner Schalter, der an ist, und ein runder goldener Button "Ring", zur Seite gedreht](img/animation.png)

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

Klicke auf den Schalter, dann auf die Glocke. Das Terminal zeigt:

```text
the light is on
ring!
the bell is still again
```

- Ein **Übergang** (Transition) macht eine Änderung sanft. Die Seite hat `transition-colors duration-500`: Wenn sich ihre Farbe ändert, geht Zinc von der alten
  Farbe zur neuen in 500 Millisekunden. Dein Code ändert den Wert einmal; er führt in keinem Frame etwas aus.
- Der Knopf gleitet genauso: `transition-transform` macht seinen `translateX` sanft von 0 auf 40 Pixel, und `ease-out` beginnt schnell und wird
  am Ende langsamer.
- Eine **Animation** startet dein Code. `Animated` ist das von React Native. `swing` ist ein `Animated.Value`, eine Zahl, die sich bewegt, und
  `style={{ rotate: swing.get() }}` dreht die Glocke damit, in Grad.
- `Animated.timing` bewegt den Wert in `duration` Millisekunden zu `toValue`. `Animated.spring` lässt ihn dort wie eine Feder federn.
  `Animated.sequence` spielt sie nacheinander ab, und `start` nimmt eine Funktion, die am Ende aufgerufen wird.
- Welches nehmen? Einen Übergang für einen Zustand, der sich ändert: an, aus, gewählt, offen. Eine Animation für eine Bewegung mit eigener Geschichte: ein
  Wackeln, ein Hüpfen, eine Schleife.
- Ein Style-Objekt sagt dasselbe wie die Klassen, mit `transitionProperty` und `transitionDuration`. Mehr in
  [Transitions](../ui.md#transitions) und [Animated](../ui.md#animated-react-natives-api).

**Probier das aus:** Lass die Glocke wachsen, während sie läutet (`scale`). Mach den Schalter langsamer, dann schneller.

## Eine Szene in einer Oberfläche

**Das wirst du sehen:** ein Feld mit einem Button, neben einem Aquarium, in dem Fische schwimmen. Klicke auf einen Fisch, um ihn zu füttern: Er wächst.

![Ein weißes Feld "Aquarium, 3 fish" mit einem Button "Add a fish", neben blauem Wasser mit einem rosa, einem goldenen und einem grünen Fisch](img/scene-in-interface.png)

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

Klicke auf *Add a fish*, dann auf den rosa und den goldenen Fisch. Das Terminal zeigt:

```text
1 fish in the tank
2 fish in the tank
3 fish in the tank
fed the pink fish, it is 70 pixels long
fed the gold fish, it is 70 pixels long
```

- Die Fische sind Sprites einer Szene ([`zinc:stage`](../reference/stage.md)), wie in den Lektionen 13 bis 15. Jeder bewegt sich in `onUpdate`,
  zeichnet sich in `onDraw` und meldet eine Tap-Zone an.
- Die Szene lebt in einem `<Canvas>`. Sein `onDraw` ruft `stage.drawIn(x, y, w, h)` auf, das die Bühne in der Box des Canvas anordnet und zeichnet.
  Das `(0, 0)` der Bühne ist die Ecke der Box, und `stage.width`, `stage.height` sind ihre Größe.
- Das dritte Argument von `render` ruft in jedem Frame `stage.update(dt)` auf: Es gibt den Zeiger an die Tap-Zonen weiter und ruft `onUpdate` auf. (Ein
  Programm, das nur eine Szene ist, ruft `stage.frame(dt)` auf, das beide Hälften erledigt.)
- Jede Seite bekommt ihre eigenen Klicks. *Add a fish* ist ein Button der Oberfläche: Sein `onClick` ruft `addFish` auf. Ein Klick auf einen Fisch geht an
  die Tap-Zone des Fischs. Nichts von der Szene reicht über ihre Box hinaus, ihre Zonen auch nicht: Ein Fisch, der halb aus dem Becken ragt, nimmt nie
  einen Klick, der für das Feld gedacht war.
- Die Bühne hat keine Größe, bevor sie zum ersten Mal gezeichnet wird, deshalb wartet `onUpdate` auf `stage.width`.
- Das Wasser ist der eigene Hintergrund des Canvas (`bg-[#2b6f9e]`).

**Probier das aus:** Lass die Fische umkehren, wenn sie gefüttert werden. Füge einen Button hinzu, der das Becken leert (`stage.removeChildren()`).

## Eine Oberfläche in einer Szene

**Das wirst du sehen:** Ballons steigen durch den Himmel. Ein Holzschild trägt einen Titel und einen Button, der einen Ballon hinzufügt. Klicke auf einen Ballon,
um ihn platzen zu lassen. Zieh das Schild an seinem braunen Balken.

![Ein blauer Himmel mit aufsteigenden Ballons und in der Mitte ein cremefarbenes Schild mit braunem Balken, "5 balloons" und einem Button "Add a balloon"](img/interface-in-scene.png)

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

Lass den grünen Ballon platzen, zieh das Schild nach unten und nach links, dann klicke auf *Add a balloon* über dem goldenen Ballon hinter dem Schild. Das
Terminal zeigt (nach den fünf Ballons vom Anfang):

```text
pop! 4 balloons left
a new balloon, 5 in the sky
```

- Die Szene füllt das Fenster: Ein `<Canvas className="w-full h-full">` zeichnet sie mit `drawIn`.
- Das Schild ist ein Sprite: Es zeichnet das Brett und seinen Balken. Die Oberfläche auf dem Schild ist ein `<View className="absolute">`, das mit
  `style={{ left: signX(), top: signY() + 28 }}` darüber liegt. Zinc zeichnet die Elemente, die nach einem Canvas kommen, über ihn, das Feld erscheint
  also auf dem Brett.
- In jedem Frame kopiert das Programm nach `stage.update(dt)` die Position des Schilds in zwei Signale, `signX` und `signY`. Zieh das
  Schild, und das Feld folgt ihm. (Die Szene beginnt an der Ecke des Fensters, `x` und `y` des Schilds sind also Positionen im Fenster.)
- Der Button gehört zur Oberfläche: Sein `onClick` fügt einen Ballon hinzu. Unter dem Feld meldet das Schild eine Tap-Zone an, die nichts
  tut. Sie deckt die Ballons dahinter ab, ein Klick auf den Button lässt also nie zusätzlich einen Ballon platzen.
- Die Ballons sind die Kinder eines eigenen Sprites, `sky`, das vor dem Schild hinzugefügt wird: Sie steigen hinter ihm auf.

**Probier das aus:** Setze einen zweiten Button auf das Schild, der jeden Ballon platzen lässt. Lass das Schild an einem Ballon hängen und mit ihm aufsteigen.

## Wie es weitergeht

- [Vier Wege, ein Programm zu schreiben](styles.md): die Stile Zeichnen, Szene, Canvas und Oberfläche nebeneinander und wie sie sich mischen.
- [zinc:ui im Detail](../ui.md): jeder Style-Schlüssel, die Ereignisse, Scrollen, Ebenen, Übergänge.
- [Referenz zu zinc:stage](../reference/stage.md), [zinc:canvas](../plugins/canvas2d.md), [Referenz zu zinc:gfx](../reference/gfx.md).
- [Das UI-Kit](../ui-kit.md): fertige Buttons, Dialoge, Menüs und Tabs, für den Fall, dass du sie lieber nicht selbst baust.
