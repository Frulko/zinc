---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 18. Transformations

**Ce que vous allez voir :** deux horloges de gare qui indiquent dix heures dix, une grande à droite et une petite copie en haut à
gauche, chacune avec soixante graduations, une aiguille des heures, une aiguille des minutes et une trotteuse rouge.

![Une grande horloge et une petite horloge, toutes deux à dix heures dix](img/18-transforms.png)

## Le code

Le projet est dans [`samples/18-transforms`](samples/18-transforms/). `src/main.ts` :

```ts
import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const HOURS = 10, MINUTES = 10;
let told = false;

// One hand, drawn straight up from the centre, after turning by `turn` (0 to 1: a whole turn).
function hand(turn: number, length: number, thickness: number, color: string): void {
  ctx.save();                                   // remember the transform...
  ctx.rotate(turn * 2 * Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(0, -length);
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();                                // ...and go back to it
}

// A clock of radius 150 around (0, 0): wherever the transform puts (0, 0).
function clock(): void {
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d1b18';
  ctx.stroke();

  for (let i = 0; i < 60; i++) {                // 60 ticks: draw one at the top, turn by a sixtieth, again
    ctx.beginPath();
    ctx.moveTo(0, -136);
    ctx.lineTo(0, i % 5 === 0 ? -112 : -126);
    ctx.lineWidth = i % 5 === 0 ? 6 : 2;
    ctx.stroke();
    ctx.rotate((2 * Math.PI) / 60);
  }                                             // 60 sixtieths: a whole turn, back where it started

  hand((HOURS + MINUTES / 60) / 12, 70, 10, '#1d1b18');
  hand(MINUTES / 60, 110, 6, '#1d1b18');
  hand(0.25, 120, 2, '#e63946');
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#e63946';
  ctx.fill();
}

// Where the transform puts (0, 0), and how much it scales: e and f, and a (a is the scale when nothing is turned).
function tell(where: string): void {
  const m = ctx.getTransform();
  console.log(`${where}, (0, 0) is at ${m.e}, ${m.f} and the scale is ${m.a.toFixed(2)}.`);
}

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#f3f1ec';
  ctx.fillRect(0, 0, 640, 400);

  ctx.save();
  ctx.translate(410, 200);                      // (0, 0) is now the middle of the big clock
  clock();
  if (!told) tell('In the big clock');
  ctx.restore();

  ctx.save();
  ctx.translate(110, 110);                      // the small clock: move, then make everything smaller
  ctx.scale(0.45, 0.45);
  clock();
  if (!told) tell('In the small clock');
  ctx.restore();

  if (!told) tell('After restore');
  ctx.end();
  told = true;
});
```

Le terminal affiche :

```text
In the big clock, (0, 0) is at 410, 200 and the scale is 1.00.
In the small clock, (0, 0) is at 110, 110 and the scale is 0.45.
After restore, (0, 0) is at 0, 0 and the scale is 1.00.
```

## Déplacer la feuille

Dessiner soixante graduations autour d'un cercle avec `Math.cos` et `Math.sin` fonctionne, mais cela fait beaucoup de calcul. Un
canvas a une façon plus simple : au lieu de déplacer le stylo, **déplacez la feuille**. Une transformation change l'endroit où
tombe tout ce qui est dessiné après elle :

- `ctx.translate(x, y)` déplace la feuille : `(0, 0)` est maintenant à l'endroit qui était `(x, y)`.
- `ctx.rotate(angle)` fait tourner la feuille autour de `(0, 0)`, d'un angle en radians (un tour complet vaut `2 * Math.PI`), dans
  le sens des aiguilles d'une montre.
- `ctx.scale(sx, sy)` agrandit ou réduit tout : `0.45` est un peu moins de la moitié. L'épaisseur des traits diminue aussi.

Elles s'additionnent : `translate(110, 110)` puis `scale(0.45, 0.45)` met `(0, 0)` en (110, 110) et dessine à 45 %. L'horloge est
donc écrite une seule fois, autour de `(0, 0)`, comme si elle était seule sur la page ; l'endroit où elle tombe et sa taille se
décident avant de l'appeler.

Les graduations s'en servent : dessinez une graduation vers le haut, tournez la feuille d'un soixantième de tour, dessinez la même
graduation, soixante fois. Après soixante rotations d'un soixantième, la feuille est revenue à sa place de départ.

`ctx.save()` retient la transformation (ainsi que les couleurs et les réglages de ligne) ; `ctx.restore()` revient à ce qui a été
retenu. Chaque aiguille fait tourner la feuille de son propre angle, entre un `save` et un `restore`, si bien que l'aiguille
suivante part de la feuille bien droite. Les `save` peuvent être emboîtés, comme l'aiguille dans l'horloge : chaque `restore`
défait le dernier `save`.

`ctx.getTransform()` donne la transformation sous forme de six nombres, `a` à `f` : `e` et `f` sont l'endroit où tombe `(0, 0)`,
`a` et `d` l'échelle quand rien n'est tourné. Le programme les affiche pour montrer les trois états.

## Ligne par ligne

- `const HOURS = 10, MINUTES = 10;` l'heure que montrent les horloges.
- `function hand(turn, length, thickness, color)` dessine une aiguille. `turn` va de 0 (droit vers le haut, midi) à 1 (un tour
  complet).
- `ctx.rotate(turn * 2 * Math.PI);` fait tourner la feuille de cette part de tour complet.
- `ctx.moveTo(0, 16); ctx.lineTo(0, -length);` une ligne qui part d'un peu sous le centre jusqu'à `length` pixels au-dessus. Sur la
  feuille, elle est toujours droite vers le haut ; c'est la rotation qui la fait pointer vers l'heure.
- `function clock()` dessine une horloge entière autour de `(0, 0)` : le cadran, les graduations, les aiguilles et le centre rouge.
- `ctx.lineTo(0, i % 5 === 0 ? -112 : -126);` une graduation sur cinq (`i % 5 === 0` : `i` divisé par 5 ne laisse rien) est plus longue
  et plus épaisse : ce sont les heures.
- `hand((HOURS + MINUTES / 60) / 12, ...)` l'aiguille des heures : 10 heures et 10 minutes font 10,17 heures, sur 12 pour un tour.
- `hand(MINUTES / 60, ...)` l'aiguille des minutes : 10 minutes sur 60. `hand(0.25, ...)` la trotteuse à un quart : 15 secondes.
- `ctx.save(); ctx.translate(410, 200); clock(); ... ctx.restore();` la grande horloge, avec son milieu en (410, 200).
- `ctx.translate(110, 110); ctx.scale(0.45, 0.45);` la petite horloge : le même `clock()`, déplacé et réduit. L'ordre compte : le
  `translate` se compte en pixels de la fenêtre ; le `scale` réduit ensuite ce qui vient après lui.
- `if (!told) tell('After restore');` après le dernier `restore`, la feuille est redevenue normale : `(0, 0)` est le coin de la fenêtre.

## À vous de jouer

- Ajoutez une troisième horloge, à l'envers : `ctx.rotate(Math.PI)` après son `translate`.
- Affichez l'heure réelle : `const now = new Date();` puis `now.getHours()`, `now.getMinutes()`, `now.getSeconds()`, et faites
  avancer la trotteuse avec `now.getSeconds() / 60`.
- Rendez la grande horloge plus large que haute : `ctx.scale(1.3, 1)` après son `translate`. Regardez ce qui arrive aux graduations.
- Oubliez un `ctx.restore()` dans `hand` et observez : chaque aiguille tourne à partir de l'endroit où la précédente s'est arrêtée.
- Écrivez des chiffres sur le cadran : dans la boucle, à une graduation sur cinq, `ctx.fillText(...)` (la leçon 20 montre comment
  choisir la police et centrer un texte).

## Suite

[19. Une animation](19-animation.md) : un moulin à vent dont les pales tournent et des nuages qui dérivent, image après image.
