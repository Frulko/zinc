---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# Au-delà des composants

`View`, `Text`, `Button` et les autres éléments construisent la plupart des écrans : formulaires, listes, réglages. Tôt ou tard, vous voulez
quelque chose qu'ils n'ont pas : un graphique, un interrupteur qui glisse, une carte à vous, un plateau de jeu à côté des boutons. Cette
page montre sept façons d'aller plus loin. Chacune est un petit programme que vous pouvez lancer et modifier.

Chaque programme est un projet de [`docs/start/samples/`](samples/), lancé comme une leçon : `zinc run docs/start/samples/chart-gfx`. La
page suppose que vous connaissez les leçons sur les interfaces ([7 à 11](../learn/07-components.md)) ; les deux dernières parties utilisent
aussi une scène ([leçons 13 à 15](../learn/13-a-stage-and-a-sprite.md)).

1. [Le dessiner soi-même](#draw-it-yourself) : un `Canvas` et `zinc:gfx`.
2. [Le dessiner avec le canvas du web](#draw-it-with-the-webs-canvas) : un `Canvas` et `zinc:canvas`.
3. [Les styles en objets](#styles-as-objects) : `style` au lieu de `className`.
4. [Vos propres composants](#components-of-your-own) : props, enfants et un état à eux.
5. [Animations et transitions](#animations-and-transitions) : des choses qui bougent toutes seules.
6. [Une scène dans une interface](#a-scene-inside-an-interface) : des sprites dans une boîte de l'interface.
7. [Une interface dans une scène](#an-interface-inside-a-scene) : des boutons sur un objet de la scène.

## Le dessiner soi-même

**Ce que vous allez voir :** la pluie de la semaine en barres, et un bouton qui ajoute un jour.

![Des barres bleues de 3, 6, 2, 4 et 7 mm sous le titre « Rain this week, in mm » et un bouton « Add a day »](img/chart-gfx.png)

[`samples/chart-gfx/src/main.tsx`](samples/chart-gfx/src/main.tsx) :

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

Cliquez deux fois sur *Add a day*. Le terminal affiche :

```text
4 days, 4 mm today
5 days, 7 mm today
```

- Il n'y a pas d'élément graphique. Un `<Canvas>` est une boîte de l'interface que vous peignez vous-même. La mise en page lui donne sa
  place, comme à tout élément (`grow` : la place que le titre laisse). Ensuite, Zinc appelle sa fonction `onDraw` avec cette boîte :
  `x`, `y`, `w`, `h`.
- `chart` dessine avec les fonctions de la [partie 1 des leçons](../learn/README.md#the-lessons) : `rect`, `rrect`, `drawText`.
- Mesurez tout à partir de `x` et `y`, le coin de la boîte, jamais à partir du coin de la fenêtre.
- Les barres viennent d'un signal, `rain()`. Un Canvas est repeint à chaque image : un nouveau jour apparaît dès que le signal change.
- Les tailles sont des parts de la boîte (`w / 8`, `(h - 24) / 10`) : agrandissez la fenêtre et le graphique grandit avec elle.

**À essayer :** dessinez les jours de pluie (plus de 5 mm) en bleu plus foncé. Tracez une ligne à la hauteur de la moyenne de la semaine.

## Le dessiner avec le canvas du web

**Ce que vous allez voir :** la même semaine, en une ligne douce au-dessus d'un bleu qui s'estompe jusqu'au sol.

![Une ligne bleue douce passant par 3, 6, 2, 4 et 7 mm, remplie en dessous d'un bleu qui s'estompe vers le bas](img/chart-canvas.png)

[`samples/chart-canvas/src/main.tsx`](samples/chart-canvas/src/main.tsx) :

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

Cliquez deux fois sur *Add a day* : les deux mêmes lignes que plus haut.

- Le même `<Canvas onDraw>`, dessiné avec les appels du `<canvas>` du web ([`zinc:canvas`](../plugins/canvas2d.md), partie 4 des
  leçons). Le code d'un tutoriel web sur les graphiques se lit de la même façon.
- `ctx.begin(x, y, w, h)` donne au contexte la boîte du Canvas. À partir de là, `(0, 0)` est le coin de la boîte, et rien n'est dessiné
  en dehors. `ctx.end()` la referme.
- Un tracé se construit point par point, puis `stroke` dessine son contour et `fill` peint son intérieur. Ici, la ligne est d'abord
  tracée, puis refermée le long du sol et remplie.
- `bezierCurveTo` fait de chaque morceau de la ligne une courbe. Ses deux premiers points aplatissent la courbe aux deux bouts, si bien
  que les morceaux se raccordent en douceur.
- Un dégradé est une peinture qui change le long d'une ligne. `createLinearGradient(0, 0, 0, ground)` va de haut en bas : un bleu
  transparent qui s'estompe jusqu'à disparaître.
- Lequel choisir ? `zinc:gfx` pour les boîtes, les cercles, le texte et les images ; `zinc:canvas` pour les courbes, les contours, les
  pointillés et les dégradés.

**À essayer :** dessinez un point blanc avec un contour bleu sur chaque jour (`arc`, `fill`, puis `stroke`).

## Les styles en objets

**Ce que vous allez voir :** une batterie qui se vide et se remplit, et devient rouge quand elle est presque vide.

![Une batterie avec un niveau vert à 40 % et deux boutons, « Use it » et « Charge it »](img/style-objects.png)

[`samples/style-objects/src/main.tsx`](samples/style-objects/src/main.tsx) :

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

Cliquez deux fois sur *Use it*, puis sur *Charge it*. Le terminal affiche :

```text
battery 40%
battery 20%
battery 40%
```

- `className` n'est pas la seule façon de donner un aspect. `style` prend un objet de valeurs nommées, comme dans React Native :
  `{ fontSize: 28, color: '#1d1b18' }`. Les noms sont les propriétés de CSS écrites en un seul mot (`backgroundColor` pour
  `background-color`) ; les nombres sont des pixels.
- `StyleSheet.create` nomme un groupe de styles une fois pour toutes, en haut du fichier : `styles.title`, `styles.button`. Servez-vous-en
  pour les styles qui ne changent jamais.
- Une liste, `style={[a, b]}`, superpose des styles ; le dernier l'emporte. Ici `styles.fill`, puis un objet de valeurs qui changent.
- Cet objet lit le signal : `width: level() * 3.86` (3,86 pixels par pourcent), et une couleur choisie avec `? :`. Changez le signal et
  la barre suit.
- Lequel choisir ? Les classes sont courtes à écrire et à lire. Les objets conviennent aux valeurs que vous calculez, et ce sont eux que
  le code React Native utilise. Vous pouvez donner les deux à un même élément. Un programme sans aucun `className` est plus léger : Zinc
  laisse de côté le code qui lit les classes.
- Toutes les propriétés : [Object styles and StyleSheet](../ui.md#object-styles-and-stylesheet).

**À essayer :** ajoutez un troisième bouton qui vide la batterie d'un coup. Rendez la barre orange entre 20 % et 50 %.

## Vos propres composants

**Ce que vous allez voir :** deux fiches de recette. Chaque ingrédient a un nombre, un moins et un plus.

![Deux cartes blanches, « Pancakes » avec des œufs et des tasses de lait, « Lemonade » avec des citrons, chacune avec des boutons moins et plus](img/own-components.png)

[`samples/own-components/src/main.tsx`](samples/own-components/src/main.tsx) :

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

Cliquez deux fois sur le plus des œufs, sur le moins du lait, puis sur le moins des citrons. Le terminal affiche :

```text
pancakes: 3 eggs
pancakes: 4 eggs
pancakes: 0 cups of milk
lemonade: 2 lemons
```

- Un composant est une fonction qui renvoie des éléments. Son nom commence par une majuscule, et vous l'utilisez comme n'importe quel
  élément : `<Card title="Pancakes">`.
- Ce que vous écrivez dessus (`title="Pancakes"`, `start={2}`) arrive dans `props`, un objet dont une `interface` liste les champs :
  `props.title`, `props.start`.
- Ce que vous mettez entre `<Card>` et `</Card>` arrive dans `props.children`, une fonction. `{props.children()}` le place où vous voulez
  dans la carte.
- `Stepper` garde son nombre dans un signal créé à l'intérieur. Chaque `<Stepper>` a le sien : les œufs et les citrons ne le partagent pas.
- Un composant dit à son propriétaire ce qui s'est passé grâce à une fonction qu'on lui a donnée, `onChange`. Le propriétaire décide quoi
  faire ; ici, il écrit une ligne.
- Un composant peut aussi contenir un dessin : un `<Canvas>` à l'intérieur fait une jauge, un cadran ou un compteur que vous utilisez comme
  un `<Button>`.

**À essayer :** donnez à `Stepper` une prop `max` et arrêtez-vous à cette valeur. Ajoutez une troisième carte.

## Animations et transitions

**Ce que vous allez voir :** un interrupteur qui allume la lumière, et la page vire au jaune chaud. Une cloche se balance quand vous la sonnez.

![Sur une page jaune pâle, un interrupteur vert allumé et un bouton rond doré « Ring » incliné sur le côté](img/animation.png)

[`samples/animation/src/main.tsx`](samples/animation/src/main.tsx) :

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

Cliquez sur l'interrupteur, puis sur la cloche. Le terminal affiche :

```text
the light is on
ring!
the bell is still again
```

- Une **transition** adoucit un changement. La page a `transition-colors duration-500` : quand sa couleur change, Zinc passe de l'ancienne
  couleur à la nouvelle en 500 millisecondes. Votre code change la valeur une seule fois ; il ne fait rien à chaque image.
- Le bouton de l'interrupteur glisse de la même façon : `transition-transform` adoucit son `translateX` de 0 à 40 pixels, et `ease-out`
  démarre vite et ralentit à la fin.
- Une **animation** est lancée par votre code. `Animated` vient de React Native. `swing` est une `Animated.Value`, un nombre qui bouge, et
  `style={{ rotate: swing.get() }}` fait tourner la cloche de cette valeur, en degrés.
- `Animated.timing` amène la valeur à `toValue` en `duration` millisecondes. `Animated.spring` la fait rebondir jusque-là comme un
  ressort. `Animated.sequence` les joue l'une après l'autre, et `start` prend une fonction à appeler à la fin.
- Lequel choisir ? Une transition pour un état qui change : allumé, éteint, choisi, ouvert. Une animation pour un mouvement qui a son
  histoire à lui : une secousse, un rebond, une boucle.
- Un objet de style dit la même chose que les classes avec `transitionProperty` et `transitionDuration`. Plus de détails dans
  [Transitions](../ui.md#transitions) et [Animated](../ui.md#animated-react-natives-api).

**À essayer :** faites grossir la cloche pendant qu'elle sonne (`scale`). Rendez l'interrupteur plus lent, puis plus rapide.

## Une scène dans une interface

**Ce que vous allez voir :** un panneau avec un bouton, à côté d'un aquarium où nagent des poissons. Cliquez sur un poisson pour le nourrir : il grossit.

![Un panneau blanc « Aquarium, 3 fish » avec un bouton « Add a fish », à côté d'une eau bleue avec un poisson rose, un doré et un vert](img/scene-in-interface.png)

[`samples/scene-in-interface/src/main.tsx`](samples/scene-in-interface/src/main.tsx) :

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

Cliquez sur *Add a fish*, puis sur le poisson rose et sur le poisson doré. Le terminal affiche :

```text
1 fish in the tank
2 fish in the tank
3 fish in the tank
fed the pink fish, it is 70 pixels long
fed the gold fish, it is 70 pixels long
```

- Les poissons sont des sprites d'une scène ([`zinc:stage`](../reference/stage.md)), comme dans les leçons 13 à 15. Chacun bouge dans
  `onUpdate`, se dessine dans `onDraw` et enregistre une zone de toucher.
- La scène vit dans un `<Canvas>`. Son `onDraw` appelle `stage.drawIn(x, y, w, h)`, qui met en page et dessine la scène dans la boîte du
  Canvas. Le `(0, 0)` de la scène est le coin de la boîte, et `stage.width`, `stage.height` sont sa taille.
- Le troisième argument de `render` appelle `stage.update(dt)` à chaque image : il transmet le pointeur aux zones de toucher et appelle
  `onUpdate`. (Un programme qui n'est qu'une scène appelle `stage.frame(dt)`, qui fait les deux moitiés.)
- Chaque côté reçoit ses propres clics. *Add a fish* est un bouton de l'interface : son `onClick` appelle `addFish`. Un clic sur un
  poisson va à la zone de toucher du poisson. Rien de la scène ne sort de sa boîte, ses zones non plus : un poisson à moitié hors de
  l'aquarium ne prend jamais un clic destiné au panneau.
- La scène n'a pas de taille avant d'être dessinée une première fois, c'est pourquoi `onUpdate` attend `stage.width`.
- L'eau est le fond du Canvas lui-même (`bg-[#2b6f9e]`).

**À essayer :** faites faire demi-tour aux poissons quand on les nourrit. Ajoutez un bouton qui vide l'aquarium (`stage.removeChildren()`).

## Une interface dans une scène

**Ce que vous allez voir :** des ballons montent dans le ciel. Une enseigne en bois porte un titre et un bouton qui ajoute un ballon.
Cliquez sur un ballon pour le crever. Faites glisser l'enseigne par sa barre brune.

![Un ciel bleu avec des ballons qui montent et, au milieu, une enseigne crème avec une barre brune, « 5 balloons » et un bouton « Add a balloon »](img/interface-in-scene.png)

[`samples/interface-in-scene/src/main.tsx`](samples/interface-in-scene/src/main.tsx) :

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

Crevez le ballon vert, faites glisser l'enseigne vers le bas et vers la gauche, puis cliquez sur *Add a balloon* au-dessus du ballon doré
derrière l'enseigne. Le terminal affiche (après les cinq ballons du début) :

```text
pop! 4 balloons left
a new balloon, 5 in the sky
```

- La scène remplit la fenêtre : un seul `<Canvas className="w-full h-full">` la dessine avec `drawIn`.
- L'enseigne est un sprite : il dessine le panneau et sa barre. L'interface sur l'enseigne est une `<View className="absolute">` placée
  par-dessus avec `style={{ left: signX(), top: signY() + 28 }}`. Zinc dessine par-dessus un Canvas les éléments qui le suivent, donc le
  panneau se voit sur l'enseigne.
- À chaque image, après `stage.update(dt)`, le programme copie la position de l'enseigne dans deux signaux, `signX` et `signY`. Faites
  glisser l'enseigne et le panneau la suit. (La scène commence au coin de la fenêtre, donc le `x` et le `y` de l'enseigne sont des
  positions dans la fenêtre.)
- Le bouton appartient à l'interface : son `onClick` ajoute un ballon. Sous le panneau, l'enseigne enregistre une zone de toucher qui ne
  fait rien. Elle recouvre les ballons derrière, donc un clic sur le bouton ne crève jamais un ballon en plus.
- Les ballons sont les enfants d'un sprite à part, `sky`, ajouté avant l'enseigne : ils montent derrière elle.

**À essayer :** mettez sur l'enseigne un deuxième bouton qui crève tous les ballons. Faites pendre l'enseigne à un ballon et montez avec lui.

## Où aller ensuite

- [Quatre façons d'écrire un programme](styles.md) : les styles dessin, scène, Canvas et interface côte à côte, et comment ils se mêlent.
- [zinc:ui en détail](../ui.md) : chaque clé de style, les événements, le défilement, les calques, les transitions.
- [Référence de zinc:stage](../reference/stage.md), [zinc:canvas](../plugins/canvas2d.md), [référence de zinc:gfx](../reference/gfx.md).
- [Le kit d'interface](../ui-kit.md) : des boutons, boîtes de dialogue, menus et onglets prêts à l'emploi, pour quand vous préférez ne pas les faire.
