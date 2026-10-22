---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 10. Stili

**Cosa vedrai:** tre schede, *Sunrise*, *Forest* e *Night*, ognuna con un campione di colore. Cliccane una: prende
un bordo viola e un'ombra, e l'intera pagina prende i suoi colori (con Night diventa scura).

![Tre schede su una pagina scura, la scheda Night selezionata](img/10-styles.png)

## Il codice

Il progetto è in [`samples/10-styles`](samples/10-styles/). `src/main.tsx`:

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

Clicca *Night*: la pagina diventa scura e il terminale mostra `theme: Night`.

## Come funziona `className`

`className` contiene una lista di parole brevi, separate da spazi, e ognuna imposta una cosa. Sono le parole di
[Tailwind CSS](https://tailwindcss.com), un sistema di stili per il web: se lo conosci, conosci già queste. Quando `className` è
testo semplice tra virgolette, Zinc lo legge prima che il programma venga eseguito e ti dice se una parola non esiste.

| Cosa impostare | Cosa scrivere | Esempi |
|---|---|---|
| larghezza, altezza | `w-*`, `h-*` | `w-24` (96 px), `w-full` (tutto il genitore), `h-[200px]` (esattamente 200) |
| spazio all'interno | `p-*`, `px-*`, `py-*`, `pt-*`... | `p-4` (16 px su ogni lato), `px-6` (24 px a sinistra e a destra) |
| spazio tra i figli | `gap-*` | `gap-4` |
| direzione | `flex-row`, `flex-col` | uno accanto all'altro, o uno sotto l'altro (il valore predefinito) |
| allineamento | `items-*`, `justify-*` | `items-center`, `justify-between` (il primo all'inizio, l'ultimo alla fine) |
| crescita | `grow` | prende lo spazio rimasto nel suo genitore |
| sfondo | `bg-*` | `bg-white`, `bg-amber-400`, `bg-[#5746e0]` |
| testo | `text-*`, `font-*` | `text-sm`, `text-2xl`, `text-slate-500`, `font-bold`, `text-center` |
| angoli | `rounded-*` | `rounded-lg`, `rounded-xl`, `rounded-full` |
| bordo | `border`, `border-2`, `border-*` | `border-2 border-indigo-600` (2 px, viola) |
| ombra | `shadow-*` | `shadow-sm`, `shadow-lg` |
| trasparenza | `opacity-*` | `opacity-50` |

I numeri contano a passi di 4 pixel (`p-4` è 16 px). I colori hanno un nome e una tonalità da 50 (molto chiara) a 950 (molto
scura): `slate`, `gray`, `red`, `orange`, `amber`, `yellow`, `green`, `emerald`, `teal`, `sky`, `blue`, `indigo`,
`violet`, `purple`, `pink`, `rose` e altri. Qualsiasi valore esatto va tra parentesi quadre: `w-[170px]`, `bg-[#f3f1ec]`.

Una parola con un prefisso vale solo in uno stato: `hover:bg-slate-50` mentre il puntatore è sopra l'elemento,
`active:bg-slate-100` mentre è premuto, `focus:border-blue-500` mentre ha il focus della tastiera.

## Riga per riga

- `const [theme, setTheme] = createSignal<string>('Sunrise');` il tema scelto, un segnale che contiene il suo nome.
- `function page(): string` dà le classi della pagina per il tema scelto: un ambra chiaro, un verde chiaro o un grigio ardesia
  scuro. `title()` fa lo stesso per il colore del titolo: testo chiaro sulla pagina scura.
- `interface CardProps { name: string; swatch: string; words: string }` descrive ciò di cui una scheda ha bisogno: un'**interfaccia**
  elenca i nomi e i tipi dei valori che un oggetto contiene.
- `function Card(props: CardProps): i32` un componente tutto tuo. Riceve i suoi valori in un solo oggetto, `props` (abbreviazione
  di "properties", proprietà): `props.name`, `props.swatch`, `props.words`.
- `const chosen = (): boolean => theme() === props.name;` una piccola funzione: questa scheda è quella scelta?
- `className={`w-[170px] p-4 gap-2 ... ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}`
  le classi della scheda. La prima parte non cambia mai: larga 170 pixel, margine interno, angoli arrotondati, sfondo bianco, un
  bordo di 2 pixel, uno sfondo più chiaro al passaggio del puntatore. La parte in `${ }` cambia con il segnale: la scheda scelta prende un
  bordo viola e un'ombra grande, le altre un bordo chiaro e un'ombra piccola. Poiché il testo legge `theme()`, le
  classi vengono ricalcolate ogni volta che il tema cambia.
- `<View className={`w-full h-16 rounded-lg ${props.swatch}`} />` il campione: a tutta larghezza, alto 64 pixel, con la
  classe di colore che la scheda ha ricevuto.
- `<Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />` usa il componente. Ogni attributo diventa un
  campo di `props`. I componenti che scrivi tu iniziano con la maiuscola, come quelli di Zinc.
- `<View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>` la pagina: il suo sfondo segue
  il tema.

## Prova tu

- Aggiungi un quarto tema, *Ocean*, con `bg-sky-500` come campione e `bg-sky-50` come pagina.
- Fai risaltare di più la scheda selezionata: `bg-indigo-50` quando è scelta.
- Cambia `hover:bg-slate-50` in `hover:bg-amber-100` e muovi il puntatore sopra le schede.
- Metti le schede una sotto l'altra: cambia `flex-row` in `flex-col`.
- Arrotonda completamente le schede con `rounded-3xl`, o rendile squadrate con `rounded-none`.
- Scrivi uno stile che `className` non può dire, come oggetto: `style={{ opacity: 0.8 }}` (la lezione 8 usava
  `style={{ width: ... }}`). [zinc:ui in profondità](../ui.md#object-styles-and-stylesheet) elenca le chiavi di stile.

## Avanti

[11. Un disegno dentro un'interfaccia](11-drawing-in-an-interface.md): mescola la parte 1 e la parte 2.
