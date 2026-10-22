---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 16. La mise en page et une boîte de défilement

**Ce que vous allez voir :** une page avec une barre de titre, *Fruits* à gauche et *Tap a fruit* à droite, et dessous une liste
blanche de vingt fruits qui ne tient pas dans la fenêtre. Faites-la défiler avec la molette de la souris, deux doigts sur un
pavé tactile, ou en la faisant glisser du doigt ; elle continue un peu quand vous lâchez. Touchez un fruit : sa ligne devient
grise et la barre de titre affiche *You chose: Lime*.

![Une barre de titre « Fruits » et « You chose: Lime » au-dessus d'une liste défilée, la ligne Lime en gris](img/16-layout-and-scrolling.png)

## Le code

Le projet est dans [`samples/16-layout-and-scrolling`](samples/16-layout-and-scrolling/). `src/main.ts` :

```ts
import { onFrame, rrect, rect, font, drawText, lineHeight } from 'zinc:gfx';
import {
  Stage, Sprite, ScrollBox, registerTapZone, beginScrollBox, endScrollBox, isLocalRectVisible, isZonePressed,
} from 'zinc:stage';

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry', 'Coconut', 'Fig', 'Grape', 'Kiwi', 'Lemon',
  'Lime', 'Mango', 'Melon', 'Orange', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Raspberry', 'Strawberry'];
const ROW = 44;                                   // the height of one row, in pixels
const bold = font('sans-bold', 22);
const plain = font('sans', 17);
let chosen = '';

// A line of text, centred in its height.
class Label extends Sprite {
  text: string = '';
  fontId: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(this.fontId, 0, (h - lineHeight(this.fontId)) / 2, this.text, 0x1d1b18, 255, 0);
  }
}

// The list of fruits: it draws only the rows you can see, and scrolls with a finger or the wheel.
class FruitList extends Sprite {
  box: ScrollBox = new ScrollBox();

  override onMeasure(): void {
    this.box.contentHeight = FRUITS.length * ROW;
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 12, 0xffffff, 255);
    beginScrollBox(this.box, 0, 0, w, h);         // what is drawn until endScrollBox stays inside the box
    for (let i = 0; i < FRUITS.length; i++) {
      const y = i * ROW - this.box.scrollY;       // scrolled: the rows move up
      if (!isLocalRectVisible(0, y, w, ROW)) continue;
      const id = `row ${i}`;
      if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);
      drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], 0x1d1b18, 255, 0);
      rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);
      registerTapZone(id, 0, y, w, ROW, () => {
        chosen = FRUITS[i];
        status.text = `You chose: ${chosen}`;
        console.log(`tapped ${chosen}, the list is scrolled by ${Math.round(this.box.scrollY)}`);
      });
    }
    endScrollBox();
  }
}

const stage = new Stage();
stage.color = 0xf3f1ec;
stage.direction = 'column';                       // children from top to bottom
stage.alignItems = 'stretch';                     // each one as wide as the stage
stage.setPaddingSymmetric(24, 20);
stage.gap = 12;

const header = new Sprite('header');
header.direction = 'row';                         // children from left to right
header.height = 40;
const title = new Label('title');
title.text = 'Fruits';
title.fontId = bold;
title.flex = 1;                                   // takes the room the status leaves
title.height = 40;
const status = new Label('status');
status.text = 'Tap a fruit';
status.fontId = plain;
status.width = 220;
status.height = 40;
header.addChild(title);
header.addChild(status);

const list = new FruitList('list');
list.flex = 1;                                    // the rest of the height

stage.addChild(header);
stage.addChild(list);
console.log(`${FRUITS.length} fruits, ${FRUITS.length * ROW} pixels of list`);
onFrame((dt: number) => stage.frame(dt));
```

Touchez *Cherry*, faites défiler de trois crans de molette, faites glisser la liste vers le haut de 100 pixels, puis touchez la
ligne sous le pointeur :

```text
20 fruits, 880 pixels of list
tapped Cherry, the list is scrolled by 0
tapped Lime, the list is scrolled by 244
```

## Lignes et colonnes

Jusqu'ici, chaque objet avait un `x` et un `y` que vous fixiez. Une page avec une barre de titre et une liste demanderait de
nombreux chiffres, tous à changer quand la fenêtre change de taille. À la place, un parent peut **placer ses enfants** :

| Champ | Ce qu'il fait |
|---|---|
| `direction = 'column'` | les enfants l'un sous l'autre, en partant du haut |
| `direction = 'row'` | les enfants côte à côte, en partant de la gauche |
| `gap` | pixels entre deux enfants |
| `setPaddingSymmetric(across, down)` | une marge vide à l'intérieur du parent : `across` à gauche et à droite, `down` en haut et en bas |
| `alignItems = 'stretch'` | chaque enfant prend toute la largeur d'une colonne (ou toute la hauteur d'une ligne) |
| `flex = 1` | sur un enfant : il prend la place que les autres laissent |

Ici, la scène est une colonne : la barre de titre (40 pixels de haut), puis la liste, qui prend le reste (`flex = 1`). La barre de
titre est une ligne : le titre prend ce que laisse le statut (220 pixels de large). Changez la taille de la fenêtre dans
`zinc.json` et tout tient encore, sans aucun chiffre à modifier. Avant de dessiner, la scène appelle le `onMeasure()` de chaque
objet : c'est le moment de fixer une taille ou une valeur dont la mise en page a besoin.

## Une boîte de défilement

La liste fait 880 pixels de haut (20 lignes de 44) et la fenêtre 400. Une **boîte de défilement** en montre une partie, et cette
partie change quand vous faites défiler :

- `box: ScrollBox = new ScrollBox();` garde l'état : `scrollY`, de combien la liste est défilée, et `contentHeight`, la hauteur
  de toute la liste.
- `beginScrollBox(this.box, 0, 0, w, h)` ... `endScrollBox()` : ce qui est dessiné entre les deux est coupé aux bords de la boîte,
  et les zones aussi. Une ligne à moitié cachée sous le titre ne reçoit aucun toucher sur sa moitié cachée.
- Vous dessinez chaque ligne à `i * ROW - this.box.scrollY` : quand la liste est défilée de 100, chaque ligne est 100 pixels plus
  haut.
- `stage.frame` fait le reste : la molette et le pavé tactile font défiler la boîte sous le pointeur ; un doigt qui bouge de plus
  de 12 pixels dessus la fait défiler (et ne touche rien), et un geste rapide la lance.

`isLocalRectVisible` dit si une ligne est dans la boîte : les lignes que vous ne voyez pas ne sont pas dessinées, donc une liste de
mille lignes n'en dessine pas plus de vingt.

## Ligne par ligne

- `const FRUITS = [...]` les vingt fruits, dans une liste. `const ROW = 44;` la hauteur d'une ligne.
- `let chosen = '';` le dernier fruit touché, `''` (vide) au départ.
- `class Label extends Sprite` un texte centré dans sa hauteur : `(h - lineHeight(this.fontId)) / 2` depuis le haut. `fontId` dit
  quelle police, donc le titre et le statut partagent la classe.
- `override onMeasure(): void` fixe la hauteur du contenu avant la mise en page et le dessin.
- `rrect(0, 0, w, h, 12, 0xffffff, 255);` la carte blanche de la liste, avant l'ouverture de la boîte.
- `for (let i = 0; i < FRUITS.length; i++)` une ligne par fruit. `continue` passe au fruit suivant quand cette ligne est hors de vue.
- ``const id = `row ${i}`;`` le nom de la zone de la ligne : `row 0`, `row 1`... `isZonePressed(id)` est vrai tant que le doigt
  est dessus.
- `if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);` un fond gris pour la ligne tenue ou choisie.
  `||` veut dire « ou ».
- `drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], ...)` le nom du fruit, centré dans sa ligne.
- `rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);` un trait fin sous chaque ligne.
- `registerTapZone(id, 0, y, w, ROW, () => { ... });` la ligne reçoit les touchers. La fonction retient `i` : chaque ligne a la sienne.
- `status.text = ...` change le texte de l'étiquette de statut. `status` est créé plus bas dans le fichier ; la fonction s'exécute
  plus tard, lors d'un toucher, quand il existe. Un toucher demande déjà une nouvelle image : le nouveau texte s'affiche aussitôt.
- `stage.direction = 'column'; stage.alignItems = 'stretch';` la page est une colonne, ses enfants aussi larges que la fenêtre
  moins la marge intérieure.
- `header.direction = 'row';` la barre de titre est une ligne de deux étiquettes.
- `title.flex = 1;` le titre prend la largeur que laisse le statut ; `status.width = 220;` le statut a une largeur fixe.
- `list.flex = 1;` la liste prend la hauteur que laisse la barre de titre.

## À vous de jouer

- Rendez les lignes plus hautes ou plus basses : changez `ROW`. Tout suit.
- Ajoutez une troisième étiquette à la barre de titre, *20 fruits*, entre le titre et le statut.
- Mettez plutôt le statut en bas de la page : ajoutez-le à la scène après la liste, pas à l'en-tête.
- Donnez à la liste la moitié de la largeur de la fenêtre : `stage.direction = 'row'`, et une seconde liste à côté.
- Revenez en haut de la liste quand on touche le titre : dans le `onDraw` de `Label`, une zone de toucher qui fixe `list.box.scrollY = 0`.

## Pour aller plus loin

Vous savez construire une scène : des objets qui bougent et se dessinent eux-mêmes, un arbre d'enfants, des touchers, des
glissements, une mise en page et une liste qui défile. C'est suffisant pour la plupart des applications sur une vieille tablette.

- La [référence de zinc:stage](../reference/stage.md) : chaque champ, méthode et fonction, et ce qu'ActionScript 3 a que `zinc:stage`
  n'a pas.
- `zinc new stage` crée une petite application à faire grandir : un titre, des boutons de couleur et un autocollant à faire glisser.
- [`examples/music-tree`](../../examples/music-tree/src/main.ts) dans le dépôt : un lecteur de musique entier écrit ainsi, rapide
  sur une tablette de 2011.
- [Quatre façons d'écrire un programme](../start/styles.md), ou la partie 4 : [17. Tracés et remplissages](17-paths-and-fills.md), le canvas du web.
