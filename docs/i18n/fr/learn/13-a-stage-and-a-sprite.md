---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 13. Une scène et un sprite

**Ce que vous allez voir :** trois balles de tailles différentes roulent de gauche à droite sur une scène bleu foncé, chacune à
sa vitesse, et reviennent à gauche quand elles sortent de la fenêtre.

![Une balle rose, une bleue et une dorée sur un fond bleu foncé](img/13-a-stage-and-a-sprite.png)

La partie 3 écrit des programmes sous forme de **scène** : une scène qui contient des objets, chaque objet étant un petit
programme à lui, qui sait où il se trouve et comment se dessiner. Si vous avez fait des jeux Flash avec ActionScript 3, ou
utilisé Haxe et OpenFL, c'est la même idée, avec les mêmes noms. Elle utilise le module `zinc:stage`, et dessine avec les
fonctions de `zinc:gfx` de la partie 1.

## Le code

Le projet se trouve dans [`samples/13-a-stage-and-a-sprite`](samples/13-a-stage-and-a-sprite/). `src/main.ts` :

```ts
import { onFrame, rrect, width } from 'zinc:gfx';
import { Stage, Sprite, uiState } from 'zinc:stage';

class Ball extends Sprite {
  color: u32 = 0xffffff;
  speed: number = 100;   // pixels per second, to the right

  override onAddedToStage(): void {
    console.log(`The ${this.name} joined the stage.`);
  }

  override onUpdate(dt: number): void {
    this.x += this.speed * dt;
    if (this.x > width()) this.x = -this.width;   // gone on the right: back on the left
    uiState.dirty = true;                         // it moved: the stage must be drawn again
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, this.color, 255);    // (0, 0) is the ball's own top left corner
  }
}

function makeBall(name: string, color: u32, y: number, size: number, speed: number): Ball {
  const ball = new Ball(name);
  ball.color = color;
  ball.y = y;
  ball.width = size;
  ball.height = size;
  ball.speed = speed;
  return ball;
}

const stage = new Stage();
stage.color = 0x14213d;
stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));
stage.addChild(makeBall('blue ball', 0x5ec2f2, 170, 80, 60));
stage.addChild(makeBall('gold ball', 0xe8b06a, 300, 40, 200));
console.log(`The stage holds ${stage.numChildren} balls.`);

let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the pink ball is at x = ${Math.round(stage.getChildAt(0).x)}.`);
    told = true;
  }
});
```

Le terminal affiche :

```text
The pink ball joined the stage.
The blue ball joined the stage.
The gold ball joined the stage.
The stage holds 3 balls.
After 1.00 seconds the pink ball is at x = 120.
```

## Objets, classes et sprites

Dans la partie 1, une balle était faite de deux variables, `x` et `y`, et la fonction d'image la dessinait. Avec trois balles,
il vous faudrait six variables, trois vitesses, trois couleurs, et une fonction d'image qui grossit à chaque nouvelle balle.
Une scène met les nombres de chaque balle **à l'intérieur de la balle** : un objet.

Une **classe** est le plan d'un objet : ce qu'il contient et ce qu'il sait faire. `class Ball extends Sprite` veut dire « une
Ball est un Sprite, avec une couleur et une vitesse en plus ». `Sprite` vient de `zinc:stage` et possède déjà ce dont tout
objet d'une scène a besoin : une position `x`, `y` (depuis le coin en haut à gauche de son parent), une taille `width`,
`height`, un `name`, et des enfants. `new Ball('pink ball')` fabrique un objet à partir du plan ; vous pouvez en fabriquer
autant que vous voulez, chacun avec ses propres nombres.

Un sprite ne se dessine pas quand vous le voulez : Zinc appelle ses méthodes au bon moment. Vous écrivez celles dont vous
avez besoin, avec le mot `override` (vous remplacez ce que fait `Sprite`, c'est-à-dire rien) :

| Méthode | Quand Zinc l'appelle |
|---|---|
| `onAddedToStage()` | une fois, quand l'objet rejoint la scène |
| `onUpdate(dt)` | à chaque image : le faire avancer de `dt` secondes |
| `onDraw(w, h)` | quand la scène est dessinée : le dessiner, avec `(0, 0)` à son propre coin en haut à gauche et `w`, `h` sa taille |

La **scène** est la racine du tout. `stage.frame(dt)`, appelée depuis `onFrame`, fait une image complète : elle appelle
`onUpdate` sur chaque objet, puis, si quelque chose a changé, efface la fenêtre avec `stage.color` et appelle chaque `onDraw`,
dans l'ordre où les objets ont été ajoutés (le dernier est au-dessus).

## Ligne par ligne

- `import { Stage, Sprite, uiState } from 'zinc:stage';` la scène, la classe de base des objets, et l'état de l'image.
- `class Ball extends Sprite { ... }` le plan d'une balle. Entre les accolades : ses champs et ses méthodes.
- `color: u32 = 0xffffff;` un champ : chaque balle a une couleur, blanche tant que personne ne la change. `speed: number = 100;`
  pareil pour la vitesse.
- `override onAddedToStage(): void` se lance quand `addChild` met la balle sur la scène. `this` est la balle elle-même :
  `this.name` est le nom qu'on lui a donné.
- `override onUpdate(dt: number): void` se lance à chaque image. `this.x += this.speed * dt;` fait avancer cette balle à sa
  propre vitesse, comme dans la leçon 2.
- `if (this.x > width()) this.x = -this.width;` quand elle est sortie à droite, on la remet juste en dehors, à gauche.
- `uiState.dirty = true;` dit à la scène que l'image a changé. Une scène où rien ne le fait ne dessine rien : la dernière
  image reste à l'écran, et l'ordinateur se repose. Ici les balles bougent toujours, donc elles le font toujours.
- `override onDraw(w: number, h: number): void` dessine la balle. `rrect(0, 0, w, h, w / 2, ...)` est un cercle qui remplit la
  boîte de la balle. `(0, 0)` n'est pas le coin de la fenêtre : c'est le coin de la balle elle-même, où qu'elle soit. Zinc y
  déplace le dessin pour vous.
- `function makeBall(...)` fabrique une balle et règle ses champs, si bien que trois balles tiennent en trois lignes plus bas.
  `new Ball(name)` fabrique l'objet ; `return ball;` le rend.
- `const stage = new Stage();` la scène. `stage.color = 0x14213d;` son fond, bleu foncé.
- `stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));` met une balle rose à 60 pixels du haut, large de 60 pixels,
  qui roule à 120 pixels par seconde. L'ajouter appelle son `onAddedToStage`.
- `stage.numChildren` le nombre d'objets que contient la scène. `stage.getChildAt(0)` le premier, la balle rose.
- `onFrame((dt: number) => { stage.frame(dt); ... });` la boucle d'images de la partie 1 passe chaque image à la scène. Le reste
  compte une seconde et affiche où est la balle rose : 120 pixels par seconde pendant une seconde, soit 120 pixels depuis
  son point de départ.

## À vous de jouer

- Ajoutez une quatrième balle : une ligne `stage.addChild(makeBall(...))` de plus. Rien d'autre ne change.
- Donnez aussi une vitesse verticale à `Ball`, et faites rebondir les balles sur les bords, comme dans le *À vous de jouer*
  de la leçon 2.
- Retirez `uiState.dirty = true;` et lancez : les balles bougent (leur `x` change) mais l'image reste immobile, parce que
  personne ne demande à la scène de dessiner.
- Faites une seconde classe, `Square extends Sprite`, qui dessine un carré et tombe au lieu de rouler. Mettez des balles et
  des carrés sur la même scène.
- Dans `onDraw`, écrivez le nom de la balle sous elle avec `drawText` (leçon 5) : `drawText(f, 0, h + 4, this.name, 0xffffff, 255, 0)`.

## Suite

[14. Enfants et coordonnées locales](14-children-and-local-coordinates.md) : des objets dans des objets, et une lune qui tourne
autour d'une planète qui tourne autour du soleil.
