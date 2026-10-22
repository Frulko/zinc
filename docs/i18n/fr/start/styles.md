---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Quatre façons d'écrire un programme

Zinc vous permet d'afficher des choses à l'écran de quatre façons. Elles tournent sur le même moteur, dans la même fenêtre, avec les mêmes commandes
(`zinc new`, `zinc run`, `zinc dev`) ; elles diffèrent par la manière de penser l'écran. Choisissez celle qui vous semble naturelle, ou celle
qui convient à ce que vous faites. Vous pouvez les mélanger, et changer plus tard : le langage, le son, les fichiers et le réseau sont les mêmes dans
les quatre.

| | Dessin | Scène | Canvas | Interface |
| --- | --- | --- | --- | --- |
| Module | `zinc:gfx` | `zinc:stage` | `zinc:canvas` | `zinc:ui` |
| Comme | Processing, p5.js, LÖVE | ActionScript 3 (Flash), Haxe et OpenFL | le `<canvas>` du web | React, Solid, React Native |
| Vous écrivez | une fonction qui dessine toute l'image, à chaque image | des objets qui se dessinent chacun eux-mêmes, dans un arbre | la même fonction d'image, avec les appels du canvas du web | les éléments de l'écran, une seule fois, en JSX |
| Idéal pour | les jeux, les animations, l'art, un premier programme | les applications et les jeux sur d'anciennes tablettes, les objets que l'on touche et fait glisser | le code de canvas du web, les dessins vectoriels, les graphiques | les applications, les formulaires, les listes, les réglages, les outils |
| Pour commencer | `zinc new game` | `zinc new stage` | `zinc new canvas` | `zinc new desktop-app` |
| Leçons | [1 à 6](../learn/README.md#the-lessons) | [13 à 16](../learn/13-a-stage-and-a-sprite.md) | [17 à 20](../learn/17-paths-and-fills.md) | [7 à 12](../learn/07-components.md) |

## Le même programme, quatre fois

Une balle rebondit dans la fenêtre. Un clic (ou une touche du doigt) sur la balle change sa couleur et ajoute un point au score, en haut à gauche.
Le voici dans chaque style. Les quatre programmes ont le même aspect :

![Une balle dorée sur fond sombre, « Score: 2 » en haut à gauche](img/bounce.png)

Chaque version est un petit projet dans [`docs/start/samples/`](samples/), lancé comme une leçon : `zinc run docs/start/samples/drawing`
(ou `scene`, `canvas`, `interface`). Chacun écrit une ligne quand vous touchez la balle :

```text
hit: score 1, the ball is blue
hit: score 2, the ball is gold
```

### Dessin (`zinc:gfx`)

[`samples/drawing/src/main.ts`](samples/drawing/src/main.ts) :

```ts
import { onFrame, clear, rrect, font, drawText, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const label = font('sans', 20);

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  // a press on the ball: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown) {
    const dx = pointerX() - x, dy = pointerY() - y;
    if (dx * dx + dy * dy <= R * R) {
      color = (color + 1) % COLORS.length;
      score++;
      console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
    }
  }
  wasDown = down;

  // draw the whole picture again
  clear(0x1c1b20);
  rrect(x - R, y - R, 2 * R, 2 * R, R, COLORS[color], 255);
  drawText(label, 16, 12, `Score: ${score}`, 0xffffff, 255, 0);
});
```

- Tout vit dans des variables : où est la balle, sa vitesse, sa couleur, le score.
- Une fonction s'exécute environ 60 fois par seconde. Elle déplace la balle, regarde la souris, puis repeint toute la fenêtre, en
  partant du fond.
- Personne ne prévient le programme d'un clic : il interroge `pointerDown()` à chaque image et compare avec l'image précédente
  (`wasDown`) pour repérer le moment où le bouton est enfoncé. Ensuite, il mesure la distance jusqu'au centre de la balle.

### Scène (`zinc:stage`)

[`samples/scene/src/main.ts`](samples/scene/src/main.ts) :

```ts
import { onFrame, rrect, font, drawText, width, height } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const label = font('sans', 20);

class Score extends Sprite {
  points: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(label, 0, 0, `Score: ${this.points}`, 0xffffff, 255, 0);
  }
}

class Ball extends Sprite {
  vx: number = 150;           // its speed, in pixels per second
  vy: number = 110;
  color: i32 = 0;             // which colour of COLORS it has
  override onUpdate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > width() - this.width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height() - this.height) this.vy = -this.vy;
    uiState.dirty = true;     // it moved: draw the next frame
  }
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, COLORS[this.color], 255);           // (0, 0) is the ball's own corner
    registerTapZone('ball', 0, 0, w, h, () => this.hit());
  }
  hit(): void {
    this.color = (this.color + 1) % COLORS.length;
    score.points++;
    console.log(`hit: score ${score.points}, the ball is ${NAMES[this.color]}`);
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
const score = new Score('score');
score.x = 16;
score.y = 12;
const ball = new Ball('ball');
ball.x = 70;                  // the corner: the centre is at 100, 80
ball.y = 50;
ball.width = 60;
ball.height = 60;
stage.addChild(ball);
stage.addChild(score);
onFrame((dt: number) => stage.frame(dt));
```

- La balle et le score sont des objets, chacun une classe avec ses propres champs. La scène les contient, comme un théâtre contient des acteurs.
- Chaque objet se dessine dans ses propres coordonnées : `(0, 0)` est le coin supérieur gauche de la balle, où qu'elle soit. Zinc déplace le
  dessin au bon endroit.
- La balle dit où l'on peut la toucher (`registerTapZone`) pendant qu'elle se dessine, et donne la fonction à appeler. La scène trouve la zone
  sous le doigt et appelle `hit()`.
- `uiState.dirty = true` demande une nouvelle image. Une scène où rien ne bouge ne dessine rien du tout, et c'est pour cela que les anciennes tablettes l'aiment.

### Canvas (`zinc:canvas`)

[`samples/canvas/src/main.ts`](samples/canvas/src/main.ts) :

```ts
import { onFrame, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const COLORS = ['#f27aa6', '#5ec2f2', '#e8b06a', '#7bd389'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const ctx = new CanvasRenderingContext2D();

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  ctx.begin(0, 0, width(), height());          // the canvas is the whole window
  ctx.fillStyle = '#1c1b20';
  ctx.fillRect(0, 0, width(), height());

  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  // a press inside the ball's path: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown && ctx.isPointInPath(pointerX(), pointerY())) {
    color = (color + 1) % COLORS.length;
    score++;
    console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
  }
  wasDown = down;
  ctx.fillStyle = COLORS[color];
  ctx.fill();

  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';
  ctx.fillText(`Score: ${score}`, 16, 12);
  ctx.end();
});
```

- C'est la même fonction d'image que dans le style dessin ; les appels de dessin sont ceux du web : `fillStyle`, `beginPath`, `arc`, `fill`, `fillText`.
  Le code d'une page web ou d'un tutoriel MDN se lit de la même façon.
- `ctx.begin(0, 0, width(), height())` fait de toute la fenêtre le canvas ; il n'y a ni page, ni élément `<canvas>`, ni JSX.
- Les couleurs sont des chaînes CSS (`'#f27aa6'`, `'white'`, `'rgba(0, 0, 0, 0.5)'`).
- Le clic est lu depuis `zinc:gfx`, comme dans le style dessin. Le canvas répond à la question « ce point est-il à l'intérieur de la forme que je viens de
  construire ? » avec `isPointInPath`.

### Interface (`zinc:ui`)

[`samples/interface/src/main.tsx`](samples/interface/src/main.tsx) :

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';

const COLORS = ['bg-[#f27aa6]', 'bg-[#5ec2f2]', 'bg-[#e8b06a]', 'bg-[#7bd389]'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
const [x, setX] = createSignal<number>(100);   // the centre of the ball
const [y, setY] = createSignal<number>(80);
const [color, setColor] = createSignal<i32>(0);
const [score, setScore] = createSignal<i32>(0);
let vx = 150, vy = 110;       // its speed, in pixels per second

function move(dt: number): void {
  setX(x() + vx * dt);
  setY(y() + vy * dt);
  if (x() < R || x() > width() - R) vx = -vx;
  if (y() < R || y() > height() - R) vy = -vy;
}

function hit(): void {
  setColor((color() + 1) % COLORS.length);
  setScore(score() + 1);
  console.log(`hit: score ${score()}, the ball is ${NAMES[color()]}`);
}

function App(): i32 {
  return <View className="w-full h-full">
    <View className={`absolute w-[60px] h-[60px] rounded-full ${COLORS[color()]}`}
      style={{ left: x() - R, top: y() - R }} onClick={hit} />
    <Text className="absolute text-xl text-white" style={{ left: 16, top: 12 }}>{`Score: ${score()}`}</Text>
  </View>;
}

render(App, 0x1c1b20, move);
```

- L'écran est décrit une seule fois : une boîte qui remplit la fenêtre, contenant une boîte ronde (la balle) et un texte (le score). L'aspect vient
  de `className`, comme avec Tailwind sur le web.
- Les valeurs que l'écran affiche sont des signaux : `setX`, `setColor`, `setScore` les modifient, et la balle et le texte suivent
  tout seuls. Rien n'est dessiné à la main.
- `onClick={hit}` sur la balle : Zinc appelle `hit` quand la balle est enfoncée puis relâchée. Le troisième argument de `render` est appelé à
  chaque image, ici pour déplacer la balle.
- Une interface brille avec les champs de texte, les listes, les boutons et les pages ; une balle qui bouge est le cas le plus difficile pour elle, et cela ne demande pourtant que peu de lignes.

### Ce qui change de l'un à l'autre

| | Dessin | Scène | Canvas | Interface |
| --- | --- | --- | --- | --- |
| Où est la balle | deux variables | les `x` et `y` du sprite | deux variables | deux signaux |
| Comment le clic est trouvé | la distance jusqu'au centre | une zone de toucher enregistrée par la balle | `isPointInPath` | `onClick` sur la boîte de la balle |
| Ce qui est dessiné à chaque image | tout | seulement quand quelque chose a changé | tout | seulement quand un signal a changé |
| Lignes | 36 | 49 | 43 | 34 |

## Chaque style en détail

### Le dessin, comme Processing

**Pour** un premier programme, les jeux, les animations, l'art génératif, les visualisations ; les personnes qui connaissent Processing, p5.js, LÖVE ou Pico-8.

**Comment vous pensez :** un folioscope. À chaque image, vous repartez d'une page vide et vous dessinez tout là où cela se trouve maintenant : le fond,
puis les formes, puis le texte par-dessus. Ce qui change vit dans vos variables ; déplacer quelque chose, c'est changer un nombre.

**Comment les événements arrivent à votre code :** vous demandez. `pointerX()`, `pointerY()` et `pointerDown()` disent où se trouvent la souris ou le premier doigt,
`isDown(Btn.Left)` si une touche ou un bouton de manette est maintenu, `keyCount()` et `keyName(i)` quelles touches sont arrivées depuis la dernière image.
Pour voir un clic, comparez avec l'image précédente. Rien ne vous appelle, sauf l'image.

**Sur les vieux appareils :** chaque image coûte ce qu'elle dessine, à chaque fois, même quand rien ne bouge. Les formes, les images et un peu de texte se redessinent
vite partout, c'est ainsi que fonctionnent les jeux ; appelez `keep()` sur une image où rien n'a changé pour réafficher gratuitement la dernière image.

### La scène, comme ActionScript 3 et Haxe

**Pour** les applications et les jeux faits de nombreux objets : des cartes que l'on fait glisser, des boutons que l'on touche, des listes qui défilent, des pages qui entrent en glissant ; les personnes qui ont fait
des jeux ou des applications Flash, ou qui connaissent Haxe/OpenFL, Starling ou Pixi. C'est le style qu'utilisent les démos de Zinc sur les anciennes tablettes (la HP TouchPad, la
Nexus 7, un Raspberry Pi 3 : [`examples/music-tree`](../../examples/music-tree/src/main.ts)).

**Comment vous pensez :** un théâtre de marionnettes. Chaque objet est une classe qui connaît sa place dans son parent (`x`, `y`), sa taille, ses enfants,
comment se dessiner (`onDraw`) et ce qu'il fait à chaque image (`onUpdate`). Un enfant bouge avec son parent. Une ligne ou une colonne peut placer
les enfants pour vous.

**Comment les événements arrivent à votre code :** un objet dit, pendant qu'il se dessine, quel rectangle reçoit un toucher (`registerTapZone`) ou un glissement
(`registerDragZone`), avec la fonction à appeler. `stage.frame(dt)` trouve la zone la plus haute sous le doigt et l'appelle. Les touches du clavier sont
lues depuis `zinc:gfx`, comme dans le style dessin.

**Sur les vieux appareils :** le plus léger des quatre. Rien n'est dessiné tant que rien n'a changé (`uiState.dirty`), il n'y a pas de feuille de style à
appliquer ni d'arbre d'éléments à comparer : un écran au repos ne coûte presque rien, et un écran qui bouge coûte ce qu'il dessine.

### Le canvas, à la manière du web

**Pour** les personnes qui connaissent le canvas du web, le code repris d'une page web ou d'un tutoriel JavaScript, les dessins vectoriels avec des courbes,
des contours et des dégradés, les graphiques.

**Comment vous pensez :** un stylo avec des réglages. Vous choisissez une couleur (`fillStyle`), une épaisseur de trait (`lineWidth`), puis vous construisez un tracé
(`moveTo`, `lineTo`, `arc`, `bezierCurveTo`) et vous le remplissez avec `fill` ou le contourez avec `stroke`. `translate`, `rotate` et `scale` déplacent la feuille sous le stylo ;
`save` et `restore` la remettent en place. Les réglages restent jusqu'à ce que vous les changiez, même à l'image suivante, comme sur le web.

**Comment les événements arrivent à votre code :** comme dans le style dessin, depuis `zinc:gfx` ; il n'y a pas d'`addEventListener`. `isPointInPath(x, y)` dit
si un point est à l'intérieur du tracé que vous venez de construire, ce qui rend faciles les tests de clic sur n'importe quelle forme.

**Sur les vieux appareils :** chaque courbe devient beaucoup de petits segments, et chaque forme est remplie avec des bords lisses (16 échantillons par pixel) et
des dégradés calculés pixel par pixel. Une fenêtre entière de courbes et de dégradés à chaque image est le travail le plus lourd des quatre pour une tablette de 2011.
Gardez la partie qui bouge petite, et dessinez une seule fois ce qui ne bouge pas dans un `Canvas` hors écran que vous affichez avec `drawImage`
([zinc:canvas](../plugins/canvas2d.md#drawing-targets)).

### L'interface, comme React et Solid

**Pour** les applications : formulaires, listes, réglages, outils, tableaux de bord, tout ce qui a des champs de texte et des boutons ; les personnes qui connaissent React, Solid,
React Native, ou HTML et CSS avec Tailwind.

**Comment vous pensez :** une description. Vous dites une seule fois ce que contient l'écran, sous forme de boîtes dans des boîtes (`<View>`, `<Text>`, `<Button>`,
`<Image>`), et leur aspect (`className="p-4 rounded-xl bg-white"`). Les valeurs qui changent sont des signaux ; changez-en une et chaque texte et
chaque style qui la lit suit. La mise en page place tout : vous donnez rarement un x ou un y.

**Comment les événements arrivent à votre code :** des attributs sur les éléments : `onClick`, `onPointerDown`, `onKeyDown`, `onInput`... Zinc appelle votre
fonction avec ce qui s'est passé ([les événements](../reference/ui-events.md)). Les champs de texte, le focus, le clavier, le défilement et les lecteurs
d'écran sont fournis.

**Sur les vieux appareils :** le plus de travail par élément : une mise en page flexbox, des styles, la mise en forme du texte, un arbre d'éléments gardé en mémoire. C'est le
bon choix pour un ordinateur, un Raspberry Pi 4 ou un téléphone des cinq dernières années ; sur une tablette plus ancienne, écrivez le même écran sous forme de scène
([`examples/GUIDELINES.md`](../../examples/GUIDELINES.md)).

## Comment les mélanger

- **Un dessin dans une interface.** `<Canvas className="grow" onDraw={fn} />` est une boîte de l'interface que vous dessinez vous-même :
  `fn(x, y, w, h)` reçoit sa place et sa taille et dessine avec `zinc:gfx`. [La leçon 11](../learn/11-drawing-in-an-interface.md) place une
  fleur à côté de boutons de cette façon.
- **Un Canvas dans une interface.** Le même `<Canvas onDraw>`, avec un contexte de canvas : `ctx.begin(x, y, w, h)` au début de `fn`,
  `ctx.end()` à la fin ([zinc:canvas](../plugins/canvas2d.md)).
- **Un Canvas dans un dessin.** Dans une seule fonction d'image, les appels de `zinc:gfx` et un contexte de canvas peuvent se relayer : `ctx.begin(x, y, w, h)`
  donne sa boîte au contexte, et ce que vous dessinez après `ctx.end()` passe par-dessus.
- **Dessin et Canvas dans une scène.** Le `onDraw` d'un sprite dessine avec `zinc:gfx` dans ses propres coordonnées ; un contexte de canvas y fonctionne aussi :
  `ctx.begin(0, 0, w, h)` dessine dans les coordonnées du sprite et bouge avec lui.
- **Une scène occupe toute la fenêtre**, tout comme le `render` d'une interface : un programme choisit l'un des deux pour son écran. Le dessin et le Canvas
  se placent dans l'un comme dans l'autre.

Vous hésitez ? Commencez par le style dessin et [les leçons](../learn/README.md) : tous les autres styles utilisent ce qu'elles enseignent. Pour choisir quel
type de programme faire (un jeu, une application, un serveur, une carte), voir [Choisir son type de programme](choose.md).
