---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 20. Texte et dégradés

**Ce que vous allez voir :** une affiche pour une fête d'été. Le ciel passe du rose en haut au jaune pâle en bas, un doux soleil
jaune brille au milieu, *Summer Fair* est écrit en grand et centré, la date est dans une pastille blanche juste dessous, et deux
petites lignes occupent les coins du bas.

![Une affiche : « Summer Fair » sur un ciel du rose au jaune avec un soleil lumineux, la date dans une pastille blanche](img/20-text-and-gradients.png)

## Le code

Le projet est dans [`samples/20-text-and-gradients`](samples/20-text-and-gradients/). `src/main.ts` :

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TITLE = 'Summer Fair';
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());

  // the sky: a linear gradient from the top of the window to the bottom
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#ff9a8b');
  sky.addColorStop(0.6, '#ffc3a0');
  sky.addColorStop(1, '#ffe8c2');
  ctx.fillGradient = sky;                    // on the web: ctx.fillStyle = sky
  ctx.fillRect(0, 0, 640, 400);

  // the sun: a radial gradient, yellow in the middle, fading out at the edge
  const glow = ctx.createRadialGradient(320, 250, 30, 320, 250, 150);
  glow.addColorStop(0, 'rgba(255, 236, 140, 1)');
  glow.addColorStop(1, 'rgba(255, 236, 140, 0)');
  ctx.fillGradient = glow;
  ctx.beginPath();
  ctx.arc(320, 250, 150, 0, 2 * Math.PI);
  ctx.fill();

  // the title, centred: textAlign says which point of the text x is
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(TITLE, 320, 130);

  // a label in a pill: measureText says how wide the text is, the pill is drawn around it
  ctx.font = '20px sans-serif';
  const words = 'Saturday, 10 am to 6 pm';
  const w = ctx.measureText(words).width;
  ctx.beginPath();
  ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(words, 320, 180);

  // two corners: x is where the text starts (left) or where it ends (right)
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#7b2cbf';
  ctx.textAlign = 'left';
  ctx.fillText('Town square', 24, 370);
  ctx.textAlign = 'right';
  ctx.fillText('Free entry', 616, 370);

  if (!told) {
    ctx.font = 'bold 56px sans-serif';
    console.log(`The title is ${Math.round(ctx.measureText(TITLE).width)} pixels wide, the label ${Math.round(w)}.`);
    told = true;
  }
  ctx.end();
});
```

Le terminal affiche (les nombres dépendent un peu de la police) :

```text
The title is 347 pixels wide, the label 229.
```

## Les dégradés

Un **dégradé** est une peinture qui change de couleur en chemin. Vous en créez un, vous lui donnez des couleurs à des points de sa
longueur, puis vous peignez avec :

- `ctx.createLinearGradient(x0, y0, x1, y1)` change le long d'une ligne, de (x0, y0) à (x1, y1). De (0, 0) à (0, 400), c'est de
  haut en bas.
- `ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)` change d'un cercle à un autre : ici, du petit cercle de rayon 30 au grand de
  rayon 150, tous deux autour du centre du soleil.
- `addColorStop(offset, colour)` place une couleur à un endroit du dégradé : `0` est le début, `1` la fin, `0.6` un peu après le
  milieu. Entre deux arrêts, les couleurs se mélangent. Une couleur peut être transparente : `rgba(255, 236, 140, 0)` est le même
  jaune avec une opacité de 0, si bien que le soleil se fond dans le ciel.

Sur le web, vous écririez `ctx.fillStyle = sky`. Zinc écrit `ctx.fillGradient = sky`, parce que dans Zinc un champ a un seul type
et `fillStyle` est un texte. Fixer de nouveau `fillStyle` à une couleur (`ctx.fillStyle = 'white'`) arrête le dégradé, comme sur
le web.

## Le texte

`ctx.fillText(text, x, y)` écrit du texte avec la couleur de `fillStyle`. Trois réglages disent comment :

- `ctx.font` s'écrit comme en CSS : `'bold 56px sans-serif'` (gras, 56 pixels de haut, la police sans-serif fournie avec Zinc), ou
  `'20px monospace'`.
- `ctx.textAlign` dit de quel point du texte `x` est la position : `'left'` (ou `'start'`, par défaut) son début, `'center'` son
  milieu, `'right'` sa fin. Ainsi `textAlign = 'center'` et `x = 320` centrent un texte dans une fenêtre de 640 pixels, quelle que
  soit sa longueur.
- `ctx.textBaseline` dit de quelle ligne du texte `y` est la position : `'alphabetic'` (par défaut) la ligne sur laquelle reposent
  les lettres, `'top'` le haut, `'middle'` le milieu. `'middle'` est le moyen facile de centrer un texte dans une boîte : `y` est
  le milieu de la boîte.

`ctx.measureText(text).width` dit quelle largeur aura un texte avec la police actuelle, avant de le dessiner : ici, pour
dimensionner la pastille blanche afin que la date y tienne avec 18 pixels de chaque côté.

## Ligne par ligne

- `const sky = ctx.createLinearGradient(0, 0, 0, 400);` un dégradé du haut de la fenêtre jusqu'en bas.
- `sky.addColorStop(0, '#ff9a8b'); sky.addColorStop(0.6, '#ffc3a0'); sky.addColorStop(1, '#ffe8c2');` rose en haut, pêche un peu
  sous le milieu, jaune pâle en bas.
- `ctx.fillGradient = sky; ctx.fillRect(0, 0, 640, 400);` toute la fenêtre, peinte avec le dégradé.
- `ctx.createRadialGradient(320, 250, 30, 320, 250, 150);` à l'intérieur du rayon 30, la première couleur ; au-delà de 150, la
  dernière ; entre les deux, un mélange.
- `ctx.arc(320, 250, 150, 0, 2 * Math.PI); ctx.fill();` le disque sur lequel la lueur est peinte : aussi grand que le cercle
  extérieur du dégradé, donc son bord est entièrement transparent et ne se voit pas.
- `ctx.font = 'bold 56px sans-serif'; ctx.fillText(TITLE, 320, 130);` le titre, son milieu à x = 320, posé sur la ligne y = 130.
- `const w = ctx.measureText(words).width;` la largeur de la date dans la police de 20 pixels.
- `ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);` la pastille : aussi large que le texte plus 18 pixels de chaque côté,
  40 de haut, bouts ronds (un rayon égal à la moitié de sa hauteur).
- `ctx.textBaseline = 'middle'; ctx.fillText(words, 320, 180);` la date, centrée dans la pastille dans les deux sens : 180 est le
  milieu de la pastille (160 + 40 / 2).
- `ctx.textAlign = 'left'; ctx.fillText('Town square', 24, 370);` commence à 24 pixels du bord gauche.
  `ctx.textAlign = 'right'; ctx.fillText('Free entry', 616, 370);` finit à 24 pixels du bord droit.

## À vous de jouer

- Faites du ciel un coucher de soleil : un dégradé linéaire de gauche à droite, `createLinearGradient(0, 0, 640, 0)`, de l'orange
  au violet.
- Peignez le titre avec un dégradé : `ctx.fillGradient = ...` avant son `fillText`. Zinc dessine le texte avec la première couleur
  du dégradé (une différence avec le web, listée sur [la page de zinc:canvas](../plugins/canvas2d.md#deviations-from-the-web)).
- Ajoutez une seconde pastille sous la première, *Free entry*, dimensionnée elle aussi avec `measureText`.
- Écrivez votre nom en bas au milieu, avec `textAlign = 'center'`.
- Faites pulser le soleil : donnez au dégradé radial un rayon extérieur de `150 + 20 * Math.sin(time)`, avec un `time` qui grandit
  de `dt`.

## Pour aller plus loin

Vous savez dessiner avec le canvas du web : tracés, remplissages et contours, transformations, animations, texte et dégradés.

- [La page de zinc:canvas](../plugins/canvas2d.md) : chaque fonction, un `Canvas` hors écran dont les pixels restent d'une image à
  l'autre, les images, et les différences avec le web.
- `zinc new canvas` crée un croquis à faire grandir : un ciel en dégradé, une étoile qui tourne, des bulles là où vous cliquez.
- [`examples/canvas/sketch`](../../examples/canvas/sketch/main.tsx) dans le dépôt : une horloge, un feu d'artifice et des formes
  dessinées dans des canvas au milieu d'une interface.
- [Le dessiner avec le canvas du web](../start/beyond.md#draw-it-with-the-webs-canvas) : un graphique tracé avec ces appels dans une
  boîte d'une interface, à côté de ses boutons.
- [Quatre façons d'écrire un programme](../start/styles.md) : comment le canvas se mêle aux autres styles. [Retour au début du
  parcours](README.md).
