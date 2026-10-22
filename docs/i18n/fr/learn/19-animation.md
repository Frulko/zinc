---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 19. Une animation

**Ce que vous allez voir :** un moulin à vent sur l'herbe verte. Ses quatre pales rouges tournent régulièrement, un quart de tour
par seconde, et des nuages blancs dérivent dans le ciel bleu, revenant à gauche quand ils sortent à droite.

![Un moulin à vent à quatre pales rouges devant un nuage, sur l'herbe verte](img/19-animation.png)

## Le code

Le projet est dans [`samples/19-animation`](samples/19-animation/). `src/main.ts` :

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

Après une seconde, le terminal affiche :

```text
After 1.00 seconds the blades turned 90 degrees.
```

## Une animation, c'est une image, encore et encore

Il n'y a rien de nouveau à apprendre pour faire bouger un canvas : c'est le folioscope de la leçon 2. À chaque image, `onFrame`
vous donne `dt`, le temps écoulé depuis l'image précédente ; vous faites avancer vos nombres d'une vitesse multipliée par `dt`,
puis vous redessinez toute l'image depuis le ciel. Le canvas ne se souvient pas de ce qu'il a dessiné à l'image d'avant (sur le
web, vous appelleriez d'abord `clearRect` ; ici, le `fillRect` du ciel recouvre tout).

Deux choses que le canvas **retient** d'une image à l'autre : ses réglages et sa transformation. Un `translate` ou un `rotate` qui
n'est pas défait est encore là à l'image suivante, puis à la suivante, et s'additionne : le moulin s'envolerait. C'est pourquoi
les pales sont dessinées entre `save()` et `restore()`. Il en va de même pour `fillStyle` ou `lineWidth` : réglez ce qu'il vous
faut avant de dessiner.

L'angle grandit sans fin (90 degrés après une seconde, 900 après dix) ; une rotation de 900 degrés a le même aspect qu'une de 180,
donc rien n'oblige à le ramener. Les nuages, eux, en ont besoin : `%` (le reste d'une division) ramène `cloudX` à 0 quand il
atteint 800.

## Ligne par ligne

- `const TURN_SPEED = Math.PI / 2;` un quart de tour (la moitié de `Math.PI`, qui est un demi-tour) par seconde.
- `angle += TURN_SPEED * dt;` les pales tournent de la vitesse multipliée par la durée de l'image : elles tournent aussi vite sur
  une machine lente que sur une rapide.
- `cloudX = (cloudX + 40 * dt) % 800;` les nuages avancent de 40 pixels par seconde ; au-delà de 800, ils repartent de 0.
- `Math.round((angle * 180) / Math.PI)` transforme les radians en degrés pour le message : un demi-tour fait `Math.PI` radians,
  180 degrés.
- `function cloud(x, y)` trois cercles dans un seul tracé, remplis d'un coup : un nuage. `arc` ajoute un cercle au tracé sans
  lever le stylo, et le remplissage couvre les trois.
- `cloud(cloudX - 100, 80);` le premier nuage part 100 pixels à gauche de la fenêtre, donc il glisse au lieu de surgir.
- `cloud(((cloudX + 400) % 800) - 100, 130);` le second nuage est 400 pixels derrière le premier, sur la même boucle.
- `ctx.moveTo(300, 320); ... ctx.closePath();` la tour : plus étroite en haut qu'en bas.
- `ctx.translate(320, 170); ctx.rotate(angle);` le moyeu du moulin devient `(0, 0)`, tourné de l'angle.
- `ctx.moveTo(0, 0); ctx.lineTo(18, -20); ctx.lineTo(10, -120); ctx.lineTo(-6, -120);` une pale, qui part du moyeu vers le haut.
  `ctx.rotate(Math.PI / 2)` tourne d'un quart : la boucle dessine les quatre pales avec les mêmes lignes.
- `ctx.restore();` défait d'un coup le `translate` et les quatre rotations, retour au coin de la fenêtre.
- `ctx.arc(320, 170, 9, ...)` le moyeu noir, dessiné en dernier, par-dessus les pales.

## À vous de jouer

- Faites souffler plus fort le vent : doublez `TURN_SPEED` et la vitesse des nuages.
- Faites tourner les pales dans l'autre sens : soustrayez au lieu d'additionner.
- Retirez `ctx.save()` et `ctx.restore()` puis lancez : les déplacements et les rotations s'additionnent image après image, et les
  pales s'envolent hors de la fenêtre.
- Laissez un clic accélérer les pales : lisez `pointerDown()` dans `zinc:gfx`, comme dans la [page des styles](../start/styles.md),
  et ajoutez à la vitesse à chaque appui. Puis ralentissez un peu à chaque image : `speed *= 0.99`.
- Faites tomber la nuit : un ciel sombre, une lune (un cercle) et quelques étoiles (de petits `fillRect` à des endroits fixes).

## Suite

[20. Texte et dégradés](20-text-and-gradients.md) : une affiche avec un ciel qui passe d'une couleur à une autre, un soleil
lumineux et du texte centré.
