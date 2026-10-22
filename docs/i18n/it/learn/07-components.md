---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 7. Componenti

**Cosa vedrai:** una scheda bianca al centro della finestra, con un razzo, un titolo, una frase e un pulsante viola *Join*.
Se clicchi il pulsante, viene stampata una riga.

![Una scheda con un razzo, il titolo "Rocket club", una frase e un pulsante Join](img/07-components.png)

## Un nuovo modo di mettere le cose sullo schermo

Nella parte 1 il tuo programma disegnava ogni fotogramma da solo: doveva dire dove va ogni cosa, in pixel. Per un'app (un modulo, una
lista, le impostazioni) è un lavoro enorme: il testo deve andare a capo, le cose devono allinearsi, la finestra può cambiare dimensione.

`zinc:ui` fa questo lavoro. Tu descrivi una volta sola cosa contiene lo schermo, come **elementi** dentro altri elementi, nello stesso modo
in cui si scrive una pagina web. Zinc li dispone, li disegna e li ridisegna quando qualcosa cambia. La descrizione usa
**JSX**: tag simili a HTML, dentro il codice.

## Il codice

Il progetto è in [`samples/07-components`](samples/07-components/). Il codice è in `src/main.tsx`: la `x` di `.tsx`
dice che il file contiene JSX. `zinc.json` lo indica come punto d'ingresso e ha una cartella `assets` per l'immagine:

```json
{
  "name": "components",
  "entry": "src/main.tsx",
  "assets": "assets",
  "app": { "id": "com.example.learn.components", "window": { "width": 640, "height": 400 } }
}
```

`src/main.tsx`:

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

Clicca *Join*: il terminale mostra `Welcome aboard!`

## Gli elementi

Gli elementi di Zinc iniziano con la lettera maiuscola, come in React Native:

| Elemento | Che cos'è |
|---|---|
| `View` | un riquadro. Contiene altri elementi e li dispone; può avere uno sfondo, un bordo, angoli arrotondati. |
| `Text` | parole. Il testo va sempre dentro un `Text`. |
| `Image` | un'immagine dalla cartella `assets`: `src="rocket.svg"`. |
| `Button` | qualcosa da premere: contiene un `Text` (o un'icona) ed esegue `onClick` quando viene premuto. |
| `ScrollView` | un riquadro il cui contenuto scorre quando è troppo lungo. |
| `Input`, `TextArea` | un campo dove scrivere una riga, o più righe (la lezione 12 usa `Input`). |
| `Canvas` | un riquadro in cui disegni con `zinc:gfx` (lezione 11). |

Due regole di scrittura, controllate da Zinc: gli elementi iniziano con la lettera maiuscola (`<View>`), e l'aspetto di un elemento
va in `className` (la parola più corta è una parola riservata di JavaScript, quindi Zinc la rifiuta).

## Come vengono disposti

Un `View` mette i suoi figli uno sotto l'altro, a partire dall'alto. `className` dice come:

- `w-full h-full`: largo e alto quanto il suo genitore (qui l'intera finestra).
- `items-center`: i figli sono centrati in orizzontale (da sinistra a destra, in una colonna).
- `justify-center`: i figli sono centrati in verticale (dall'alto in basso, in una colonna).
- `w-[340px]`: largo esattamente 340 pixel. Le parentesi quadre contengono un valore esatto.
- `p-6`: spazio dentro il riquadro, su tutti i lati. I numeri di `p-`, `gap-`, `w-`, `h-` contano a passi di 4 pixel: `p-6` è
  24 pixel, `gap-3` è 12.
- `gap-3`: 12 pixel tra i figli.

Gli stili sono spiegati meglio nella lezione 10.

## Riga per riga

- `import { render } from 'zinc:ui/solid';` `render` mette un'interfaccia sullo schermo. Gli elementi stessi
  (`View`, `Text`...) non hanno bisogno di import.
- `function App(): i32 { return <View ...>...</View>; }` un **componente**: una funzione che restituisce elementi. `App` è
  l'intera interfaccia. Il suo tipo è `i32` (un numero intero) perché Zinc dà a ogni elemento che crea un numero; tu
  non hai mai bisogno di guardare quel numero.
- `<View className="w-full h-full items-center justify-center">` il riquadro esterno riempie la finestra e centra ciò che
  contiene: la scheda.
- `<View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">` la scheda: larga 340 pixel, 24 pixel di
  margine interno, 12 pixel tra i figli, figli centrati, angoli molto arrotondati (`rounded-2xl`), sfondo bianco.
  La sua altezza non è indicata: è alta quanto il suo contenuto.
- `<Image src="rocket.svg" className="w-24 h-24" />` l'immagine, 96 per 96 pixel. `/>` chiude un elemento che non contiene
  nulla.
- `<Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>` un titolo: grande (`text-2xl`), in grassetto, quasi
  nero. `text-[#1d1b18]` è un colore esatto, scritto come sul web.
- `<Text className="text-base text-center text-[#625d55]">...` una frase di dimensione normale, centrata, grigia. È più lunga
  della larghezza della scheda, quindi va a capo da sola su due righe.
- `<Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>` un pulsante alto 44
  pixel, con 24 pixel di margine a sinistra e a destra (`px-6`), estremità tonde, viola. `onClick={...}` gli dà una
  funzione da eseguire quando viene premuto: le graffe `{ }` mettono del codice dentro JSX. La lezione 9 parla degli eventi.
- `render(App, 0xf3f1ec, null);` mostra `App` nella finestra. Il secondo argomento è il colore di sfondo della finestra (un
  numero, come nella parte 1). Il terzo è una funzione da eseguire a ogni fotogramma; `null` significa nessuna.

## Prova tu

- Cambia il titolo e la frase. Allunga la frase e guarda come va a capo.
- Metti l'immagine dopo il pulsante. L'ordine degli elementi è l'ordine sullo schermo.
- Aggiungi `flex-row` al `className` della scheda: i figli si mettono uno accanto all'altro.
- Rendi la scheda più larga (`w-[480px]`), oppure togli `w-[340px]` per vedere cosa fa la scheda senza una larghezza.
- Aggiungi un secondo pulsante accanto al primo: avvolgi i due in `<View className="flex-row gap-3">...</View>`.
- Crea un tuo componente: `function Title(): i32 { return <Text className="text-3xl">Hi</Text>; }`, poi scrivi
  `<Title />` dentro `App`.

## Avanti

[8. Stato](08-state.md): un'interfaccia che cambia quando cambia un valore.
