---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 3. Le clavier

**Ce que vous verrez :** un carré que vous déplacez avec les flèches. La barre d'espace change sa couleur. Le nom de la dernière touche
sur laquelle vous avez appuyé s'affiche dans le coin en haut à gauche.

![Un carré bleu sur un fond sombre, « Space » écrit dans le coin](img/03-keyboard.png)

## Le code

Le projet se trouve dans [`samples/03-keyboard`](samples/03-keyboard/). `src/main.ts` :

```ts
import { onFrame, clear, rrect, font, drawText, width, height, isDown, wasPressed, Btn, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const SPEED = 240;   // pixels per second
const SIZE = 48;
let x = 100, y = 100;
let color: u32 = 0xe8b06a;
let lastKey = 'Press a key';
const label = font('sans', 24);

onFrame((dt: number) => {
  // 1. Keys held down: ask every frame.
  if (isDown(Btn.Left)) x -= SPEED * dt;
  if (isDown(Btn.Right)) x += SPEED * dt;
  if (isDown(Btn.Up)) y -= SPEED * dt;
  if (isDown(Btn.Down)) y += SPEED * dt;
  x = Math.max(0, Math.min(width() - SIZE, x));
  y = Math.max(0, Math.min(height() - SIZE, y));

  // 2. A key pressed this frame (not held since before).
  if (wasPressed(Btn.A)) color = color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a;

  // 3. Every key that went down since the last frame, by name.
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Down) {
      lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);
      console.log(`key "${lastKey}", the square is at x = ${Math.round(x)}`);
    }
  }

  clear(0x1c1b20);
  rrect(x, y, SIZE, SIZE, 10, color, 255);
  drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);
});
```

Appuyez sur des touches : le terminal les affiche une par une, par exemple `key "a", the square is at x = 220`.

## Deux façons de lire le clavier

**Demander, à chaque image : cette touche est-elle maintenue enfoncée ?** `isDown(Btn.Left)` vaut `true` tant que la touche est maintenue. C'est ce que les jeux utilisent
pour déplacer des choses : tant que vous maintenez la flèche, le carré avance un peu à chaque image. `zinc:gfx` nomme un petit ensemble de
boutons, ceux d'une manette de jeu, de sorte que le même code fonctionne avec un clavier, une manette ou les boutons d'une console portable :

| Bouton | Touches du clavier |
|---|---|
| `Btn.Up`, `Btn.Down`, `Btn.Left`, `Btn.Right` | les flèches, ou W, S, A, D |
| `Btn.A` | Espace ou Z |
| `Btn.B`, `Btn.X`, `Btn.Y` | X, C, V |
| `Btn.L`, `Btn.R` | Q, E |
| `Btn.Start`, `Btn.Select` | Entrée, Tab |

**Lire la liste des touches pressées depuis la dernière image.** Chaque touche qui s'enfonce, se relève ou se répète (maintenue assez longtemps
pour écrire de nouveau) est un événement avec un nom : `'a'`, `'1'`, `' '` (Espace), `'Enter'`, `'Escape'`, `'ArrowLeft'`, `'F5'`...
C'est la façon de lire n'importe quelle touche, lettres comprises, et rien n'est manqué, même quand deux touches arrivent dans la même image.

## Ligne par ligne

- `import { ... } from 'zinc:gfx';` nouveau cette fois : `font` et `drawText` (la leçon 5 les explique), `isDown`,
  `wasPressed` et `Btn` pour les boutons de jeu, `keyCount`, `keyKind`, `keyName` et `KeyKind` pour les événements de touches.
- `let x = 100, y = 100;` la position du carré. `let color: u32 = 0xe8b06a;` sa couleur, un `u32` comme toutes les couleurs.
- `let lastKey = 'Press a key';` le texte affiché dans le coin. Des mots entre guillemets forment une `string` (une chaîne de texte).
- `const label = font('sans', 24);` une police, demandée une seule fois au début : la famille `'sans'` à 24 pixels.
- `if (isDown(Btn.Left)) x -= SPEED * dt;` tant que Gauche est maintenue, allez à gauche. Haut donne `y -= ...` parce que y augmente vers le bas.
- `x = Math.max(0, Math.min(width() - SIZE, x));` garde le carré dans la fenêtre. `Math.min(a, b)` est le plus petit
  des deux, `Math.max(a, b)` le plus grand : ensemble, ils gardent `x` entre 0 et `width() - SIZE`.
- `if (wasPressed(Btn.A)) color = ...;` `wasPressed` vaut `true` seulement à l'image où le bouton s'enfonce, pas tant qu'il
  reste enfoncé. Maintenir Espace change la couleur une seule fois, pas 60 fois par seconde.
- `color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a` se lit « si la couleur est orange, alors bleu, sinon orange ». `===` compare,
  `? :` choisit l'une de deux valeurs.
- `for (let i = 0; i < keyCount(); i++) { ... }` parcourt les événements de touches de cette image, du premier (numéro 0)
  au dernier.
- `if (keyKind(i) === KeyKind.Down)` ne garde que les touches qui s'enfoncent. Les autres sont `KeyKind.Up` (relâchée),
  `KeyKind.Repeat` (maintenue, qui écrit de nouveau) et `KeyKind.Text` (texte saisi, quand un champ de texte l'a demandé).
- `lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);` le nom de la touche. Le nom d'Espace est une espace, que vous ne
  verriez pas à l'écran ; le programme écrit donc `Space` à la place. Les noms ne changent pas avec Maj : Maj+A reste `'a'`.
- `drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);` écrit `lastKey` en (20, 16) en gris clair.

## À essayer

- Faites aller plus vite avec Maj : `import { modifiers, Mod }` et `const fast = (modifiers() & Mod.Shift) !== 0;`.
- Faites que Entrée (`Btn.Start`) remette le carré au milieu.
- Comptez les touches pressées et affichez le total sous le nom.
- Dessinez le carré plus grand tant qu'Espace est maintenue (`isDown(Btn.A)`), et plus petit quand elle est relâchée.
- Faites faire le tour au carré : quand il sort à droite, il revient à gauche, comme dans la leçon 2.
- Échap ferme un programme `zinc:gfx` (ou quitte le plein écran). Pour utiliser Échap vous-même, appelez `escapeByApp(true)` une fois.

## Suite

[4. La souris et le toucher](04-mouse-and-touch.md) : dessinez avec la souris ou un doigt.
