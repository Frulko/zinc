---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 8. L'état

**Ce que vous allez voir :** un compteur de verres d'eau, une barre bleue qui grandit avec lui, une phrase qui change,
et deux boutons, *One less* et *I drank one*.

![2 / 8 en gros chiffres, une barre bleue remplie au quart, « 6 more to go. » et deux boutons](img/08-state.png)

## Le code

Le projet est dans [`samples/08-state`](samples/08-state/). `src/main.tsx` :

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const GOAL = 8;
const [glasses, setGlasses] = createSignal<i32>(0);

function drink(by: i32): void {
  const next = glasses() + by;
  if (next < 0 || next > GOAL) return;
  setGlasses(next);
  console.log(`glasses: ${glasses()}`);
}

function message(): string {
  if (glasses() === 0) return 'Time for a glass of water.';
  if (glasses() < GOAL) return `${GOAL - glasses()} more to go.`;
  return 'Goal reached. Well done!';
}

function App(): i32 {
  return <View className="w-full h-full items-center justify-center gap-5">
    <Text className="text-6xl font-bold text-[#1d1b18]">{`${glasses()} / ${GOAL}`}</Text>
    <View className="w-[320px] h-4 rounded-full bg-[#e9e6df]">
      <View className="h-4 rounded-full bg-[#2563c9]" style={{ width: glasses() * 40 }} />
    </View>
    <Text className="text-lg text-[#625d55]">{message()}</Text>
    <View className="flex-row gap-3">
      <Button className="h-11 px-5 rounded-full bg-[#e9e6df]" onClick={() => drink(-1)}>
        <Text className="text-base text-[#1d1b18]">One less</Text>
      </Button>
      <Button className="h-11 px-5 rounded-full bg-[#2563c9]" onClick={() => drink(1)}>
        <Text className="text-base text-white">I drank one</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Cliquez trois fois sur *I drank one*, puis sur *One less* : le terminal affiche `glasses: 1`, `glasses: 2`,
`glasses: 3`, `glasses: 2`, et l'écran suit chaque clic.

## Les signaux : des valeurs que l'écran suit

La fonction `App` s'exécute **une seule fois**, quand l'interface est construite. Si `glasses` était une simple
variable (`let glasses = 0`), la modifier plus tard ne changerait rien à l'écran : le texte a déjà été fabriqué.

Un **signal** est une valeur que l'interface suit. `createSignal` vous donne deux fonctions :

- `glasses()` lit la valeur. Toute partie de l'interface qui la lit (un texte, un style, une classe) s'en souvient.
- `setGlasses(3)` change la valeur. Chaque partie qui l'a lue est mise à jour, et seulement celles-là.

C'est toute l'idée de l'état dans `zinc:ui` : gardez ce qui peut changer dans des signaux, lisez-les là où ils sont
affichés, et changez-les dans vos gestionnaires d'événements. L'écran suit tout seul.

## Ligne par ligne

- `import { createSignal, render } from 'zinc:ui/solid';` `zinc:ui/solid` fonctionne comme
  [Solid](https://www.solidjs.com), une bibliothèque web : des signaux et des composants qui ne s'exécutent qu'une
  fois. (`zinc:ui/react` fonctionne plutôt comme React ; ces leçons utilisent Solid.)
- `const GOAL = 8;` le nombre de verres à boire, une simple constante : elle ne change jamais.
- `const [glasses, setGlasses] = createSignal<i32>(0);` un signal qui contient un nombre entier (`<i32>`), qui part de
  0. `createSignal` renvoie deux choses ; les crochets les nomment, dans l'ordre : le lecteur et l'écrivain.
- `function drink(by: i32): void { ... }` ajoute `by` (1 ou -1) au compte. `if (next < 0 || next > GOAL) return;`
  s'arrête là quand le compte passerait sous 0 ou au-dessus de 8 (`||` veut dire « ou »). Ensuite `setGlasses(next)`
  change la valeur et l'écran suit.
- `function message(): string { ... }` choisit une phrase selon le compte. C'est une fonction ordinaire, mais elle lit
  `glasses()` : un texte qui affiche `message()` suit donc lui aussi le signal.
- `<Text ...>{`${glasses()} / ${GOAL}`}</Text>` le gros nombre. Le code dans un texte se met entre `{ }` ; ici une
  chaîne modèle avec le compte et l'objectif.
- `<View className="w-[320px] h-4 rounded-full bg-[#e9e6df]">` la barre vide : 320 pixels de large, d'un gris clair.
- `<View className="h-4 rounded-full bg-[#2563c9]" style={{ width: glasses() * 40 }} />` la partie bleue à l'intérieur.
  `style={{ ... }}` fixe un style à partir d'une valeur : sa largeur est de 40 pixels par verre, donc 8 verres
  remplissent les 320. Elle lit `glasses()`, elle grandit donc quand le signal change. (Les doubles accolades sont un
  objet JavaScript `{ width: ... }` placé dans les `{ }` du JSX.)
- `<Text ...>{message()}</Text>` la phrase, mise à jour avec le compte.
- `onClick={() => drink(-1)}` et `onClick={() => drink(1)}` : chaque bouton appelle `drink` avec son propre pas.

## À vous de jouer

- Changez l'objectif en 6. La barre est maintenant trop courte quand elle est pleine : donnez-lui la largeur
  `glasses() * (320 / GOAL)`.
- Ajoutez un bouton *Reset* qui appelle `setGlasses(0)`.
- Faites devenir le nombre vert quand l'objectif est atteint : `className={...}` peut lui aussi lire des signaux,
  comme le montre la leçon 10. Essayez
  `className={glasses() === GOAL ? 'text-6xl font-bold text-emerald-600' : 'text-6xl font-bold text-[#1d1b18]'}`.
- Ajoutez un deuxième signal, `cups` de thé, avec ses propres boutons et sa propre ligne.
- Affichez le compte avec `console.log` dans `message()`, et regardez quand elle s'exécute : une fois au début, puis
  seulement quand le compte change, jamais pendant les images entre les deux.

## La suite

[9. Les événements](09-events.md) : un clic est un genre d'événement ; il y a aussi les appuis, les déplacements, les
survols et les touches.
