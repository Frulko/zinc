---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 9. Les événements

**Ce que vous allez voir :** une boîte blanche avec un point rose. Appuyez dans la boîte et le point saute à cet
endroit ; faites glisser et il suit ; les flèches du clavier le déplacent ; la bordure de la boîte devient violette
tant que le pointeur est dessus. Une phrase dit ce qui s'est passé, et un bouton *Reset* remet le point au milieu.

![Une boîte blanche à bordure violette, un point rose, une phrase et un bouton Reset](img/09-events.png)

## Le code

Le projet est dans [`samples/09-events`](samples/09-events/). `src/main.tsx` :

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

const [dotX, setDotX] = createSignal<number>(150);
const [dotY, setDotY] = createSignal<number>(100);
const [pressed, setPressed] = createSignal<boolean>(false);
const [over, setOver] = createSignal<boolean>(false);
const [news, setNews] = createSignal<string>('Press in the box, drag, or use the arrow keys.');

function moveTo(x: number, y: number): void {
  setDotX(Math.max(0, Math.min(300, x)));
  setDotY(Math.max(0, Math.min(200, y)));
}

function down(e: ui.PointerEvent): void {
  setPressed(true);
  moveTo(e.x, e.y);
  setNews(`Pressed at ${Math.round(e.x)}, ${Math.round(e.y)} inside the box.`);
  console.log(news());
}

function drag(e: ui.PointerEvent): void {
  if (pressed()) moveTo(e.x, e.y);
}

function up(e: ui.PointerEvent): void {
  setPressed(false);
  setNews(`Let go at ${Math.round(e.x)}, ${Math.round(e.y)}.`);
  console.log(news());
}

ui.onKey((e: ui.KeyEvent) => {
  if (e.key === 'ArrowLeft') moveTo(dotX() - 10, dotY());
  else if (e.key === 'ArrowRight') moveTo(dotX() + 10, dotY());
  else if (e.key === 'ArrowUp') moveTo(dotX(), dotY() - 10);
  else if (e.key === 'ArrowDown') moveTo(dotX(), dotY() + 10);
  else return;
  e.preventDefault();   // this key is used: it does not also move the keyboard focus
  setNews(`Key ${e.key}: the dot is at ${dotX()}, ${dotY()}.`);
  console.log(news());
});

function reset(): void {
  moveTo(150, 100);
  setNews('Back to the middle.');
  console.log(news());
}

function App(): i32 {
  return <View className="w-full h-full items-center justify-center gap-4">
    <View className={`w-[300px] h-[200px] rounded-xl bg-white border-2 ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}
      onPointerDown={down} onPointerMove={drag} onPointerUp={up}
      onPointerEnter={(e: ui.PointerEvent) => setOver(true)} onPointerLeave={(e: ui.PointerEvent) => setOver(false)}>
      <View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />
    </View>
    <Text className="text-base text-[#625d55]">{news()}</Text>
    <Button className="h-10 px-5 rounded-full bg-[#5746e0]" onClick={reset}>
      <Text className="text-base text-white">Reset</Text>
    </Button>
  </View>;
}

render(App, 0xf3f1ec, null);
```

Appuyez dans la boîte près de son coin en haut à gauche, faites glisser, relâchez, puis appuyez sur la flèche gauche :
le terminal affiche `Pressed at 30, 28 inside the box.`, `Let go at 230, 148.`,
`Key ArrowLeft: the dot is at 220, 148.`

## Ce qu'est un événement

Un **événement** est quelque chose qui se passe : un appui, un déplacement, une touche. Vous donnez à un élément une
fonction pour un événement, dans un attribut dont le nom commence par `on` ; Zinc appelle la fonction quand
l'événement se produit sur cet élément.

| Attribut | Quand il s'exécute | Ce que la fonction reçoit |
|---|---|---|
| `onClick` | l'élément a été pressé puis relâché (souris, doigt, ou Entrée et Espace quand il a le focus du clavier) | rien |
| `onPointerDown` | un bouton ou un doigt s'abaisse sur l'élément | un `PointerEvent` |
| `onPointerMove` | le pointeur se déplace dessus ; après un appui sur lui, partout jusqu'au relâchement | un `PointerEvent` |
| `onPointerUp` | le bouton ou le doigt se relève, après un appui sur l'élément | un `PointerEvent` |
| `onPointerEnter`, `onPointerLeave` | le pointeur arrive sur l'élément, ou le quitte | un `PointerEvent` |
| `onKeyDown` | une touche s'enfonce pendant que l'élément (ou un élément à l'intérieur) a le focus du clavier | un `KeyEvent` |

Un `PointerEvent` dit où : `e.x` et `e.y` sont mesurés **depuis le coin en haut à gauche de l'élément**, et non de la
fenêtre (`e.gx`, `e.gy` sont mesurés depuis le coin de la fenêtre). Il dit aussi quel bouton (`e.button` : 0 gauche, 1
milieu, 2 droit) et quelles touches étaient maintenues (`e.shift`, `e.ctrl`, `e.alt`, `e.meta`). Tous les événements et
ce qu'ils donnent sont listés dans [la référence des événements de zinc:ui](../reference/ui-events.md) ; il y a aussi
les tapes, les appuis longs, les glissements et les pincements.

## Ligne par ligne

- `import * as ui from 'zinc:ui';` prend tout le module `zinc:ui` sous le nom `ui` : les types `ui.PointerEvent` et
  `ui.KeyEvent` et la fonction `ui.onKey` en viennent.
- Cinq signaux : `dotX` et `dotY` (où est le point, dans la boîte), `pressed` (un bouton est-il enfoncé ?), `over` (le
  pointeur est-il sur la boîte ?), et `news`, la phrase sous la boîte. `createSignal<number>(150)` contient un nombre
  quelconque, `<boolean>` vrai ou faux, `<string>` du texte.
- `function moveTo(x: number, y: number): void` met le point en (x, y), en le gardant dans la boîte de 300 sur 200.
- `function down(e: ui.PointerEvent): void` s'exécute à l'appui : retient qu'un bouton est enfoncé, déplace le point
  là où est le pointeur (`e.x`, `e.y`, dans la boîte), écrit la phrase et l'affiche.
- `function drag(e: ui.PointerEvent): void` s'exécute à chaque déplacement sur la boîte, et après un appui sur la boîte
  à chaque déplacement n'importe où : la boîte **capture** le pointeur jusqu'au relâchement, donc un glissement qui
  sort de la boîte n'est pas perdu. Elle ne déplace le point que tant que `pressed()` est vrai.
- `function up(e: ui.PointerEvent): void` s'exécute au relâchement.
- `ui.onKey((e: ui.KeyEvent) => { ... });` un gestionnaire de touches pour toute la fenêtre : il reçoit les touches
  dont rien d'autre ne s'est servi. `e.key` est le nom de la touche, comme dans la leçon 3 (`'ArrowLeft'`, `'a'`,
  `'Enter'`).
- `else return;` n'importe quelle autre touche : ne rien faire, et laisser la touche à Zinc.
- `e.preventDefault();` dit « cette touche est utilisée ». Sans cela, les flèches déplaceraient aussi le focus du
  clavier de bouton en bouton, comme dans toutes les applications.
- `function reset(): void` remet le point en place et le dit.
- `className={`... ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}` la bordure de la boîte : violette tant que
  `over()` est vrai, gris clair sinon. La classe lit un signal, elle change donc avec lui.
- `onPointerDown={down} onPointerMove={drag} onPointerUp={up}` donne à la boîte ses trois fonctions. Une fonction peut
  être donnée par son nom (`down`) ou écrite sur place (`(e: ui.PointerEvent) => setOver(true)`).
- `<View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />` le
  point. `absolute` le sort de la disposition : `left` et `top` le placent depuis le coin en haut à gauche de son
  parent, la boîte. Moins 12 (la moitié de sa taille) le centre sur le point.
- `<Button ... onClick={reset}>` le bouton lance `reset` quand on clique.

## À vous de jouer

- Faites qu'un double clic remette le point au milieu : `onDoubleClick={(e: ui.PointerEvent) => reset()}` sur la
  boîte.
- Faites qu'un clic droit change la couleur du point : dans `down`, testez `e.button === 2`.
- Maintenez Maj pour avancer de 50 avec les flèches : `const step = e.shift ? 50 : 10;`.
- Dessinez une traînée : gardez les dernières positions dans un signal qui contient une liste, et montrez une petite
  `View` par position.
- Utilisez `onKeyDown` au lieu de `ui.onKey` : mettez `focusable onKeyDown={...}` sur la boîte. Maintenant les touches
  ne marchent qu'après avoir cliqué sur la boîte (elle a le focus), ce qui est ce qu'on veut quand une fenêtre a
  plusieurs boîtes de ce genre.
- Remplacez les trois gestionnaires de pointeur par un seul `onDrag={(e: ui.PointerEvent) => moveTo(e.x, e.y)}` : un
  glissement commence après que le pointeur a bougé de 8 pixels, et `e.phase` dit s'il commence (0), avance (1) ou
  se termine (2).

## La suite

[10. Les styles](10-styles.md) : couleurs, tailles, bordures et ombres avec `className`.
