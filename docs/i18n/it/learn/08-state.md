---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 8. Stato

**Cosa vedrai:** un contatore di bicchieri d'acqua, una barra blu che cresce insieme al contatore, una frase che cambia e due
pulsanti, *One less* e *I drank one*.

![2 / 8 con grandi cifre, una barra blu piena per un quarto, "6 more to go." e due pulsanti](img/08-state.png)

## Il codice

Il progetto è in [`samples/08-state`](samples/08-state/). `src/main.tsx`:

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

Clicca *I drank one* tre volte, poi *One less*: il terminale mostra `glasses: 1`, `glasses: 2`, `glasses: 3`,
`glasses: 2`, e lo schermo segue ogni clic.

## Segnali: valori che lo schermo segue

La funzione `App` viene eseguita **una sola volta**, quando l'interfaccia viene costruita. Se `glasses` fosse una variabile normale (`let glasses = 0`),
cambiarla più tardi non cambierebbe nulla sullo schermo: il testo è già stato creato.

Un **segnale** è un valore che l'interfaccia segue. `createSignal` ti dà due funzioni:

- `glasses()` legge il valore. Ogni parte dell'interfaccia che lo legge (un testo, uno stile, una classe) si ricorda di averlo fatto.
- `setGlasses(3)` cambia il valore. Ogni parte che lo ha letto viene aggiornata, e solo quelle.

Questa è l'idea intera dello stato in `zinc:ui`: tieni ciò che può cambiare nei segnali, leggili dove vengono mostrati e
cambiali nei tuoi gestori di eventi. Lo schermo li segue da solo.

## Riga per riga

- `import { createSignal, render } from 'zinc:ui/solid';` `zinc:ui/solid` funziona come [Solid](https://www.solidjs.com),
  una libreria web: segnali e componenti che vengono eseguiti una volta sola. (`zinc:ui/react` funziona invece come React; queste lezioni usano
  Solid.)
- `const GOAL = 8;` il numero di bicchieri da bere, una costante normale: non cambia mai.
- `const [glasses, setGlasses] = createSignal<i32>(0);` un segnale che contiene un numero intero (`<i32>`), che parte da 0.
  `createSignal` restituisce due cose; le parentesi quadre le nominano, in ordine: chi legge e chi scrive.
- `function drink(by: i32): void { ... }` aggiunge `by` (1 o -1) al conteggio. `if (next < 0 || next > GOAL) return;`
  si ferma lì quando il conteggio scenderebbe sotto 0 o salirebbe sopra 8 (`||` significa "o"). Poi `setGlasses(next)` cambia il valore
  e lo schermo segue.
- `function message(): string { ... }` sceglie una frase in base al conteggio. È una funzione normale, ma legge
  `glasses()`, quindi anche un testo che mostra `message()` segue il segnale.
- `<Text ...>{`${glasses()} / ${GOAL}`}</Text>` il numero grande. Il codice dentro un testo va tra `{ }`; qui una stringa
  template con il conteggio e l'obiettivo.
- `<View className="w-[320px] h-4 rounded-full bg-[#e9e6df]">` la barra vuota: larga 320 pixel, di un grigio chiaro.
- `<View className="h-4 rounded-full bg-[#2563c9]" style={{ width: glasses() * 40 }} />` la parte blu al suo interno.
  `style={{ ... }}` imposta uno stile a partire da un valore: la sua larghezza è di 40 pixel per bicchiere, quindi 8 bicchieri riempiono i 320. Legge
  `glasses()`, quindi cresce quando il segnale cambia. (Le doppie graffe sono un oggetto JavaScript `{ width: ... }` dentro
  le `{ }` di JSX.)
- `<Text ...>{message()}</Text>` la frase, aggiornata con il conteggio.
- `onClick={() => drink(-1)}` e `onClick={() => drink(1)}`: ogni pulsante chiama `drink` con il proprio passo.

## Prova tu

- Cambia l'obiettivo in 6. Ora la barra è troppo corta quando è piena: rendi la sua larghezza `glasses() * (320 / GOAL)`.
- Aggiungi un pulsante *Reset* che chiama `setGlasses(0)`.
- Fai diventare verde il numero quando l'obiettivo è raggiunto: anche `className={...}` può leggere i segnali, come mostra la lezione 10. Prova
  `className={glasses() === GOAL ? 'text-6xl font-bold text-emerald-600' : 'text-6xl font-bold text-[#1d1b18]'}`.
- Aggiungi un secondo segnale, `cups` di tè, con i suoi pulsanti e la sua riga.
- Stampa il conteggio con `console.log` dentro `message()` e guarda quando viene eseguita: una volta all'inizio, poi solo quando il
  conteggio cambia, mai nei fotogrammi intermedi.

## Avanti

[9. Eventi](09-events.md): i clic sono un tipo di evento; ci sono anche pressioni, movimenti, passaggi del puntatore e tasti.
