---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 15. Toucher et glisser

**Ce que vous allez voir :** un bouton violet *Taps: 0* en haut à gauche, et trois cartes, verte, rose et bleue, posées les
unes sur les autres. Touchez le bouton et son nombre augmente ; il s'assombrit tant que votre doigt est dessus. Prenez une
carte et déplacez-la : elle passe au-dessus des autres et prend une bordure blanche tant que vous la tenez.

![Un bouton « Taps: 2 » et trois cartes ; la carte verte est tenue, au-dessus, avec une bordure blanche](img/15-taps-and-drags.png)

## Le code

Le projet se trouve dans [`samples/15-taps-and-drags`](samples/15-taps-and-drags/). `src/main.ts` :

```ts
import { onFrame, rrect, border, font, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, registerTapZone, registerDragZone, isZonePressed } from 'zinc:stage';

const label = font('sans', 18);

// A button that counts its taps.
class Counter extends Sprite {
  taps: i32 = 0;
  override onDraw(w: number, h: number): void {
    const held = isZonePressed(this.name);                 // a finger is on it right now
    rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);
    const words = `Taps: ${this.taps}`;
    drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, words, 0xffffff, 255, 0);
    registerTapZone(this.name, 0, 0, w, h, () => {
      this.taps++;
      console.log(`tap ${this.taps}`);
    });
  }
}

// A card you pick up and move.
class Card extends Sprite {
  color: u32 = 0;
  startX: number = 0;   // where the card was when it was picked up
  startY: number = 0;
  grabX: number = 0;    // where the finger took it, in the card
  grabY: number = 0;

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 14, this.color, 255);
    if (isZonePressed(this.name)) border(0, 0, w, h, 14, 3, 0xffffff, 255);
    registerDragZone(this.name, 0, 0, w, h, (x: number, y: number, phase: i32) => this.drag(x, y, phase));
  }

  drag(x: number, y: number, phase: i32): void {
    if (phase === 0) {                                     // pressed
      this.startX = this.x;
      this.startY = this.y;
      this.grabX = x;
      this.grabY = y;
      (this.parent as DisplayObject).addChild(this);       // added again: now on top of the other cards
      console.log(`picked up the ${this.name} at ${Math.round(x)}, ${Math.round(y)} in the card`);
    } else if (phase === 1) {                              // moved
      this.x = this.startX + x - this.grabX;
      this.y = this.startY + y - this.grabY;
    } else if (phase === 2) {                              // let go
      console.log(`dropped the ${this.name} at ${Math.round(this.x)}, ${Math.round(this.y)}`);
    }
  }
}

function card(name: string, color: u32, x: number, y: number): Card {
  const c = new Card(name);
  c.color = color;
  c.x = x;
  c.y = y;
  c.width = 120;
  c.height = 160;
  return c;
}

const stage = new Stage();
stage.color = 0xf3f1ec;
const counter = new Counter('counter');
counter.x = 24;
counter.y = 24;
counter.width = 140;
counter.height = 44;
stage.addChild(counter);
stage.addChild(card('green card', 0x7bd389, 200, 120));
stage.addChild(card('pink card', 0xf27aa6, 260, 150));
stage.addChild(card('blue card', 0x5ec2f2, 320, 180));
onFrame((dt: number) => stage.frame(dt));
```

Touchez le bouton deux fois, puis prenez la carte verte par son coin en haut à gauche et déplacez-la vers le haut et la droite :

```text
tap 1
tap 2
picked up the green card at 30, 30 in the card
dropped the green card at 400, 70
```

## Les zones : où un objet reçoit le doigt

Un objet d'une scène dit, pendant qu'il se dessine, quelle partie de lui répond au pointeur : une **zone**, un rectangle dans
ses propres coordonnées, avec un nom et la fonction à appeler. Il y en a de deux sortes :

- `registerTapZone(name, x, y, w, h, onTap)` : un appui et un relâchement dans la zone, sans bouger de plus de 12 pixels,
  appellent `onTap()`. C'est un clic avec la souris, un toucher avec un doigt.
- `registerDragZone(name, x, y, w, h, onDrag)` : un appui dans la zone appelle `onDrag(x, y, phase)` avec `phase` valant 0,
  chaque déplacement avec `phase` valant 1 (à chaque image tant que le pointeur est tenu), le relâchement avec `phase`
  valant 2. `x` et `y` sont le pointeur **dans les coordonnées de l'objet**, mesurées depuis l'endroit où l'objet se
  trouvait au début de l'appui : (30, 30) est à 30 pixels à droite et en dessous du coin de la carte.

`stage.frame` garde les zones de la dernière image. Quand le pointeur s'enfonce, elle cherche la zone la plus haute sous lui,
celle dessinée en dernier, si bien qu'une carte posée sur une autre reçoit le doigt en premier. `isZonePressed(name)` dit si
le doigt est sur cette zone en ce moment, pour la dessiner enfoncée. Un toucher, un glissement et l'appui lui-même
mettent `uiState.dirty` : la scène est redessinée sans que vous le demandiez.

Le clavier se lit comme dans la partie 1, avec `zinc:gfx` (`keyCount`, `keyName`, `isDown`), dans un `onUpdate` ou dans
`onFrame`.

## Ligne par ligne

- `class Counter extends Sprite` le bouton : un sprite avec un nombre de touchers.
- `const held = isZonePressed(this.name);` vrai tant qu'un doigt est sur ce bouton. Le nom de la zone est le nom du sprite,
  `'counter'`, si bien que deux boutons n'en partagent jamais une.
- `rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);` une pilule aussi grande que le bouton, plus sombre quand il est
  tenu. `held ? a : b` vaut `a` quand `held` est vrai, sinon `b`.
- `drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, ...)` les mots centrés dans le bouton :
  la moitié de ce qui reste de chaque côté, en largeur et en hauteur.
- `registerTapZone(this.name, 0, 0, w, h, () => { ... });` tout le bouton reçoit les touchers. `() => { ... }` est la fonction à
  appeler : elle ajoute un à `taps` et l'affiche. L'image suivante montre le nouveau nombre.
- `class Card extends Sprite` une carte se souvient d'où elle était et d'où on l'a prise : `startX`, `startY`, `grabX`, `grabY`.
- `registerDragZone(this.name, 0, 0, w, h, (x, y, phase) => this.drag(x, y, phase));` toute la carte peut être glissée ;
  chaque étape va à la méthode `drag` de la carte.
- `if (phase === 0)` l'appui : on retient où est la carte et où est le doigt dedans.
- `(this.parent as DisplayObject).addChild(this);` ajouter un enfant déjà présent le déplace à la fin de la liste : il est
  maintenant dessiné en dernier, au-dessus. En général `parent` peut valoir `null` ; `as DisplayObject` dit « ici, non ».
- `else if (phase === 1)` un déplacement : la carte va là où elle était, plus la distance parcourue par le doigt
  (`x - this.grabX`). Le doigt reste au même endroit de la carte.
- `else if (phase === 2)` le relâchement : on dit où la carte a été lâchée.
- `function card(...)` fabrique une carte de 120 sur 160 pixels.
- `stage.addChild(card('green card', 0x7bd389, 200, 120));` les trois cartes, chacune un peu plus bas et plus à droite que la
  précédente.

## À vous de jouer

- Ajoutez un second bouton qui compte à rebours, ou qui remet le premier à 0.
- Gardez les cartes dans la fenêtre : dans `drag`, limitez `this.x` entre `0` et `640 - this.width` avec `Math.max` et
  `Math.min`.
- Faites coller une carte à une grille de 20 pixels quand on la lâche : dans la phase 2, `this.x = Math.round(this.x / 20) * 20`.
- Rendez la zone de toucher du bouton plus petite que son image (`registerTapZone(this.name, 10, 10, w - 20, h - 20, ...)`) et
  regardez où elle cesse de répondre.
- Distinguez un toucher d'un glissement : dans la phase 2, quand la carte est à moins de 5 pixels de `startX`, `startY`, on
  l'a seulement touchée : changez sa couleur.

## Suite

[16. La mise en page et une boîte défilante](16-layout-and-scrolling.md) : une barre de titre et une liste de vingt fruits qui défile.
