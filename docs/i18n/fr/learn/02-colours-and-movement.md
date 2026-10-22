---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 2. Couleurs et mouvement

**Ce que vous verrez :** une balle orange roule sur l'herbe verte de la gauche vers la droite, revient à gauche quand elle sort de
la fenêtre, et le ciel passe lentement du bleu foncé au violet, puis revient.

![Une balle orange sur de l'herbe verte sous un ciel bleu foncé](img/02-colours-and-movement.png)

## Le code

Le projet se trouve dans [`samples/02-colours-and-movement`](samples/02-colours-and-movement/) ; son `zinc.json` est celui de
la leçon 1 avec un autre nom. `src/main.ts` :

```ts
import { onFrame, clear, rrect, rect, width, height } from 'zinc:gfx';

function rgb(red: number, green: number, blue: number): u32 {
  return Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue);
}

const SPEED = 160;   // pixels per second
const SIZE = 60;
let x = 0;           // the left edge of the ball
let time = 0;        // seconds since the start
let told = false;

onFrame((dt: number) => {
  time += dt;
  x += SPEED * dt;
  if (x > width()) x = -SIZE;

  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the ball is at x = ${Math.round(x)}.`);
    told = true;
  }

  const glow = (Math.sin(time * 2) + 1) / 2;   // goes from 0 to 1 and back, again and again
  clear(rgb(20, 20, 40 + 60 * glow));
  rect(0, height() - 40, width(), 40, 0x2f8f57);
  rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);
});
```

Au bout d'une seconde, le terminal affiche `After 1.00 seconds the ball is at x = 160.` (sur votre machine, les nombres peuvent être un
peu différents, comme l'explique la partie suivante).

## Comment fonctionne le mouvement

Un film est une suite d'images fixes montrées rapidement. Un programme fait la même chose : à chaque image, il dessine une image où la
balle est un peu plus loin. Pour déplacer la balle, vous changez un nombre (`x`) et vous dessinez la balle à la position `x`.

De quelle distance la balle doit-elle avancer à chaque image ? Pas un nombre fixe de pixels : un écran rapide affiche 120 images par seconde, une machine lente
30, et la balle roulerait quatre fois plus vite sur l'un que sur l'autre. À la place, vous donnez une vitesse en pixels par
**seconde** et vous la multipliez par `dt`, le temps écoulé depuis la dernière image, en secondes. À 60 images par seconde, `dt` vaut environ
0,0167 : la balle avance donc de 160 × 0,0167 ≈ 2,7 pixels par image ; à 30 images par seconde, elle avance deux fois plus loin à chaque image, mais
deux fois moins souvent. Dans les deux cas, elle parcourt 160 pixels en une seconde.

## Ligne par ligne

- `function rgb(red: number, green: number, blue: number): u32 { ... }` crée une fonction à vous. Elle prend trois
  nombres de 0 à 255 et renvoie la couleur qu'ils forment. `: u32` dit qu'elle renvoie un nombre entier qui ne peut pas être
  négatif : le type des couleurs dans `zinc:gfx`.
- `Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue)` fabrique le nombre de la couleur. `0xRRGGBB` est le rouge
  fois 65536, plus le vert fois 256, plus le bleu : `rgb(255, 0, 0)` donne `0xff0000`, du rouge pur. `Math.round` transforme
  `127.6` en `128`, parce que chaque partie doit être un nombre entier.
- `const SPEED = 160;` une valeur qui ne change jamais est une `const`. L'écrire en majuscules est une habitude qui veut dire « un réglage ».
  Le commentaire après `//` est pour les humains ; Zinc l'ignore.
- `let x = 0;` une valeur qui change est une `let`. `x` est la position de la balle ; `time` compte les secondes depuis le début ;
  `told` retient si le programme a déjà affiché sa ligne.
- `time += dt;` ajoute le temps de cette image à `time`. `x += SPEED * dt;` déplace la balle de sa vitesse multipliée par le temps.
- `if (x > width()) x = -SIZE;` quand la balle est sortie de la fenêtre par la droite, remettez-la juste en dehors, à gauche.
- `if (!told && time >= 1) { ... }` s'exécute une seule fois : quand une seconde s'est écoulée et que rien n'a encore été affiché (`!told` veut dire
  « told est faux »). `time.toFixed(2)` écrit le nombre avec deux chiffres après la virgule.
- `const glow = (Math.sin(time * 2) + 1) / 2;` `Math.sin` va doucement de -1 à 1 et revient, sans fin. Ajouter 1 et
  diviser par 2 la fait aller de 0 à 1 à la place. `time * 2` la fait aller deux fois plus vite. C'est le moyen le plus simple de faire
  pulser, osciller ou respirer quelque chose.
- `clear(rgb(20, 20, 40 + 60 * glow));` le ciel : son bleu va de 40 à 100 quand `glow` va de 0 à 1.
- `rect(0, height() - 40, width(), 40, 0x2f8f57);` l'herbe : une bande verte de 40 pixels de haut en bas.
- `rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);` la balle, posée sur
  l'herbe. Sa couleur va de l'orange au jaune avec `glow`.

## À essayer

- Faites aller la balle deux fois plus vite. Puis faites-la aller en arrière : une vitesse négative (et changez le `if` pour qu'elle revienne
  par la droite).
- Faites-la rebondir : gardez une vitesse `vy` pour le haut et le bas, ajoutez `vy += 900 * dt` à chaque image (la gravité), `y += vy * dt`, et quand
  la balle touche l'herbe, `vy = -vy * 0.8`.
- Faites tourner la balle autour du milieu de la fenêtre : `const bx = width() / 2 + Math.cos(time) * 100` et
  `const by = height() / 2 + Math.sin(time) * 100`.
- Utilisez aussi `rgb` pour l'herbe, et faites-la changer de couleur selon l'heure du jour : une journée entière en 20 secondes.
- Dessinez dix balles dans une boucle : `for (let i = 0; i < 10; i++) { ... }`, chacune un peu plus tard que la précédente.

## Suite

[3. Le clavier](03-keyboard.md) : déplacez un carré avec les flèches.
