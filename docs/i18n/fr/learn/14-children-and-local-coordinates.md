---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 14. Enfants et coordonnées locales

**Ce que vous allez voir :** un soleil jaune au milieu de la fenêtre. Une petite planète grise tourne vite autour de lui ; une
planète bleue, la Terre, tourne lentement plus loin, avec son nom dessous et une petite lune qui tourne autour d'elle.

![Un soleil jaune, une planète grise près de lui, et la Terre bleue avec sa lune et son nom](img/14-children-and-local-coordinates.png)

## Le code

Le projet se trouve dans [`samples/14-children-and-local-coordinates`](samples/14-children-and-local-coordinates/). `src/main.ts` :

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

Le terminal affiche où est la lune au départ, puis une seconde plus tard :

```text
The moon is at 34, 0 in the earth, at 504, 200 in the window.
The moon is at -34, 5 in the earth, at 410, 289 in the window.
```

## Un arbre d'objets

Un objet d'une scène peut contenir d'autres objets : ses **enfants**. `sun.addChild(earth)` met la Terre dans le soleil, et
`earth.addChild(moon)` met la lune dans la Terre. Les objets forment un arbre, comme des dossiers dans des dossiers :

```text
stage
└── sun
    ├── mercury
    └── earth
        ├── moon
        └── label ("Earth")
```

Le `x` et le `y` d'un enfant se comptent **depuis son parent**, et non depuis la fenêtre : ce sont ses coordonnées locales. La
lune sait seulement « je suis à 34 pixels à droite du centre de la Terre ». Elle ne sait pas où est la Terre, et n'en a pas
besoin : quand la Terre bouge, tout ce qu'elle contient bouge aussi. C'est ainsi que la lune suit la Terre autour du soleil
sans une ligne de code pour cela, et que le nom reste sous la Terre.

Pour savoir où se trouve quelque chose dans la fenêtre, additionnez les positions en descendant l'arbre. Au départ, le soleil
est en 320, 200 dans la fenêtre, la Terre à 150, 0 du soleil, la lune à 34, 0 de la Terre : 320 + 150 + 34 = 504 et
200 + 0 + 0 = 200. C'est ce que calculent `windowX` et `windowY`, en remontant de la lune jusqu'à la scène avec `parent`.

Un parent est dessiné avant ses enfants, donc les enfants sont au-dessus, et les enfants dans l'ordre où ils ont été ajoutés.

## Ligne par ligne

- `class Body extends Sprite` une seule classe pour le soleil, les planètes et la lune : ils ne diffèrent que par leurs nombres.
- `orbit`, `speed`, `angle` à quelle distance de son parent le corps tourne, à quelle vitesse, et de combien il a tourné. Un
  angle se compte en radians : un tour complet vaut `2 * Math.PI`, environ 6,28.
- `if (this.orbit === 0) return;` le soleil ne tourne pas : `return` quitte `onUpdate` tout de suite.
- `this.x = Math.cos(this.angle) * this.orbit;` et `this.y = Math.sin(this.angle) * this.orbit;` le point situé à cet angle
  sur un cercle de rayon `orbit` autour du `(0, 0)` du parent (la leçon 11 utilisait les deux mêmes lignes pour les
  pétales).
- `rrect(-this.radius, -this.radius, this.radius * 2, ...)` le disque est dessiné autour de `(0, 0)`, et non à partir de lui :
  le `x`, `y` du corps est donc son centre, et un enfant qui tourne autour de `(0, 0)` tourne autour du centre.
- `class Name extends Sprite` un sprite qui n'écrit que du texte. `-textWidth(small, this.text, 0) / 2` commence le texte à
  la moitié de sa largeur vers la gauche, pour qu'il soit centré sous le centre du parent.
- `b.x = orbit;` chaque corps commence à droite de son parent, avant de tourner.
- `function windowX(node: DisplayObject): number` additionne les `x` depuis le nœud jusqu'à la scène. `DisplayObject` est le
  type de tout objet d'une scène (`Sprite` en est un autre nom). `n` est le nœud où l'on se trouve ;
  `n = (n as DisplayObject).parent` monte d'un niveau. `parent` vaut `null` au-dessus de la scène : la boucle s'arrête là.
- `sun.x = 320; sun.y = 200;` le centre du soleil, dans la fenêtre : le soleil est un enfant de la scène, qui commence au coin
  en haut à gauche.
- `label.y = 22;` le nom, 22 pixels sous le centre de la Terre. C'est un enfant de la Terre : il tourne avec elle.
- `stage.addChild(sun); sun.addChild(mercury); ...` construit l'arbre dessiné plus haut.

## À vous de jouer

- Ajoutez Mars : `body('mars', 0xe76f51, 12, 110, 1)`, un enfant du soleil.
- Donnez à Mars deux petites lunes, enfants de Mars, à des distances et des vitesses différentes.
- Déplacez tout le système : changez `sun.x` dans un `onUpdate` du soleil (ou dans `onFrame`) et regardez tout suivre.
- Faites de la lune un enfant du soleil au lieu de la Terre (`sun.addChild(moon)`) : elle tourne maintenant autour du soleil, à
  34 pixels de lui.
- Chaque objet a `mouseX` et `mouseY` : le pointeur dans ses propres coordonnées. Affichez `earth.mouseX` dans `onFrame` et
  déplacez la souris sur la Terre : il est proche de 0 quand le pointeur est sur son centre, où que soit la Terre.

## Suite

[15. Toucher et glisser](15-taps-and-drags.md) : un bouton que l'on touche et des cartes que l'on prend et déplace.
