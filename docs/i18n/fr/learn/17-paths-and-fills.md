---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 17. Tracés et remplissages

**Ce que vous allez voir :** une maison sur l'herbe verte sous un ciel bleu : des murs crème avec un contour brun, un toit rouge,
une porte aux coins arrondis, une fenêtre avec une croix, un chemin qui serpente dans l'herbe, et un soleil jaune.

![Une maison au toit rouge, avec une porte, une fenêtre et un chemin courbe, sous un ciel bleu et un soleil jaune](img/17-paths-and-fills.png)

La partie 4 dessine avec le **canvas du web** : le `CanvasRenderingContext2D` que les pages web utilisent pour dessiner dans un
`<canvas>`. Si vous avez suivi un tutoriel sur le canvas sur MDN ou dessiné des graphiques en JavaScript, vous connaissez déjà
ces appels. Dans Zinc, il n'y a ni page ni élément `<canvas>` : la fenêtre est le canvas, et la boucle d'images de la partie 1
appelle votre dessin. Il utilise le module `zinc:canvas`.

## Le code

Le projet est dans [`samples/17-paths-and-fills`](samples/17-paths-and-fills/). `src/main.ts` :

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());   // the canvas is the whole window

  // the sky and the grass: rectangles
  ctx.fillStyle = '#bde0fe';
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 300, 640, 100);

  // the sun: a full circle
  ctx.beginPath();
  ctx.arc(540, 80, 44, 0, 2 * Math.PI);
  ctx.fillStyle = 'gold';
  ctx.fill();

  // the walls of the house, filled then outlined
  ctx.fillStyle = '#f4e1c1';
  ctx.fillRect(220, 180, 200, 140);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5c4033';
  ctx.strokeRect(220, 180, 200, 140);

  // the roof: a path of three points, closed
  ctx.beginPath();
  ctx.moveTo(200, 184);
  ctx.lineTo(320, 90);
  ctx.lineTo(440, 184);
  ctx.closePath();
  ctx.fillStyle = '#c0392b';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!told) {
    console.log(`Is 320, 140 in the roof? ${ctx.isPointInPath(320, 140)}. And 120, 140? ${ctx.isPointInPath(120, 140)}.`);
  }

  // the door: a rectangle with round corners
  ctx.beginPath();
  ctx.roundRect(295, 240, 50, 80, 10);
  ctx.fillStyle = '#8e5a3c';
  ctx.fill();

  // a window: two lines make the cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(245, 210, 40, 40);
  ctx.strokeRect(245, 210, 40, 40);
  ctx.beginPath();
  ctx.moveTo(265, 210);
  ctx.lineTo(265, 250);
  ctx.moveTo(245, 230);
  ctx.lineTo(285, 230);
  ctx.lineWidth = 2;
  ctx.stroke();

  // a path in the grass: a curve
  ctx.beginPath();
  ctx.moveTo(320, 320);
  ctx.quadraticCurveTo(300, 360, 360, 400);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d9c5a0';
  ctx.stroke();

  ctx.end();
  told = true;
});
```

Le terminal affiche :

```text
Is 320, 140 in the roof? true. And 120, 140? false.
```

## Un stylo avec des réglages

Le canvas dessine comme un stylo que vous réglez avant chaque trait :

1. **Choisissez la peinture.** `ctx.fillStyle` est la couleur qui remplit les formes, `ctx.strokeStyle` la couleur des contours,
   `ctx.lineWidth` l'épaisseur des contours. Les couleurs s'écrivent comme sur le web : `'#c0392b'`, `'gold'`, `'rgb(255, 120, 60)'`,
   `'rgba(0, 0, 0, 0.5)'` (à moitié transparent).
2. **Construisez un tracé.** `ctx.beginPath()` en commence un nouveau. `moveTo(x, y)` lève le stylo et le pose en un point ;
   `lineTo(x, y)` trace une ligne droite jusqu'à un autre ; `arc(x, y, radius, start, end)` un morceau de cercle ;
   `quadraticCurveTo` et `bezierCurveTo` des courbes ; `rect` et `roundRect` des rectangles entiers ; `closePath()` revient au
   premier point. Rien ne s'affiche encore : un tracé n'est qu'un plan.
3. **Peignez-le.** `ctx.fill()` remplit l'intérieur du tracé avec `fillStyle` ; `ctx.stroke()` dessine son contour avec
   `strokeStyle` et `lineWidth`. Vous pouvez faire les deux, sur le même tracé.

Les rectangles sont si courants qu'ils ont des formes courtes qui n'ont pas besoin de tracé : `fillRect(x, y, w, h)` et
`strokeRect(x, y, w, h)`.

Les réglages restent jusqu'à ce que vous les changiez : après `ctx.lineWidth = 4`, chaque contour fait 4 pixels d'épaisseur, dans
cette image et dans les suivantes (sur le web aussi). C'est pourquoi ce programme fixe l'épaisseur avant chaque contour qui en
demande une autre.

`ctx.begin(0, 0, width(), height())` et `ctx.end()` sont propres à Zinc : ils disent « le canvas est toute la fenêtre, pour cette
image ». Tout ce que vous dessinez va entre les deux.

## Ligne par ligne

- `import { onFrame, width, height } from 'zinc:gfx';` la boucle d'images et la taille de la fenêtre, vues dans la partie 1.
  `zinc:canvas` ne fait que dessiner.
- `const ctx = new CanvasRenderingContext2D();` le contexte : le stylo et ses réglages. Sur le web, vous écririez
  `canvas.getContext('2d')` ; ici, vous le créez vous-même, une seule fois.
- `ctx.fillStyle = '#bde0fe'; ctx.fillRect(0, 0, 640, 400);` peint toute la fenêtre en bleu clair : chaque image part du ciel,
  comme `clear` dans la partie 1.
- `ctx.arc(540, 80, 44, 0, 2 * Math.PI);` un cercle autour de (540, 80) avec un rayon de 44 : un arc de l'angle 0 à un tour
  complet, `2 * Math.PI`. `fill()` en fait un disque.
- `ctx.strokeRect(220, 180, 200, 140);` le contour des murs, dessiné par-dessus le rectangle rempli. Un contour est centré sur le
  bord : la moitié de ses 4 pixels tombe dedans, l'autre moitié dehors.
- `ctx.moveTo(200, 184); ctx.lineTo(320, 90); ctx.lineTo(440, 184); ctx.closePath();` le toit : un triangle, du coin gauche
  jusqu'au sommet, puis au coin droit, et retour.
- `ctx.lineJoin = 'round';` les coins d'un contour : `'miter'` (pointu, par défaut), `'round'` (arrondi) ou `'bevel'` (coupé).
- `ctx.isPointInPath(320, 140)` demande si un point est dans le tracé en cours, ici le toit. C'est ainsi qu'un programme canvas
  sait qu'un clic est tombé sur une forme (la [page des styles](../start/styles.md#canvas-zinccanvas) l'utilise sur une balle).
- `ctx.roundRect(295, 240, 50, 80, 10);` un rectangle aux coins de rayon 10, ajouté à un nouveau tracé.
- `ctx.moveTo(265, 210); ctx.lineTo(265, 250); ctx.moveTo(245, 230); ctx.lineTo(285, 230);` un tracé de deux lignes séparées :
  `moveTo` lève le stylo entre elles. Un seul `stroke()` dessine les deux.
- `ctx.quadraticCurveTo(300, 360, 360, 400);` une courbe du point courant (320, 320) à (360, 400), tirée vers (300, 360) en
  chemin, comme le ferait un aimant.
- `ctx.lineCap = 'round';` les bouts d'une ligne ouverte : `'butt'` (coupé net au bout, par défaut), `'round'` (arrondi) ou
  `'square'` (carré).
- `told = true;` la ligne n'est affichée qu'à la première image.

## À vous de jouer

- Peignez le soleil avec un épais contour orange : `ctx.lineWidth = 6; ctx.strokeStyle = 'orange'; ctx.stroke();` après son `fill()`.
- Dessinez une seconde fenêtre à droite de la porte.
- Ajoutez une cheminée sur le toit : un `fillRect` dessiné avant le toit, pour que le toit en couvre le bas.
- Dessinez une barrière le long de l'herbe avec une boucle : `for (let x = 10; x < 640; x += 30) ctx.fillRect(x, 280, 8, 40);`.
- Remplacez la courbe quadratique par `ctx.bezierCurveTo(260, 350, 420, 370, 360, 400)` : deux aimants, un chemin en forme de S.
- Toutes les fonctions du contexte, et les quelques différences avec le web, sont dans [la page de zinc:canvas](../plugins/canvas2d.md).

## Suite

[18. Transformations](18-transforms.md) : déplacez, tournez et réduisez la feuille sous le stylo, et dessinez une horloge.
