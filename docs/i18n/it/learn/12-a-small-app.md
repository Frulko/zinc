---
source: 24c9dcf2422fedfc783f1401835b3320a8c61697
---
# 12. Una piccola app completa

**Cosa vedrai:** una lista della spesa. Scrivi qualcosa nel campo e premi Invio (o clicca *Add*): entra nella
lista. Clicca un elemento per segnarlo come comprato; clicca di nuovo per rimetterlo a posto. *Clear bought* toglie gli elementi
spuntati. La riga in fondo conta cosa resta da comprare.

![Una lista della spesa con Bread e Apples spuntati, Milk e Green tea da comprare](img/12-a-small-app.png)

## Il codice

Il progetto è in [`samples/12-a-small-app`](samples/12-a-small-app/). `src/main.tsx`:

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

Scrivi `Milk`, premi Invio, aggiungi `Green tea` con il pulsante, spunta *Bread*, poi *Clear bought*: il terminale mostra

```text
added "Milk", 2 left to buy
added "Green tea", 3 left to buy
Bread bought, 2 left to buy
cleared, 2 on the list
```

## Come è costruita l'app

Tutto ciò che l'app sa sta in due segnali: `items`, la lista, e `draft`, il testo che si sta scrivendo. Le funzioni `add`,
`toggle` e `clearDone` sono gli unici posti che li cambiano. L'interfaccia li legge e li segue. Quando scrivi
un'app, parti nello stesso modo: cosa deve ricordare (i segnali), cosa può fare l'utente (le funzioni) e cosa
mostra lo schermo (i componenti).

La lista non viene mai modificata sul posto. Per aggiungere un elemento, `add` crea una **nuova** lista con i vecchi elementi e quello nuovo, e
la dà a `setItems`. Per spuntare un elemento, `toggle` crea una nuova lista in cui quell'elemento è sostituito da uno nuovo. Un segnale
si accorge di un cambiamento quando gli viene dato un valore diverso; una lista modificata sul posto sarebbe ancora la stessa lista, e nulla
si aggiornerebbe.

## Riga per riga

- `import { createSignal, render, For } from 'zinc:ui/solid';` `For` mostra un elemento per ogni voce di una lista.
- `class Item { ... }` descrive una cosa da comprare: il suo `text` e se è `done` (fatta). Il `constructor` è la
  funzione che `new Item('Bread', false)` chiama per riempirne una nuova.
- `createSignal<Item[]>([new Item('Bread', false), new Item('Apples', true)])` la lista, che parte con due elementi,
  le mele già comprate.
- `createSignal<string>('')` il testo del campo, vuoto all'inizio.
- `function add(): void` legge la bozza, `trim()` toglie gli spazi a entrambe le estremità e un testo vuoto non aggiunge nulla.
  `[...items(), new Item(text, false)]` è una nuova lista: `...` ci distribuisce dentro i vecchi elementi, quello nuovo viene per ultimo. Poi
  `setDraft('')` svuota il campo.
- `function toggle(item: Item): void` `items().map(...)` crea una nuova lista della stessa lunghezza: l'elemento cliccato è
  sostituito da una copia con `done` invertito (`!it.done`), gli altri restano come sono.
- `function clearDone(): void` `filter` tiene gli elementi per cui la funzione dice `true`: quelli non fatti.
- `function left(): i32` conta gli elementi non fatti. Il testo in fondo la legge, quindi segue la lista.
- `interface RowProps { item: Item }` e `function Row(props: RowProps): i32` un componente per una riga, come nella lezione 10.
  La riga è un `Button` (così si può cliccare l'intera riga) disposto come una riga: un cerchio, poi il testo.
- `${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}` il cerchio è verde quando l'elemento è fatto, un anello
  vuoto altrimenti. Il testo è grigio e barrato (`line-through`) quando è fatto.
- `<View className="flex-row gap-2" onSubmit={add}>` il campo e il pulsante *Add* uno accanto all'altro. `onSubmit` viene eseguito quando
  si preme Invio in un campo a una riga dentro questo elemento: Invio aggiunge, come il pulsante.
- `<Input ... value={draft()} onInput={(v: string) => setDraft(v)} />` il campo di testo. `value` è ciò che mostra: la
  bozza. `onInput` viene eseguito dopo ogni tasto scritto, con il nuovo testo, che va nel segnale. Così il campo e il segnale
  sono sempre d'accordo, e `setDraft('')` in `add` svuota il campo. `placeholder` è il suggerimento grigio mostrato finché è vuoto.
- `<For each={items()}>{(item: Item) => <Row item={item} />}</For>` una `Row` per ogni elemento. Quando la lista cambia, `For`
  tiene le righe degli elementi ancora presenti, aggiunge righe per i nuovi elementi e toglie le altre.
- `<View className="flex-row items-center justify-between">` la riga in fondo: il conteggio a sinistra, *Clear bought* a
  destra (`justify-between` li spinge ai due estremi).

## Prova tu

- Mostra un messaggio quando la lista è vuota: `<Show when={items().length === 0}><Text>Nothing to buy.</Text></Show>` (importa
  anche `Show`).
- Aggiungi una quantità a ogni elemento: un numero in `Item`, mostrato dopo il testo, e un pulsante *+* in ogni riga.
- Metti per primi gli elementi non comprati: ordina la lista in `add` e `toggle`.
- Conserva la lista quando l'app si chiude: `zinc:storage` salva testo sul dispositivo. Salva il `JSON.stringify` dei testi dopo
  ogni cambiamento e rileggili all'avvio.
- Fai scorrere la lista quando è lunga: metti il `For` dentro un `<ScrollView className="grow">`.
- Usa i componenti già pronti del [kit UI](../ui-kit.md) (`Button`, `Card`, `List`, `Switch`...) per un aspetto
  rifinito.

## Dove andare ora

Conosci i due modi di mettere le cose sullo schermo, come rispondere a tastiera, mouse e tocco, come disegnare e riprodurre
suoni, e come costruire un'interfaccia che segue il suo stato. Da qui puoi continuare con:

- [riferimento di zinc:gfx](../reference/gfx.md) e [riferimento degli eventi di zinc:ui](../reference/ui-events.md): tutto ciò che queste
  lezioni hanno usato, e il resto.
- [App con interfaccia](../guide/03-ui-apps.md) e [zinc:ui in profondità](../ui.md): scorrimento, campi di testo, animazioni, livelli,
  finestre.
- `zinc new desktop-app` crea un'app più grande con pagine, un menu e impostazioni; `zinc new game-2d` un piccolo gioco completo.
  Leggi il loro codice: ora ne conosci ogni parte.
- [Torna all'inizio del percorso](README.md).
