---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 5. Texte et images

**Ce que vous verrez :** un titre au milieu en haut, une fusée qui monte et descend, et deux lignes de texte plus petit
en bas, dont l'une compte les secondes.

![Une fusée sous le titre « Hello, space »](img/05-text-and-images.png)

## Le code

Le projet se trouve dans [`samples/05-text-and-images`](samples/05-text-and-images/). Il a une troisième partie : un dossier `assets`
avec l'image, `rocket.svg`. `zinc.json` nomme ce dossier :

```json
{
  "name": "text-and-images",
  "entry": "src/main.ts",
  "assets": "assets",
  "app": { "id": "com.example.learn.text", "window": { "width": 640, "height": 400 } }
}
```

`src/main.ts` :

```ts
import { onFrame, clear, font, drawText, textWidth, lineHeight, image, imageWidth, imageHeight, drawImage, width, height } from 'zinc:gfx';

const title = font('sans-bold', 40);
const body = font('sans', 18);
const rocket = image('rocket.svg');   // the file assets/rocket.svg

console.log(`The rocket picture is ${imageWidth(rocket)} by ${imageHeight(rocket)} pixels.`);

let time = 0;

onFrame((dt: number) => {
  time += dt;
  clear(0x1c1b20);

  // A title in the middle: measure it, then start half of what is left from the left edge.
  const words = 'Hello, space';
  const w = textWidth(title, words, 0);
  drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);

  // Two lines of smaller text, one under the other.
  const left = 40;
  let y = height() - 2 * lineHeight(body) - 30;
  drawText(body, left, y, 'Pictures come from the assets folder.', 0xbcb6ab, 255, 0);
  y += lineHeight(body);
  drawText(body, left, y, `Flight time: ${Math.floor(time)} s`, 0xbcb6ab, 255, 0);

  // The picture, bobbing up and down, drawn at twice its size.
  const size = imageWidth(rocket) * 2;
  const bob = Math.sin(time * 3) * 10;
  drawImage(rocket, (width() - size) / 2, height() / 2 - size / 2 + bob, size, size, 255, 0);
});
```

Le terminal affiche `The rocket picture is 96 by 96 pixels.`

## Les polices

Avant d'écrire, vous demandez une police : une famille et une taille en pixels, une seule fois, au début. Zinc renvoie un nombre qui
représente cette police, et chaque appel de texte utilise ce nombre. Les familles fournies avec Zinc :

| Famille | Aspect |
|---|---|
| `'sans'` | des lettres simples (Inter) |
| `'sans-bold'` | la même, en gras |
| `'mono'` | chaque lettre aussi large que les autres, pour le code (JetBrains Mono) |

Pour une police à vous : mettez un fichier `.ttf` dans `assets` et demandez `loadFont('MyFont.ttf', 32)`.

## Ligne par ligne

- `const title = font('sans-bold', 40);` une police grasse, de 40 pixels de haut. `body` est une police simple de 18.
- `const rocket = image('rocket.svg');` une image du dossier `assets`, par son nom de fichier. Le PNG et le SVG fonctionnent. Comme une
  police, vous obtenez un nombre qui représente l'image. Si le fichier est absent, le nombre vaut `-1` et rien n'est dessiné.
- `imageWidth(rocket)`, `imageHeight(rocket)` : la taille de l'image, en pixels.
- `const w = textWidth(title, words, 0);` quelle sera la largeur des mots dans cette police, avant de les dessiner. Le dernier
  argument est l'espace ajouté entre les lettres, 0 pour aucun.
- `drawText(title, (width() - w) / 2, 40, words, 0xeceaf0, 255, 0);` écrit les mots. Les arguments : la police, x et
  y du coin en haut à gauche du texte, les mots, la couleur, l'opacité, l'espace ajouté entre les lettres.
  `(width() - w) / 2` centre le texte : ce qui reste de la largeur, coupé en deux, de chaque côté.
- `lineHeight(body)` est la hauteur d'une ligne dans cette police, avec l'espace entre les lignes. Le programme commence deux lignes
  et une marge au-dessus du bas, puis descend d'une hauteur de ligne pour la deuxième ligne.
- `` `Flight time: ${Math.floor(time)} s` `` construit le texte à chaque image. `Math.floor` supprime ce qui se trouve après la virgule,
  si bien que le nombre change une fois par seconde.
- `drawImage(rocket, x, y, size, size, 255, 0);` dessine l'image dans une boîte : x, y, largeur, hauteur, opacité, et
  rayon des coins arrondis (0 : coins carrés). La boîte fait deux fois la taille de l'image, qui est donc dessinée deux fois plus grande. Une image
  SVG est un dessin, pas des points ; elle reste donc nette.
- `Math.sin(time * 3) * 10` fait monter et descendre la fusée de 10 pixels, trois fois plus vite qu'une seconde.

## À essayer

- Écrivez votre nom sous le titre, centré lui aussi.
- Faites apparaître le titre en fondu : une opacité de `Math.min(255, time * 100)`.
- Écrivez une longue phrase et coupez-la vous-même en lignes : découpez-la en mots, mesurez chacun avec `textWidth`, et commencez une nouvelle ligne
  quand le mot suivant ne tient pas (l'exemple *Text* d'Atelier le fait).
- Dessinez la fusée plus petite, plusieurs fois, à des endroits au hasard : `Math.random() * width()`. Choisissez les endroits une seule fois, avant
  `onFrame`, sinon ils sautent à chaque image.
- Dessinez votre propre image dans n'importe quel éditeur vectoriel (Inkscape, Figma), exportez-la en SVG dans `assets`, et affichez-la.
- Faites tourner la fusée avec les flèches : `drawImageRect` accepte une rotation (la [référence](../reference/gfx.md#images)
  montre comment).

## Suite

[6. Le son](06-sound.md) : jouez des notes.
