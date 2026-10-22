---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 12. Una pequeña aplicación completa

**Lo que verás:** una lista de la compra. Escribe algo en el campo y pulsa Enter (o haz clic en *Add*): se une a la
lista. Haz clic en un elemento para marcarlo como comprado; haz clic otra vez para devolverlo. *Clear bought* quita los
elementos marcados. La línea de abajo cuenta lo que queda por comprar.

![Una lista de la compra con Bread y Apples marcados, y Milk y Green tea por comprar](img/12-a-small-app.png)

## El código

El proyecto está en [`samples/12-a-small-app`](samples/12-a-small-app/). `src/main.tsx`:

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

Escribe `Milk`, pulsa Enter, añade `Green tea` con el botón, marca *Bread* y luego pulsa *Clear bought*: la terminal
muestra

```text
added "Milk", 2 left to buy
added "Green tea", 3 left to buy
Bread bought, 2 left to buy
cleared, 2 on the list
```

## Cómo está construida la aplicación

Todo lo que la aplicación sabe está en dos señales: `items`, la lista, y `draft`, el texto que se está escribiendo.
Las funciones `add`, `toggle` y `clearDone` son los únicos sitios que las cambian. La interfaz las lee y las sigue.
Cuando escribas una aplicación, empieza igual: qué necesita recordar (las señales), qué puede hacer la persona (las
funciones) y qué muestra la pantalla (los componentes).

La lista nunca se cambia en su sitio. Para añadir un elemento, `add` crea una lista **nueva** con los elementos
antiguos y el nuevo, y se la da a `setItems`. Para marcar un elemento, `toggle` crea una lista nueva en la que ese
elemento se sustituye por otro nuevo. Una señal nota un cambio cuando se le da un valor distinto; una lista cambiada en
su sitio seguiría siendo la misma lista, y nada se actualizaría.

## Línea por línea

- `import { createSignal, render, For } from 'zinc:ui/solid';` `For` muestra un elemento por cada ítem de una lista.
- `class Item { ... }` describe una cosa que comprar: su `text` y si está hecha (`done`). El `constructor` es la función
  a la que llama `new Item('Bread', false)` para rellenar uno nuevo.
- `createSignal<Item[]>([new Item('Bread', false), new Item('Apples', true)])` la lista, que empieza con dos elementos,
  las manzanas ya compradas.
- `createSignal<string>('')` el texto del campo, vacío al principio.
- `function add(): void` lee el borrador, `trim()` quita los espacios de ambos extremos, y un texto vacío no añade nada.
  `[...items(), new Item(text, false)]` es una lista nueva: `...` extiende en ella los elementos antiguos, y el nuevo va
  el último. Luego `setDraft('')` vacía el campo.
- `function toggle(item: Item): void` `items().map(...)` crea una lista nueva de la misma longitud: el elemento pulsado
  se sustituye por una copia con `done` invertido (`!it.done`), los demás se dejan como están.
- `function clearDone(): void` `filter` conserva los elementos para los que la función dice `true`: los que no están
  hechos.
- `function left(): i32` cuenta los elementos no hechos. El texto de abajo la lee, así que sigue a la lista.
- `interface RowProps { item: Item }` y `function Row(props: RowProps): i32` un componente para una fila, como en la
  lección 10. La fila es un `Button` (para que se pueda pulsar toda la fila) dispuesto como una fila: un círculo y luego
  el texto.
- `${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}` el círculo es verde cuando está hecho, y un
  anillo vacío en caso contrario. El texto es gris y tachado (`line-through`) cuando está hecho.
- `<View className="flex-row gap-2" onSubmit={add}>` el campo y el botón *Add* uno al lado del otro. `onSubmit` se
  ejecuta cuando se pulsa Enter en un campo de una sola línea dentro de este elemento: Enter añade, como el botón.
- `<Input ... value={draft()} onInput={(v: string) => setDraft(v)} />` el campo de texto. `value` es lo que muestra: el
  borrador. `onInput` se ejecuta tras cada tecla escrita, con el texto nuevo, que va a la señal. Así el campo y la señal
  siempre coinciden, y `setDraft('')` en `add` vacía el campo. `placeholder` es la pista gris que se muestra mientras
  está vacío.
- `<For each={items()}>{(item: Item) => <Row item={item} />}</For>` una `Row` por elemento. Cuando cambia la lista,
  `For` conserva las filas de los elementos que siguen ahí, añade filas para los nuevos y quita las demás.
- `<View className="flex-row items-center justify-between">` la línea de abajo: la cuenta a la izquierda, *Clear bought*
  a la derecha (`justify-between` los empuja a los dos extremos).

## Prueba esto

- Muestra un mensaje cuando la lista esté vacía: `<Show when={items().length === 0}><Text>Nothing to buy.</Text></Show>`
  (importa también `Show`).
- Añade una cantidad a cada elemento: un número en `Item`, mostrado después del texto, y un botón *+* en cada fila.
- Pon primero los elementos no comprados: ordena la lista en `add` y `toggle`.
- Conserva la lista al cerrar la aplicación: `zinc:storage` guarda texto en el dispositivo. Guarda el `JSON.stringify`
  de los textos tras cada cambio y léelos de nuevo al empezar.
- Haz que la lista se desplace cuando sea larga: pon el `For` dentro de un `<ScrollView className="grow">`.
- Usa los componentes ya hechos de [el kit de interfaz](../ui-kit.md) (`Button`, `Card`, `List`, `Switch`...) para un
  aspecto acabado.

## Adónde ir ahora

Ya conoces las dos formas de poner cosas en pantalla, cómo responder al teclado, al ratón y al tacto, cómo dibujar y
reproducir sonido, y cómo construir una interfaz que sigue su estado. A partir de aquí:

- [Referencia de zinc:gfx](../reference/gfx.md) y [referencia de eventos de zinc:ui](../reference/ui-events.md): todo
  lo que usaron estas lecciones, y el resto.
- [Aplicaciones de interfaz](../guide/03-ui-apps.md) y [zinc:ui a fondo](../ui.md): desplazamiento, campos de texto,
  animaciones, capas, ventanas.
- `zinc new desktop-app` crea una aplicación más grande con páginas, un menú y ajustes; `zinc new game-2d` un pequeño
  juego completo. Lee su código: ya conoces cada una de sus partes.
- [Volver al inicio del recorrido](README.md).
