---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 10. Les styles

**Ce que vous allez voir :** trois cartes, *Sunrise*, *Forest* et *Night*, chacune avec un échantillon de couleur.
Cliquez sur l'une : elle prend une bordure violette et une ombre, et toute la page prend ses couleurs (Night la rend
sombre).

![Trois cartes sur une page sombre, la carte Night sélectionnée](img/10-styles.png)

## Le code

Le projet est dans [`samples/10-styles`](samples/10-styles/). `src/main.tsx` :

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const [theme, setTheme] = createSignal<string>('Sunrise');

function pick(name: string): void {
  setTheme(name);
  console.log(`theme: ${name}`);
}

function page(): string {
  if (theme() === 'Night') return 'bg-slate-900';
  if (theme() === 'Forest') return 'bg-emerald-50';
  return 'bg-amber-50';
}

function title(): string {
  return theme() === 'Night' ? 'text-slate-100' : 'text-slate-900';
}

interface CardProps { name: string; swatch: string; words: string }

function Card(props: CardProps): i32 {
  const chosen = (): boolean => theme() === props.name;
  return <Button
    className={`w-[170px] p-4 gap-2 rounded-xl bg-white border-2 hover:bg-slate-50 ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}
    onClick={() => pick(props.name)}>
    <View className={`w-full h-16 rounded-lg ${props.swatch}`} />
    <Text className="text-lg font-bold text-slate-900">{props.name}</Text>
    <Text className="text-sm text-slate-500">{props.words}</Text>
  </Button>;
}

function App(): i32 {
  return <View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>
    <Text className={`text-3xl font-bold ${title()}`}>Pick a theme</Text>
    <View className="flex-row gap-4">
      <Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />
      <Card name="Forest" swatch="bg-emerald-600" words="Calm and green" />
      <Card name="Night" swatch="bg-indigo-900" words="Easy on the eyes" />
    </View>
  </View>;
}

render(App, 0xffffff, null);
```

Cliquez sur *Night* : la page devient sombre et le terminal affiche `theme: Night`.

## Comment fonctionne `className`

`className` contient une liste de petits mots séparés par des espaces, chacun réglant une seule chose. Ce sont les mots
de [Tailwind CSS](https://tailwindcss.com), un système de styles pour le web : si vous le connaissez, vous connaissez
ceux-ci. Quand `className` est un simple texte entre guillemets, Zinc le lit avant que le programme ne se lance et
vous prévient si un mot n'existe pas.

| Pour régler | Écrivez | Exemples |
|---|---|---|
| largeur, hauteur | `w-*`, `h-*` | `w-24` (96 px), `w-full` (tout le parent), `h-[200px]` (exactement 200) |
| espace à l'intérieur | `p-*`, `px-*`, `py-*`, `pt-*`... | `p-4` (16 px de chaque côté), `px-6` (24 px à gauche et à droite) |
| espace entre les enfants | `gap-*` | `gap-4` |
| direction | `flex-row`, `flex-col` | côte à côte, ou l'un sous l'autre (par défaut) |
| alignement | `items-*`, `justify-*` | `items-center`, `justify-between` (le premier au début, le dernier à la fin) |
| croissance | `grow` | prend la place restante dans son parent |
| fond | `bg-*` | `bg-white`, `bg-amber-400`, `bg-[#5746e0]` |
| texte | `text-*`, `font-*` | `text-sm`, `text-2xl`, `text-slate-500`, `font-bold`, `text-center` |
| coins | `rounded-*` | `rounded-lg`, `rounded-xl`, `rounded-full` |
| bordure | `border`, `border-2`, `border-*` | `border-2 border-indigo-600` (2 px, violette) |
| ombre | `shadow-*` | `shadow-sm`, `shadow-lg` |
| transparence | `opacity-*` | `opacity-50` |

Les nombres comptent par pas de 4 pixels (`p-4` fait 16 px). Les couleurs ont un nom et une teinte de 50 (très claire)
à 950 (très sombre) : `slate`, `gray`, `red`, `orange`, `amber`, `yellow`, `green`, `emerald`, `teal`, `sky`,
`blue`, `indigo`, `violet`, `purple`, `pink`, `rose` et d'autres. Toute valeur exacte se met entre crochets :
`w-[170px]`, `bg-[#f3f1ec]`.

Un mot avec un préfixe ne s'applique que dans un état : `hover:bg-slate-50` quand le pointeur est sur l'élément,
`active:bg-slate-100` pendant qu'on appuie dessus, `focus:border-blue-500` quand il a le focus du clavier.

## Ligne par ligne

- `const [theme, setTheme] = createSignal<string>('Sunrise');` le thème choisi, un signal qui contient son nom.
- `function page(): string` donne les classes de la page pour le thème choisi : un ambre clair, un vert clair, ou un
  gris ardoise sombre. `title()` fait de même pour la couleur du titre : du texte clair sur la page sombre.
- `interface CardProps { name: string; swatch: string; words: string }` décrit ce dont une carte a besoin : une
  **interface** liste les noms et les types des valeurs que contient un objet.
- `function Card(props: CardProps): i32` un composant à vous. Il reçoit ses valeurs dans un seul objet, `props` (pour
  « properties », les propriétés) : `props.name`, `props.swatch`, `props.words`.
- `const chosen = (): boolean => theme() === props.name;` une petite fonction : cette carte est-elle la carte choisie ?
- `className={`w-[170px] p-4 gap-2 ... ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}`
  les classes de la carte. La première partie ne change jamais : 170 pixels de large, de la marge intérieure, des
  coins arrondis, un fond blanc, une bordure de 2 pixels, un fond plus clair au survol. La partie dans `${ }` change
  avec le signal : la carte choisie reçoit une bordure violette et une grande ombre, les autres une bordure claire et
  une petite ombre. Comme le texte lit `theme()`, les classes sont recalculées à chaque changement de thème.
- `<View className={`w-full h-16 rounded-lg ${props.swatch}`} />` l'échantillon : pleine largeur, 64 pixels de haut,
  avec la classe de couleur que la carte a reçue.
- `<Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />` utilise le composant. Chaque attribut devient
  un champ de `props`. Les composants que vous écrivez commencent par une majuscule, comme ceux de Zinc.
- `<View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>` la page : son fond suit le
  thème.

## À vous de jouer

- Ajoutez un quatrième thème, *Ocean*, avec `bg-sky-500` comme échantillon et `bg-sky-50` comme page.
- Faites ressortir davantage la carte choisie : `bg-indigo-50` quand elle est choisie.
- Remplacez `hover:bg-slate-50` par `hover:bg-amber-100` et passez le pointeur sur les cartes.
- Mettez les cartes les unes sous les autres : changez `flex-row` en `flex-col`.
- Arrondissez complètement les cartes avec `rounded-3xl`, ou rendez-les carrées avec `rounded-none`.
- Écrivez un style que `className` ne sait pas dire, sous forme d'objet : `style={{ opacity: 0.8 }}` (la leçon 8
  utilisait `style={{ width: ... }}`). [zinc:ui en détail](../ui.md#object-styles-and-stylesheet) liste les clés de
  style, et [Les styles en objets](../start/beyond.md#styles-as-objects) écrit un écran entier avec eux, comme le fait React Native.

## La suite

[11. Un dessin dans une interface](11-drawing-in-an-interface.md) : mélangez la partie 1 et la partie 2.
