---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 7. Les composants

**Ce que vous allez voir :** une carte blanche au milieu de la fenêtre, avec une fusée, un titre, une phrase et un
bouton violet *Join*. Un clic sur le bouton affiche une ligne.

![Une carte avec une fusée, le titre « Rocket club », une phrase et un bouton Join](img/07-components.png)

## Une nouvelle façon de mettre des choses à l'écran

Dans la partie 1, votre programme dessinait lui-même chaque image : il devait dire où va chaque chose, en pixels. Pour
une application (un formulaire, une liste, des réglages), c'est beaucoup de travail : le texte doit passer à la ligne,
les choses doivent s'aligner, la fenêtre peut changer de taille.

`zinc:ui` fait ce travail. Vous décrivez une seule fois ce que contient l'écran, sous forme d'**éléments** placés dans
d'autres éléments, comme on écrit une page web. Zinc les dispose, les dessine, et les dessine de nouveau quand quelque
chose change. La description utilise **JSX** : des balises comme en HTML, au milieu du code.

## Le code

Le projet est dans [`samples/07-components`](samples/07-components/). Le code est dans `src/main.tsx` : le `x` de
`.tsx` indique que le fichier contient du JSX. `zinc.json` le désigne comme point d'entrée et possède un dossier
`assets` pour l'image :

```json
{
  "name": "components",
  "entry": "src/main.tsx",
  "assets": "assets",
  "app": { "id": "com.example.learn.components", "window": { "width": 640, "height": 400 } }
}
```

`src/main.tsx` :

```tsx
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="w-full h-full items-center justify-center">
    <View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">
      <Image src="rocket.svg" className="w-24 h-24" />
      <Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>
      <Text className="text-base text-center text-[#625d55]">We build small rockets on Saturdays. Everyone is welcome.</Text>
      <Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>
        <Text className="text-base font-medium text-white">Join</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Cliquez sur *Join* : le terminal affiche `Welcome aboard!`

## Les éléments

Les éléments de Zinc commencent par une majuscule, comme dans React Native :

| Élément | Ce que c'est |
|---|---|
| `View` | une boîte. Elle contient d'autres éléments et les place ; elle peut avoir un fond, une bordure, des coins arrondis. |
| `Text` | des mots. Le texte va toujours dans un `Text`. |
| `Image` | une image du dossier `assets` : `src="rocket.svg"`. |
| `Button` | quelque chose sur quoi appuyer : il contient un `Text` (ou une icône) et lance `onClick` quand on appuie. |
| `ScrollView` | une boîte dont le contenu défile quand il est trop long. |
| `Input`, `TextArea` | un champ pour saisir une ligne, ou plusieurs (la leçon 12 utilise `Input`). |
| `Canvas` | une boîte où vous dessinez avec `zinc:gfx` (leçon 11). |

Deux règles d'écriture, vérifiées par Zinc : les éléments commencent par une majuscule (`<View>`), et l'aspect d'un
élément se met dans `className` (le mot plus court est un mot réservé de JavaScript, donc Zinc le refuse).

## Comment ils sont disposés

Une `View` place ses enfants les uns sous les autres, en partant du haut. `className` dit comment :

- `w-full h-full` : aussi large et aussi haut que son parent (ici toute la fenêtre).
- `items-center` : les enfants sont centrés dans l'autre sens (de gauche à droite, dans une colonne).
- `justify-center` : les enfants sont centrés dans le sens de la colonne (de haut en bas).
- `w-[340px]` : exactement 340 pixels de large. Les crochets contiennent une valeur exacte.
- `p-6` : de l'espace à l'intérieur de la boîte, sur tous les côtés. Les nombres de `p-`, `gap-`, `w-`, `h-` comptent
  par pas de 4 pixels : `p-6` fait 24 pixels, `gap-3` fait 12.
- `gap-3` : 12 pixels entre les enfants.

Il y a plus sur les styles dans la leçon 10.

## Ligne par ligne

- `import { render } from 'zinc:ui/solid';` `render` met une interface à l'écran. Les éléments eux-mêmes (`View`,
  `Text`...) n'ont pas besoin d'être importés.
- `function App(): i32 { return <View ...>...</View>; }` un **composant** : une fonction qui renvoie des éléments.
  `App` est toute l'interface. Son type est `i32` (un nombre entier) parce que Zinc désigne chaque élément qu'il crée
  par un numéro ; vous n'avez jamais besoin de regarder ce numéro.
- `<View className="w-full h-full items-center justify-center">` la boîte extérieure remplit la fenêtre et centre ce
  qu'elle contient : la carte.
- `<View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">` la carte : 340 pixels de large, 24 pixels
  de marge intérieure, 12 pixels entre ses enfants, des enfants centrés, des coins très arrondis (`rounded-2xl`), un
  fond blanc. Sa hauteur n'est pas donnée : elle s'adapte à son contenu.
- `<Image src="rocket.svg" className="w-24 h-24" />` l'image, de 96 sur 96 pixels. `/>` ferme un élément qui ne
  contient rien.
- `<Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>` un titre : grand (`text-2xl`), en gras,
  presque noir. `text-[#1d1b18]` est une couleur exacte, écrite comme sur le web.
- `<Text className="text-base text-center text-[#625d55]">...` une phrase de taille normale, centrée, grise. Elle est
  plus longue que la largeur de la carte, donc elle passe toute seule sur deux lignes.
- `<Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>` un bouton
  de 44 pixels de haut, avec 24 pixels de marge à gauche et à droite (`px-6`), des bouts ronds, violet. `onClick={...}`
  lui donne une fonction à lancer quand on appuie : les accolades `{ }` mettent du code dans le JSX. La leçon 9 parle
  des événements.
- `render(App, 0xf3f1ec, null);` affiche `App` dans la fenêtre. Le deuxième argument est la couleur de fond de la
  fenêtre (un nombre, comme dans la partie 1). Le troisième est une fonction à lancer à chaque image ; `null` veut
  dire aucune.

## À vous de jouer

- Changez le titre et la phrase. Allongez la phrase et regardez-la passer à la ligne.
- Mettez l'image après le bouton. L'ordre des éléments est l'ordre à l'écran.
- Ajoutez `flex-row` au `className` de la carte : les enfants se placent côte à côte.
- Élargissez la carte (`w-[480px]`), ou enlevez `w-[340px]` pour voir ce que fait la carte sans largeur.
- Ajoutez un deuxième bouton à côté du premier : entourez les deux de `<View className="flex-row gap-3">...</View>`.
- Faites votre propre composant : `function Title(): i32 { return <Text className="text-3xl">Hi</Text>; }`, puis
  écrivez `<Title />` dans `App`.

## La suite

[8. L'état](08-state.md) : une interface qui change quand une valeur change.
