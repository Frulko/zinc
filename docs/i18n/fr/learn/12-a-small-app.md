---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 12. Une petite application complète

**Ce que vous allez voir :** une liste de courses. Tapez quelque chose dans le champ et appuyez sur Entrée (ou cliquez sur
*Add*) : cela rejoint la liste. Cliquez sur un article pour le cocher comme acheté ; cliquez encore pour le remettre. *Clear
bought* retire les articles cochés. La ligne du bas compte ce qu'il reste à acheter.

![Une liste de courses avec Bread et Apples cochés, Milk et Green tea à acheter](img/12-a-small-app.png)

## Le code

Le projet se trouve dans [`samples/12-a-small-app`](samples/12-a-small-app/). `src/main.tsx` :

```tsx
import { createSignal, render, For } from 'zinc:ui/solid';

class Item {
  text: string;
  done: boolean;
  constructor(text: string, done: boolean) { this.text = text; this.done = done; }
}

const [items, setItems] = createSignal<Item[]>([new Item('Bread', false), new Item('Apples', true)]);
const [draft, setDraft] = createSignal<string>('');

function add(): void {
  const text = draft().trim();
  if (text === '') return;
  setItems([...items(), new Item(text, false)]);
  setDraft('');
  console.log(`added "${text}", ${left()} left to buy`);
}

function toggle(item: Item): void {
  setItems(items().map((it: Item) => it === item ? new Item(it.text, !it.done) : it));
  console.log(`${item.text} ${item.done ? 'back on the list' : 'bought'}, ${left()} left to buy`);
}

function clearDone(): void {
  setItems(items().filter((it: Item) => !it.done));
  console.log(`cleared, ${items().length} on the list`);
}

function left(): i32 {
  return items().filter((it: Item) => !it.done).length;
}

interface RowProps { item: Item }

function Row(props: RowProps): i32 {
  const item = props.item;
  return <Button className="flex-row items-center justify-start gap-3 px-4 h-12 rounded-lg bg-white hover:bg-slate-50" onClick={() => toggle(item)}>
    <View className={`w-5 h-5 rounded-full border-2 ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
    <Text className={`text-base ${item.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.text}</Text>
  </Button>;
}

function App(): i32 {
  return <View className="w-full h-full items-center p-8 bg-slate-100">
    <View className="w-[420px] gap-3">
      <Text className="text-3xl font-bold text-slate-900">Shopping list</Text>
      <View className="flex-row gap-2" onSubmit={add}>
        <Input className="grow h-11 px-3 rounded-lg bg-white border border-slate-300" placeholder="Something to buy"
          value={draft()} onInput={(v: string) => setDraft(v)} />
        <Button className="h-11 px-5 rounded-lg bg-indigo-600" onClick={add}>
          <Text className="text-base text-white">Add</Text>
        </Button>
      </View>
      <For each={items()}>{(item: Item) => <Row item={item} />}</For>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-slate-500">{`${left()} left to buy`}</Text>
        <Button className="h-9 px-4 rounded-lg bg-slate-200 hover:bg-slate-300" onClick={clearDone}>
          <Text className="text-sm text-slate-600">Clear bought</Text>
        </Button>
      </View>
    </View>
  </View>;
}

render(App, 0xf1f5f9, null);
```

Tapez `Milk`, appuyez sur Entrée, ajoutez `Green tea` avec le bouton, cochez *Bread*, puis *Clear bought* : le terminal affiche

```text
added "Milk", 2 left to buy
added "Green tea", 3 left to buy
Bread bought, 2 left to buy
cleared, 2 on the list
```

## Comment l'application est construite

Tout ce que l'application sait tient dans deux signaux : `items`, la liste, et `draft`, le texte en cours de saisie. Les
fonctions `add`, `toggle` et `clearDone` sont les seuls endroits qui les modifient. L'interface les lit et suit. Quand vous
écrirez une application, commencez de la même façon : de quoi a-t-elle besoin de se souvenir (les signaux), que peut faire
l'utilisateur (les fonctions), et que montre l'écran (les composants) ?

La liste n'est jamais modifiée sur place. Pour ajouter un article, `add` fabrique une **nouvelle** liste avec les anciens
articles et le nouveau, et la donne à `setItems`. Pour cocher un article, `toggle` fabrique une nouvelle liste où cet article
est remplacé par un nouveau. Un signal remarque un changement quand on lui donne une valeur différente ; une liste modifiée
sur place resterait la même liste, et rien ne se mettrait à jour.

## Ligne par ligne

- `import { createSignal, render, For } from 'zinc:ui/solid';` `For` affiche un élément par article d'une liste.
- `class Item { ... }` décrit une chose à acheter : son `text` et si elle est `done` (faite). Le `constructor` est la
  fonction qu'appelle `new Item('Bread', false)` pour remplir un nouvel article.
- `createSignal<Item[]>([new Item('Bread', false), new Item('Apples', true)])` la liste, qui commence avec deux articles, les
  pommes déjà achetées.
- `createSignal<string>('')` le texte du champ, vide au départ.
- `function add(): void` lit le brouillon, `trim()` retire les espaces aux deux bouts, et un texte vide n'ajoute rien.
  `[...items(), new Item(text, false)]` est une nouvelle liste : `...` y répand les anciens articles, le nouveau vient en
  dernier. Ensuite `setDraft('')` vide le champ.
- `function toggle(item: Item): void` `items().map(...)` fabrique une nouvelle liste de la même longueur : l'article cliqué
  est remplacé par une copie dont `done` est inversé (`!it.done`), les autres restent tels quels.
- `function clearDone(): void` `filter` garde les articles pour lesquels la fonction répond `true` : ceux qui ne sont pas faits.
- `function left(): i32` compte les articles pas encore faits. Le texte du bas la lit, donc il suit la liste.
- `interface RowProps { item: Item }` et `function Row(props: RowProps): i32` un composant pour une ligne, comme dans la
  leçon 10. La ligne est un `Button` (toute la ligne peut donc être cliquée) disposé en ligne : un cercle, puis le texte.
- `${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}` le cercle est vert quand l'article est fait, un
  anneau vide sinon. Le texte est gris et barré (`line-through`) quand l'article est fait.
- `<View className="flex-row gap-2" onSubmit={add}>` le champ et le bouton *Add* côte à côte. `onSubmit` se déclenche quand on
  appuie sur Entrée dans un champ d'une seule ligne placé dans cet élément : Entrée ajoute, comme le bouton.
- `<Input ... value={draft()} onInput={(v: string) => setDraft(v)} />` le champ de texte. `value` est ce qu'il affiche : le
  brouillon. `onInput` se déclenche après chaque touche tapée, avec le nouveau texte, qui va dans le signal. Ainsi le champ
  et le signal sont toujours d'accord, et `setDraft('')` dans `add` vide le champ. `placeholder` est l'indice gris affiché
  tant qu'il est vide.
- `<For each={items()}>{(item: Item) => <Row item={item} />}</For>` une `Row` par article. Quand la liste change, `For` garde
  les lignes des articles toujours présents, ajoute des lignes pour les nouveaux et retire les autres.
- `<View className="flex-row items-center justify-between">` la ligne du bas : le compte à gauche, *Clear bought* à droite
  (`justify-between` les pousse aux deux extrémités).

## À vous de jouer

- Affichez un message quand la liste est vide : `<Show when={items().length === 0}><Text>Nothing to buy.</Text></Show>`
  (importez aussi `Show`).
- Ajoutez une quantité à chaque article : un nombre dans `Item`, affiché après le texte, et un bouton *+* dans chaque ligne.
- Mettez d'abord les articles pas encore achetés : triez la liste dans `add` et `toggle`.
- Gardez la liste quand l'application se ferme : `zinc:storage` enregistre du texte sur l'appareil. Enregistrez le
  `JSON.stringify` des textes après chaque changement, et relisez-les au démarrage.
- Faites défiler la liste quand elle est longue : mettez le `For` dans un `<ScrollView className="grow">`.
- Utilisez les composants prêts à l'emploi de [la boîte à composants](../ui-kit.md) (`Button`, `Card`, `List`, `Switch`...)
  pour un rendu fini.

## Où aller ensuite

Vous connaissez les deux façons de mettre des choses à l'écran, comment répondre au clavier, à la souris et au toucher,
comment dessiner et jouer du son, et comment construire une interface qui suit son état. Maintenant :

- [Référence de zinc:gfx](../reference/gfx.md) et [référence des événements de zinc:ui](../reference/ui-events.md) : tout ce
  que ces leçons ont utilisé, et le reste.
- [Applications d'interface](../guide/03-ui-apps.md) et [zinc:ui en détail](../ui.md) : défilement, champs de texte,
  animations, calques, fenêtres.
- `zinc new desktop-app` crée une application plus grande avec des pages, un menu et des réglages ; `zinc new game-2d` un petit
  jeu complet. Lisez leur code : vous en connaissez maintenant chaque partie.
- [Retour au début du parcours](README.md).
