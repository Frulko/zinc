---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 11. Un dessin dans une interface

**Ce que vous allez voir :** un panneau blanc à gauche avec un titre, le nombre de pétales et deux boutons ; à droite, une
fleur qui tourne lentement. *More* et *Fewer* ajoutent et enlèvent des pétales.

![Un panneau avec les boutons Fewer et More à côté d'une fleur rose à sept pétales](img/11-drawing-in-an-interface.png)

## Le code

Le projet se trouve dans [`samples/11-drawing-in-an-interface`](samples/11-drawing-in-an-interface/). `src/main.tsx` :

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, stroke } from 'zinc:gfx';

const [petals, setPetals] = createSignal<i32>(6);
let time = 0;   // seconds since the start, moved forward every frame

function change(by: i32): void {
  const next = petals() + by;
  if (next < 3 || next > 12) return;
  setPetals(next);
  console.log(`petals: ${petals()}`);
}

function flower(x: i32, y: i32, w: i32, h: i32): void {
  const cx = x + w / 2, cy = y + h / 2;          // the middle of the canvas
  const reach = Math.min(w, h) * 0.22;           // how far the petals are from the middle
  stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);
  for (let i = 0; i < petals(); i++) {
    const angle = time * 0.5 + (i * 2 * Math.PI) / petals();
    const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;
    rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);
  }
  rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);
}

function App(): i32 {
  return <View className="w-full h-full flex-row">
    <View className="w-[200px] p-6 gap-4 bg-white">
      <Text className="text-2xl font-bold text-[#1d1b18]">Flower</Text>
      <Text className="text-base text-[#625d55]">{`${petals()} petals`}</Text>
      <Button className="h-10 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
        <Text className="text-base text-[#1d1b18]">Fewer</Text>
      </Button>
      <Button className="h-10 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
        <Text className="text-base text-white">More</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={flower} />
  </View>;
}

render(App, 0xdff3e4, (dt: number) => { time += dt; });
```

Cliquez deux fois sur *More* et une fois sur *Fewer* : le terminal affiche `petals: 7`, `petals: 8`, `petals: 7`.

## Un Canvas : la partie 1 dans la partie 2

Certaines choses sont plus faciles à dessiner qu'à construire avec des boîtes : un graphique, un plateau de jeu, un dessin,
une forme d'onde. Un `Canvas` est un élément de l'interface que vous dessinez vous-même, avec les fonctions de `zinc:gfx` de
la partie 1. La mise en page lui donne sa place et sa taille comme à n'importe quel élément (ici `grow` : toute la largeur que
le panneau laisse). Zinc appelle ensuite sa fonction `onDraw` avec cette place : `x`, `y` (son coin en haut à gauche, dans la
fenêtre) et `w`, `h` (sa largeur et sa hauteur). Vous dessinez à l'intérieur de cette boîte.

Un Canvas est redessiné à chaque image, donc un dessin qui bouge n'a qu'à lire l'heure. (Une interface sans Canvas n'est
redessinée que lorsque quelque chose y change, ce qui économise la batterie ; `style={{ lazy: 1 }}` fait aussi attendre un
changement au Canvas.)

## Ligne par ligne

- `import { rrect, stroke } from 'zinc:gfx';` les fonctions de dessin que ce programme utilise, comme dans la partie 1. Vous
  n'appelez ni `onFrame` ni `clear` : `zinc:ui` lance les images et peint le fond.
- `const [petals, setPetals] = createSignal<i32>(6);` le nombre de pétales, un signal : le texte `6 petals` le suit.
- `let time = 0;` le nombre de secondes depuis le début, une simple variable : seul le dessin la lit, et le Canvas est de
  toute façon redessiné à chaque image.
- `function change(by: i32): void` ajoute ou enlève un pétale, entre 3 et 12.
- `function flower(x: i32, y: i32, w: i32, h: i32): void` la fonction de dessin du Canvas. Zinc lui donne la boîte.
- `const cx = x + w / 2, cy = y + h / 2;` le centre de la boîte. Dessinez toujours à partir de `x` et `y` : le Canvas n'est pas
  en haut à gauche de la fenêtre, il commence à 200 pixels du bord gauche, après le panneau.
- `const reach = Math.min(w, h) * 0.22;` la distance des pétales au centre : une part du plus petit côté de la boîte, pour
  que la fleur tienne quand la fenêtre change de taille.
- `stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);` la tige : un gros trait vert du centre jusqu'au bas de la boîte.
- `for (let i = 0; i < petals(); i++)` un pétale par tour de boucle. `petals()` lit le signal : le dessin utilise le nouveau
  nombre à l'image suivante.
- `const angle = time * 0.5 + (i * 2 * Math.PI) / petals();` où se trouve le pétale sur le cercle. Un tour complet vaut
  `2 * Math.PI` (environ 6,28) ; les pétales se le partagent à parts égales, et `time * 0.5` les fait tous tourner
  lentement.
- `const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;` le point situé à cet angle sur un cercle de
  rayon `reach` autour du centre. `cos` donne la part en largeur, `sin` la part en hauteur.
- `rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);` un pétale rond de 80 pixels autour de ce point, un peu
  transparent, pour que les pétales qui se chevauchent se voient.
- `rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);` le cœur jaune, dessiné en dernier pour être au-dessus.
- `<View className="w-full h-full flex-row">` la fenêtre est une ligne : le panneau, puis le Canvas.
- `<View className="w-[200px] p-6 gap-4 bg-white">` le panneau : 200 pixels de large, blanc, ses enfants en colonne.
- `<Canvas className="grow" onDraw={flower} />` le Canvas prend le reste de la ligne et dessine avec `flower`.
- `render(App, 0xdff3e4, (dt: number) => { time += dt; });` le troisième argument de `render`, qui valait `null` jusqu'ici,
  est une fonction que Zinc appelle à chaque image avec `dt`, le temps écoulé depuis l'image précédente, comme le fait
  `onFrame` dans la partie 1. Elle fait avancer l'horloge du dessin.

## À vous de jouer

- Faites tourner la fleur plus vite, ou dans l'autre sens (une vitesse négative).
- Donnez à chaque pétale sa propre couleur, à partir d'une liste comme dans la leçon 6.
- Ajoutez un signal pour la taille des pétales, avec deux boutons de plus.
- Faites respirer les pétales : leur taille multipliée par `1 + 0.1 * Math.sin(time * 3)`.
- Cliquez sur le Canvas pour déplacer la fleur : donnez-lui `onPointerDown={(e: ui.PointerEvent) => ...}` (leçon 9) et
  gardez le centre dans deux variables. `e.x`, `e.y` sont à l'intérieur du Canvas : ajoutez donc `x`, `y` quand vous
  dessinez.
- Dessinez plutôt un histogramme : un `rect` par valeur d'une liste, aussi haut que la valeur.

## Suite

[12. Une petite application complète](12-a-small-app.md) : tout ensemble.
