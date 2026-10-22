---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 4. La souris et le toucher

**Ce que vous verrez :** une page sur laquelle vous dessinez. Appuyez et déplacez la souris (ou un doigt sur un écran tactile) pour tracer une ligne. La
molette rend le pinceau plus épais ou plus fin, le bouton droit efface la page, et chaque doigt posé sur un écran tactile affiche un
anneau rose.

![Deux lignes violettes, une fine et une épaisse, et deux anneaux roses](img/04-mouse-and-touch.png)

## Le code

Le projet se trouve dans [`samples/04-mouse-and-touch`](samples/04-mouse-and-touch/). `src/main.ts` :

```ts
import { onFrame, clear, stroke, rrect, font, drawText, pointerX, pointerY, pointerDown, pointerButtons, wheel, touchCount, touchX, touchY } from 'zinc:gfx';

const lines: number[][] = [];   // every line drawn so far, as points: [x0, y0, x1, y1, ...]
const sizes: number[] = [];     // the brush size of each line
let brush = 6;
let wasDown = false;
const label = font('sans', 18);

onFrame((dt: number) => {
  const x = pointerX(), y = pointerY(), down = pointerDown();

  if (down && !wasDown) {                       // just pressed: start a new line
    lines.push([x, y]);
    sizes.push(brush);
    console.log(`pressed at ${Math.round(x)}, ${Math.round(y)}`);
  } else if (down) {                            // still pressed: add a point, if the pointer moved
    const line = lines[lines.length - 1];
    if (x !== line[line.length - 2] || y !== line[line.length - 1]) {
      line.push(x);
      line.push(y);
    }
  } else if (wasDown) {                         // just released
    console.log(`released at ${Math.round(x)}, ${Math.round(y)}: ${lines.length} line(s)`);
  }
  wasDown = down;

  if ((pointerButtons() & 2) !== 0) {           // the right button wipes the page
    lines.splice(0, lines.length);
    sizes.splice(0, sizes.length);
  }
  if (wheel() !== 0) {                          // the wheel changes the brush
    brush = Math.max(2, Math.min(40, brush + wheel() * 2));
    console.log(`brush ${brush}`);
  }

  clear(0xfffefc);
  for (let i = 0; i < lines.length; i++) stroke(lines[i], sizes[i], 0x5746e0, 255, false);
  for (let i = 0; i < touchCount(); i++) {      // one ring under each finger on a touch screen
    rrect(touchX(i) - 30, touchY(i) - 30, 60, 60, 30, 0xf27aa6, 110);
  }
  rrect(x - brush / 2, y - brush / 2, brush, brush, brush / 2, 0x1d1b18, 90);
  drawText(label, 16, 12, `brush ${brush}   lines ${lines.length}   fingers ${touchCount()}`, 0x625d55, 255, 0);
});
```

Dessinez : le terminal affiche l'endroit où vous avez appuyé et relâché, par exemple `pressed at 80, 120`, puis
`released at 340, 180: 1 line(s)`.

## Le pointeur

`zinc:gfx` appelle la souris le **pointeur**. Sur un écran tactile, le premier doigt est aussi le pointeur ; le même code fonctionne donc
avec une souris, un pavé tactile, un stylet ou un doigt :

| Fonction | Donne |
|---|---|
| `pointerX()`, `pointerY()` | où se trouve le pointeur, en pixels depuis le coin en haut à gauche de la fenêtre |
| `pointerDown()` | `true` tant que le bouton principal (ou un doigt) est enfoncé |
| `pointerButtons()` | tous les boutons maintenus : 1 gauche, 2 droit, 4 milieu, additionnés |
| `wheel()` | de combien de crans la molette a tourné pendant cette image : plus de 0 vers le haut, moins de 0 vers le bas |
| `touchCount()` | combien de doigts touchent l'écran ; `touchX(i)`, `touchY(i)` donnent la position du doigt `i` |

Il n'y a pas de fonction « clic » : un clic est le moment où `pointerDown()` devient `true`. Le programme le trouve en retenant
la valeur de l'image précédente, dans `wasDown`.

## Ligne par ligne

- `const lines: number[][] = [];` toutes les lignes dessinées jusqu'ici. Une ligne est une liste de nombres, `[x0, y0, x1, y1, ...]`
  (`number[]`) ; toutes les lignes forment donc une liste de listes (`number[][]`). Elle commence vide : `[]`.
- `const sizes: number[] = [];` la taille du pinceau de chaque ligne, dans le même ordre.
- `const x = pointerX(), y = pointerY(), down = pointerDown();` lit le pointeur une seule fois au début de l'image.
- `if (down && !wasDown)` enfoncé maintenant et pas avant : le bouton vient d'être pressé. `lines.push([x, y])` ajoute une nouvelle ligne
  qui commence ici ; `push` ajoute à la fin d'une liste.
- `else if (down)` toujours enfoncé : le pointeur est en train de glisser. `lines[lines.length - 1]` est la dernière ligne, celle que l'on trace.
  Son dernier point est `line[line.length - 2]`, `line[line.length - 1]` ; le nouveau point n'est ajouté que si le pointeur a bougé.
- `else if (wasDown)` relevé maintenant, enfoncé avant : le bouton vient d'être relâché.
- `wasDown = down;` retient la valeur de cette image pour la suivante.
- `if ((pointerButtons() & 2) !== 0)` le bouton droit est-il maintenu ? `&` garde la partie du nombre qui vaut 2 : elle n'est pas
  égale à 0 quand le bouton droit fait partie des boutons maintenus. `splice(0, lines.length)` vide une liste.
- `brush + wheel() * 2` chaque cran de la molette change le pinceau de 2 pixels, en le gardant entre 2 et 40.
- `stroke(lines[i], sizes[i], 0x5746e0, 255, false);` trace une ligne qui passe par tous les points d'une liste, aux extrémités arrondies.
  Les arguments : les points, l'épaisseur, la couleur, l'opacité, et `false` pour une ligne ouverte (`true` relierait le
  dernier point au premier).
- `for (let i = 0; i < touchCount(); i++)` un anneau par doigt, transparent (opacité 110 sur 255).
- Le dernier `rrect` est un petit point sombre qui suit le pointeur, aussi gros que le pinceau.
- `drawText(...)` affiche la taille du pinceau, le nombre de lignes et le nombre de doigts.

## À essayer

- Donnez à chaque ligne sa propre couleur : gardez une liste de couleurs comme `sizes`, et choisissez une nouvelle couleur à chaque appui.
- Faites que le bouton du milieu (4) annule la dernière ligne : `lines.pop()` et `sizes.pop()`.
- Dessinez avec tous les doigts à la fois : une ligne par doigt, en utilisant `touchId(i)` pour savoir quel doigt est lequel d'une image à
  la suivante.
- Ajoutez des formes `closed` : tracez la ligne avec `true` comme dernier argument et voyez-la se fermer.
- Dessinez un point doux à chaque position au lieu d'une ligne : `rrect` avec une faible opacité, pour une bombe de peinture.
- Traits rapides avec un stylet : `penCount()`, `penX(i)`, `penY(i)` et `penPressure(i)` donnent chaque mesure du stylet depuis
  la dernière image, avec sa pression de 0 à 1 (la [référence](../reference/gfx.md#input) les énumère).

## Suite

[5. Texte et images](05-text-and-images.md) : écrivez des mots et affichez des images.
