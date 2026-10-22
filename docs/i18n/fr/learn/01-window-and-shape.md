---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 1. Une fenêtre et une forme

**Ce que vous verrez :** une fenêtre au fond clair, un rectangle violet dans le coin en haut à gauche et un cercle rose au
milieu.

![Un rectangle violet et un cercle rose sur un fond clair](img/01-window-and-shape.png)

## Le code

Un programme Zinc est un dossier avec deux fichiers. Le projet se trouve dans
[`samples/01-window-and-shape`](samples/01-window-and-shape/).

`zinc.json` décrit le projet :

```json
{
  "name": "window-and-shape",
  "entry": "src/main.ts",
  "app": { "id": "com.example.learn.shape", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts` est le programme :

```ts
import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';

console.log(`The window is ${width()} by ${height()} pixels.`);

onFrame((dt: number) => {
  clear(0xf3f1ec);
  rect(40, 40, 160, 100, 0x5746e0);
  rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);
});
```

Lancez-le :

```sh
zinc run docs/learn/samples/01-window-and-shape
```

La fenêtre s'ouvre et le terminal affiche `The window is 640 by 400 pixels.`

## Ligne par ligne

**`zinc.json`**

- `"name"` : le nom du programme. Le titre de la fenêtre l'utilise.
- `"entry"` : le fichier où le programme démarre.
- `"app"` : à propos de l'application. `"id"` est un nom qu'aucune autre application n'utilise, écrit à l'envers comme une adresse web (`com.example...`).
  `"window"` donne la taille de la fenêtre en pixels : 640 de large, 400 de haut.

**`src/main.ts`**

- `import { onFrame, clear, rect, rrect, width, height } from 'zinc:gfx';`
  Zinc est livré avec des modules : des ensembles de fonctions prêtes à l'emploi. `zinc:gfx` est celui qui dessine. Cette ligne prend six de ses
  fonctions pour que le programme puisse les utiliser. Vous n'importez que ce que vous utilisez.
- `console.log(...)` affiche une ligne dans le terminal. Entre les accents graves, `${width()}` est remplacé par la valeur de
  `width()` : la largeur de la fenêtre, 640. Afficher est le moyen le plus simple de voir ce que fait votre programme.
- `onFrame((dt: number) => { ... });`
  C'est le cœur du programme. Vous donnez à `onFrame` une fonction (la partie qui va de `(dt: number) =>` à l'accolade fermante `}`).
  Zinc l'appelle à chaque image, environ 60 fois par seconde, aussi souvent que l'écran se rafraîchit. Chaque appel redessine toute
  l'image. Ici, l'image ne change jamais : vous voyez donc une image fixe ; la leçon suivante la fait bouger.
  `dt` est le temps écoulé depuis la dernière image. `: number` dit que `dt` est un nombre : Zinc vérifie les types de vos valeurs
  avant de lancer le programme.
- `clear(0xf3f1ec);` peint toute la fenêtre d'une seule couleur. Les couleurs sont des nombres écrits `0xRRGGBB` : deux chiffres pour le rouge,
  deux pour le vert, deux pour le bleu, de `00` (aucun) à `ff` (au maximum). `0xf3f1ec` est un gris clair chaud. C'est le même code que
  `#f3f1ec` sur le web, avec `0x` devant au lieu de `#`.
- `rect(40, 40, 160, 100, 0x5746e0);` dessine un rectangle plein. Les nombres sont, dans l'ordre : x, y, largeur, hauteur, couleur.
  x compte les pixels depuis le bord gauche de la fenêtre, y compte les pixels vers le bas depuis le bord haut. Le coin en haut à gauche de
  ce rectangle est donc à 40 pixels de la gauche et à 40 du haut, et il fait 160 de large et 100 de haut.
- `rrect(width() / 2 - 60, height() / 2 - 60, 120, 120, 60, 0xf27aa6, 255);` dessine un rectangle aux coins arrondis.
  Après x, y, la largeur et la hauteur viennent le rayon des coins (60) et la couleur, puis l'opacité : 255 est opaque,
  0 est invisible, 128 est à moitié transparent. Un carré de 120 avec des coins de 60 (la moitié de sa taille) est un cercle.
  `width() / 2` est le milieu de la fenêtre ; moins 60 (la moitié du cercle), cela place le centre du cercle exactement à cet endroit.

L'ordre des appels de dessin compte : ce qui est dessiné après recouvre ce qui a été dessiné avant. C'est pourquoi `clear` vient en premier.

## À essayer

- Changez la couleur du fond en `0x1c1b20` (presque noir).
- Déplacez le rectangle dans le coin en bas à droite. Indice : `width() - 200` est à 200 pixels du bord droit.
- Agrandissez le cercle (rappelez-vous : le rayon est la moitié de la taille). Puis donnez-lui une largeur de 200 et gardez le reste : il
  devient une pilule.
- Donnez au cercle une opacité de 128 et placez-le sur le rectangle pour voir à travers.
- Ajoutez `line(0, 0, width(), height(), 0x1d1b18);` (ajoutez `line` à la ligne d'import) : un trait fin en travers de la fenêtre.
- Changez la taille de la fenêtre dans `zinc.json`. Le cercle reste au milieu parce que le code utilise `width()` et `height()`.

## Suite

[2. Couleurs et mouvement](02-colours-and-movement.md) : faites bouger les choses, en douceur, à la même vitesse sur toutes les machines.
