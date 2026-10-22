---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 6. Le son

**Ce que vous allez voir (et entendre) :** huit barres colorées, une par note d'une gamme. Cliquez sur une barre, ou
appuyez sur une touche de 1 à 8 : sa note joue pendant que la barre s'allume et grandit.

![Huit barres colorées nommées C D E F G A B C](img/06-sound.png)

## Le code

Le projet est dans [`samples/06-sound`](samples/06-sound/). `src/main.ts` :

```ts
import { tone } from 'zinc:audio';
import { onFrame, clear, rrect, font, drawText, textWidth, width, height, pointerX, pointerDown, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const HERTZ = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3];   // how fast the air shakes, per second
const COLORS: u32[] = [0x5746e0, 0x2563c9, 0x0e7c86, 0x2f8f57, 0xb7791f, 0xcf3a2b, 0xb5357d, 0x5746e0];

const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));   // made once, played many times
const glow: number[] = HERTZ.map((hz: number) => 0);                   // 1 just after a note, then fades to 0
const label = font('sans-bold', 22);
let wasDown = false;

function play(i: number): void {
  notes[i].play();
  glow[i] = 1;
  console.log(`play ${NAMES[i]} (${HERTZ[i]} Hz)`);
}

onFrame((dt: number) => {
  const bar = width() / NAMES.length;

  if (pointerDown() && !wasDown) play(Math.min(NAMES.length - 1, Math.floor(pointerX() / bar)));
  wasDown = pointerDown();

  for (let k = 0; k < keyCount(); k++) {   // the keys 1 to 8 play too
    const n = parseInt(keyName(k));
    if (keyKind(k) === KeyKind.Down && n >= 1 && n <= 8) play(n - 1);
  }

  clear(0x1c1b20);
  for (let i = 0; i < NAMES.length; i++) {
    glow[i] = Math.max(0, glow[i] - dt * 2);
    const tall = height() * 0.6 + glow[i] * 40;
    rrect(i * bar + 6, height() - tall - 12, bar - 12, tall, 12, COLORS[i], Math.round(140 + 115 * glow[i]));
    drawText(label, i * bar + (bar - textWidth(label, NAMES[i], 0)) / 2, height() - 50, NAMES[i], 0xffffff, 255, 0);
  }
});
```

Cliquez sur la troisième barre : vous entendez un mi (E) et le terminal affiche `play E (329.6 Hz)`.

## Faire un son

Le module `zinc:audio` joue des sons. `tone(hz, seconds, wave)` fabrique un son à partir de rien :

- `hz` est la hauteur du son : combien de fois par seconde l'air vibre. 440 est le la sur lequel les orchestres
  s'accordent ; deux fois plus (880) donne la même note une octave plus haut.
- `seconds` est la durée du son.
- `wave` est la forme du son : `'sine'` (doux, une flûte), `'triangle'` (un peu plus brillant), `'square'` (un vieux jeu
  vidéo), `'sawtooth'` (bourdonnant), `'noise'` (un souffle, pour les percussions et le vent).

`tone` renvoie un son que vous pouvez jouer autant de fois que vous voulez avec `play()`. Chaque `play()` lance une
nouvelle copie : une note jouée deux fois de suite rapidement est donc entendue deux fois, en se chevauchant. Pour
jouer un enregistrement à la place, mettez un fichier WAV, MP3, OGG ou FLAC dans le dossier `assets` et utilisez
`load('coin.wav')` au lieu de `tone`.

Un programme lancé sans fenêtre, comme le font les tests, est silencieux : tous les appels fonctionnent et rien ne
s'entend.

## Ligne par ligne

- `import { tone } from 'zinc:audio';` une fonction du module de son. Les deux lignes `import` peuvent venir dans
  n'importe quel ordre.
- `const NAMES = [...]`, `HERTZ`, `COLORS` : trois listes de même longueur, une entrée par barre. Les notes C, D, E, F,
  G, A, B, C forment une gamme majeure ; le dernier C est une octave au-dessus du premier (523.3 vaut environ deux
  fois 261.6).
- `const COLORS: u32[] = [...]` une liste de couleurs : `u32[]` veut dire « une liste de u32 ».
- `const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));` `map` fabrique une nouvelle liste en appelant
  une fonction sur chaque entrée : ici, un son d'une demi-seconde par hauteur. Les sons sont fabriqués une seule fois,
  au début, et non à chaque clic.
- `const glow: number[] = HERTZ.map((hz: number) => 0);` une liste de huit zéros : à quel point chaque barre est
  allumée.
- `function play(i: number): void { ... }` joue la note numéro `i`, allume sa barre et l'affiche. `: void` veut dire
  qu'elle ne renvoie rien. Le clic et les touches l'appellent tous les deux : le code n'est écrit qu'une fois.
- `const bar = width() / NAMES.length;` la largeur d'une barre : la fenêtre découpée en huit.
- `if (pointerDown() && !wasDown) play(...)` un nouvel appui, comme dans la leçon 4. `Math.floor(pointerX() / bar)`
  transforme le x du pointeur en numéro de barre : 0 pour la première barre, 7 pour la dernière. `Math.min(NAMES.length - 1, ...)`
  garantit que le numéro ne vaut jamais 8, même tout à droite.
- `const n = parseInt(keyName(k));` transforme le nom de la touche en nombre : `'5'` devient `5`. Une touche qui n'est
  pas un chiffre (`'a'`) donne `NaN` (« not a number », pas un nombre), qui n'est ni `>= 1` ni `<= 8` : rien ne joue.
- `play(n - 1)` la touche 1 joue la barre 0 : les listes comptent à partir de 0.
- `glow[i] = Math.max(0, glow[i] - dt * 2);` la lumière de chaque barre baisse de 2 par seconde : de 1 à 0 en une
  demi-seconde.
- `const tall = height() * 0.6 + glow[i] * 40;` une barre allumée est plus haute de 40 pixels au maximum.
- `Math.round(140 + 115 * glow[i])` l'opacité : 140 au repos, 255 juste après avoir joué.
- Le dernier `drawText` écrit le nom de la note, centré dans sa barre comme dans la leçon 5.

## À vous de jouer

- Changez l'onde en `'square'`, puis en `'sine'`. Laquelle préférez-vous ?
- Jouez un accord : un appui joue trois notes à la fois (les barres `i`, `i + 2` et `i + 4`).
- Rendez un son plus fort ou plus doux : `notes[i].volume = 0.3;` avant `play()`. `pan` le déplace vers la gauche (-1)
  ou vers la droite (1).
- Enregistrez un son avec votre téléphone, sauvegardez-le sous `assets/clap.wav`, et jouez-le avec
  `load('clap.wav').play()` quand vous appuyez sur Espace.
- Jouez une mélodie : une liste de numéros de barres, et un minuteur dans `onFrame` qui joue la suivante toutes les
  demi-secondes.
- Toutes les fonctions de `zinc:audio` (boucles, volume, fichiers, sons calculés échantillon par échantillon) sont dans
  [la page du plugin audio](../plugins/audio.md).

## La suite

La partie 2 commence : [7. Les composants](07-components.md), une interface faite de boîtes, de texte, d'une image et
d'un bouton.
