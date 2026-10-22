---
source: 24c9dcf2422fedfc783f1401835b3320a8c61697
---
# 12. Eine kleine fertige App

**Das wirst du sehen:** eine Einkaufsliste. Tippe etwas in das Feld und drücke Enter (oder klicke auf *Add*): Es kommt in die
Liste. Klicke auf einen Eintrag, um ihn als gekauft abzuhaken; klicke noch einmal, um ihn zurückzulegen. *Clear bought* entfernt die abgehakten Einträge. Die Zeile
unten zählt, was noch zu kaufen ist.

![Eine Einkaufsliste mit abgehakten Bread und Apples, Milk und Green tea sind noch zu kaufen](img/12-a-small-app.png)

## Der Code

Das Projekt liegt in [`samples/12-a-small-app`](samples/12-a-small-app/). `src/main.tsx`:

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
        <Input className="text-[14px] py-1.5 grow h-11 px-3 rounded-lg bg-white border border-slate-300" placeholder="Something to buy"
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

Tippe `Milk`, drücke Enter, füge `Green tea` mit dem Button hinzu, hake *Bread* ab und klicke dann auf *Clear bought*: Das Terminal zeigt

```text
added "Milk", 2 left to buy
added "Green tea", 3 left to buy
Bread bought, 2 left to buy
cleared, 2 on the list
```

## Wie die App gebaut ist

Alles, was die App weiß, steckt in zwei Signalen: `items`, die Liste, und `draft`, der Text, der gerade getippt wird. Die Funktionen `add`,
`toggle` und `clearDone` sind die einzigen Stellen, die sie ändern. Die Oberfläche liest sie und folgt. Wenn du eine
App schreibst, fange genauso an: Was muss sie sich merken (die Signale), was kann der Benutzer tun (die Funktionen) und was
zeigt der Bildschirm (die Komponenten)?

Die Liste wird nie an Ort und Stelle verändert. Um einen Eintrag hinzuzufügen, macht `add` eine **neue** Liste mit den alten Einträgen und dem neuen und
gibt sie an `setItems`. Um einen Eintrag abzuhaken, macht `toggle` eine neue Liste, in der dieser Eintrag durch einen neuen ersetzt ist. Ein Signal
bemerkt eine Änderung, wenn es einen anderen Wert bekommt; eine Liste, die an Ort und Stelle verändert wird, wäre immer noch dieselbe Liste, und nichts
würde aktualisiert.

## Zeile für Zeile

- `import { createSignal, render, For } from 'zinc:ui/solid';` `For` zeigt ein Element pro Eintrag einer Liste.
- `class Item { ... }` beschreibt eine Sache, die man kaufen soll: ihren `text` und ob sie `done` ist. Der `constructor` ist die
  Funktion, die `new Item('Bread', false)` aufruft, um einen neuen Eintrag zu füllen.
- `createSignal<Item[]>([new Item('Bread', false), new Item('Apples', true)])` die Liste, die mit zwei Einträgen beginnt,
  die Äpfel schon gekauft.
- `createSignal<string>('')` der Text des Feldes, am Anfang leer.
- `function add(): void` liest den Entwurf, `trim()` entfernt die Leerzeichen an beiden Enden, und ein leerer Text fügt nichts hinzu.
  `[...items(), new Item(text, false)]` ist eine neue Liste: `...` verteilt die alten Einträge hinein, der neue kommt zuletzt. Dann
  leert `setDraft('')` das Feld.
- `function toggle(item: Item): void` `items().map(...)` macht eine neue Liste gleicher Länge: Der angeklickte Eintrag wird
  durch eine Kopie mit umgekehrtem `done` ersetzt (`!it.done`), die anderen bleiben, wie sie sind.
- `function clearDone(): void` `filter` behält die Einträge, für die die Funktion `true` sagt: die nicht erledigten.
- `function left(): i32` zählt die nicht erledigten Einträge. Der Text unten liest sie, er folgt also der Liste.
- `interface RowProps { item: Item }` und `function Row(props: RowProps): i32` eine Komponente für eine Zeile, wie in Lektion 10.
  Die Zeile ist ein `Button` (sodass die ganze Zeile angeklickt werden kann), als Zeile angeordnet: ein Kreis, dann der Text.
- `${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}` Der Kreis ist grün, wenn erledigt, sonst ein leerer
  Ring. Der Text ist grau und durchgestrichen (`line-through`), wenn erledigt.
- `<View className="flex-row gap-2" onSubmit={add}>` das Feld und der Button *Add* nebeneinander. `onSubmit` läuft, wenn
  in einem einzeiligen Feld in diesem Element Enter gedrückt wird: Enter fügt hinzu, wie der Button.
- `<Input ... value={draft()} onInput={(v: string) => setDraft(v)} />` das Textfeld. `value` ist, was es zeigt: der
  Entwurf. `onInput` läuft nach jeder getippten Taste, mit dem neuen Text, der in das Signal geht. So stimmen das Feld und das Signal
  immer überein, und `setDraft('')` in `add` leert das Feld. `placeholder` ist der graue Hinweis, der gezeigt wird, solange es leer ist.
- `<For each={items()}>{(item: Item) => <Row item={item} />}</For>` eine `Row` pro Eintrag. Wenn sich die Liste ändert, behält `For`
  die Zeilen der Einträge, die noch da sind, fügt Zeilen für neue Einträge hinzu und entfernt die anderen.
- `<View className="flex-row items-center justify-between">` die untere Zeile: die Anzahl links, *Clear bought* rechts
  (`justify-between` schiebt sie an die beiden Enden).

## Probier das aus

- Zeige eine Nachricht, wenn die Liste leer ist: `<Show when={items().length === 0}><Text>Nothing to buy.</Text></Show>` (importiere
  auch `Show`).
- Füge jedem Eintrag eine Menge hinzu: eine Zahl in `Item`, nach dem Text angezeigt, und ein *+*-Button in jeder Zeile.
- Setze die nicht gekauften Einträge nach vorn: Sortiere die Liste in `add` und `toggle`.
- Behalte die Liste, wenn die App geschlossen wird: `zinc:storage` speichert Text auf dem Gerät. Speichere nach jeder Änderung `JSON.stringify` der Texte
  und lies sie am Anfang wieder ein.
- Lass die Liste scrollen, wenn sie lang ist: Setze das `For` in eine `<ScrollView className="grow">`.
- Nutze die fertigen Komponenten des [UI-Kits](../ui-kit.md) (`Button`, `Card`, `List`, `Switch` ...) für ein fertiges
  Aussehen.

## Wie es weitergeht

Du kennst die beiden Wege, etwas auf den Bildschirm zu bringen, weißt, wie du auf Tastatur, Maus und Touch antwortest, wie du zeichnest und
Sound spielst und wie du eine Oberfläche baust, die ihrem Zustand folgt. Von hier aus:

- [Referenz zu zinc:gfx](../reference/gfx.md) und [Referenz zu den Ereignissen von zinc:ui](../reference/ui-events.md): alles, was diese
  Lektionen benutzt haben, und den Rest.
- [UI-Apps](../guide/03-ui-apps.md) und [zinc:ui im Detail](../ui.md): Scrollen, Textfelder, Animationen, Ebenen,
  Fenster.
- `zinc new desktop-app` macht eine größere App mit Seiten, einem Menü und Einstellungen; `zinc new game-2d` ein kleines fertiges Spiel.
  Lies ihren Code: Du kennst jetzt jeden Teil davon.
- [Zurück zum Anfang des Lernpfads](README.md).
