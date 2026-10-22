---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 9. Eventi

**Cosa vedrai:** un riquadro bianco con un punto rosa. Premi nel riquadro e il punto salta lì; trascina e lui ti segue; i
tasti freccia lo spostano; il bordo del riquadro diventa viola mentre il puntatore è sopra. Una frase dice cosa è successo, e un
pulsante *Reset* rimette il punto al centro.

![Un riquadro bianco con un bordo viola, un punto rosa, una frase e un pulsante Reset](img/09-events.png)

## Il codice

Il progetto è in [`samples/09-events`](samples/09-events/). `src/main.tsx`:

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

Premi nel riquadro vicino all'angolo in alto a sinistra, trascina, rilascia, premi la freccia sinistra: il terminale mostra
`Pressed at 30, 28 inside the box.`, `Let go at 230, 148.`, `Key ArrowLeft: the dot is at 220, 148.`

## Che cos'è un evento

Un **evento** è qualcosa che succede: una pressione, un movimento, un tasto. Dai a un elemento una funzione per un evento, in un
attributo il cui nome inizia con `on`; Zinc chiama la funzione quando l'evento accade su quell'elemento.

| Attributo | Quando viene eseguito | La funzione riceve |
|---|---|---|
| `onClick` | l'elemento è stato premuto e rilasciato (mouse, dito, oppure Invio e Spazio quando ha il focus della tastiera) | niente |
| `onPointerDown` | un pulsante o un dito si appoggia sull'elemento | un `PointerEvent` |
| `onPointerMove` | il puntatore si muove sopra l'elemento; dopo una pressione su di esso, ovunque fino al rilascio | un `PointerEvent` |
| `onPointerUp` | il pulsante o il dito si solleva, dopo una pressione sull'elemento | un `PointerEvent` |
| `onPointerEnter`, `onPointerLeave` | il puntatore arriva sopra l'elemento, o ne esce | un `PointerEvent` |
| `onKeyDown` | un tasto viene premuto mentre l'elemento (o uno al suo interno) ha il focus della tastiera | un `KeyEvent` |

Un `PointerEvent` dice dove: `e.x` e `e.y` sono misurati **dall'angolo in alto a sinistra dell'elemento**, non della finestra
(`e.gx`, `e.gy` partono dall'angolo della finestra). Dice anche quale pulsante (`e.button`: 0 sinistro, 1 centrale, 2 destro) e
quali tasti erano premuti (`e.shift`, `e.ctrl`, `e.alt`, `e.meta`). Ogni evento e ciò che fornisce è elencato nel
[riferimento degli eventi di zinc:ui](../reference/ui-events.md); ci sono anche tocchi, pressioni lunghe, trascinamenti e pizzichi.

## Riga per riga

- `import * as ui from 'zinc:ui';` prende l'intero modulo `zinc:ui` con il nome `ui`: i tipi `ui.PointerEvent` e
  `ui.KeyEvent` e la funzione `ui.onKey` vengono da lì.
- Cinque segnali: `dotX` e `dotY` (dove si trova il punto, dentro il riquadro), `pressed` (c'è un pulsante premuto?), `over` (il
  puntatore è sopra il riquadro?) e `news`, la frase sotto il riquadro. `createSignal<number>(150)` contiene un numero qualsiasi,
  `<boolean>` vero o falso, `<string>` testo.
- `function moveTo(x: number, y: number): void` mette il punto in (x, y), tenendolo dentro il riquadro di 300 per 200.
- `function down(e: ui.PointerEvent): void` viene eseguita a una pressione: ricorda che un pulsante è premuto, sposta il punto dove si trova il
  puntatore (`e.x`, `e.y`, dentro il riquadro), scrive la frase e la stampa.
- `function drag(e: ui.PointerEvent): void` viene eseguita a ogni movimento sopra il riquadro, e dopo una pressione sul riquadro a ogni movimento
  ovunque: il riquadro **cattura** il puntatore fino al rilascio, così un trascinamento che esce dal riquadro non si perde. Sposta il
  punto solo mentre `pressed()` è vero.
- `function up(e: ui.PointerEvent): void` viene eseguita al rilascio.
- `ui.onKey((e: ui.KeyEvent) => { ... });` un gestore dei tasti per l'intera finestra: riceve i tasti che nessun altro ha usato.
  `e.key` è il nome del tasto, come nella lezione 3 (`'ArrowLeft'`, `'a'`, `'Enter'`).
- `else return;` qualsiasi altro tasto: non fare nulla e lascia il tasto a Zinc.
- `e.preventDefault();` dice "questo tasto è usato". Senza, i tasti freccia sposterebbero anche il focus della tastiera da un
  pulsante all'altro, come in ogni app.
- `function reset(): void` rimette il punto a posto e lo dice.
- `className={`... ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}` il bordo del riquadro: viola mentre `over()` è
  vero, grigio chiaro altrimenti. La classe legge un segnale, quindi cambia insieme a lui.
- `onPointerDown={down} onPointerMove={drag} onPointerUp={up}` dà al riquadro le sue tre funzioni. Una funzione può essere
  data con il suo nome (`down`) o scritta sul momento (`(e: ui.PointerEvent) => setOver(true)`).
- `<View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />` il
  punto. `absolute` lo toglie dalla disposizione: `left` e `top` lo posizionano a partire dall'angolo in alto a sinistra del suo genitore, il riquadro.
  Meno 12 (metà della sua dimensione) lo centra sul punto.
- `<Button ... onClick={reset}>` il pulsante esegue `reset` quando viene cliccato.

## Prova tu

- Fai in modo che un doppio clic rimetta il punto al centro: `onDoubleClick={(e: ui.PointerEvent) => reset()}` sul riquadro.
- Fai in modo che un clic destro cambi il colore del punto: in `down`, controlla `e.button === 2`.
- Tieni premuto Shift per spostarti di 50 con i tasti freccia: `const step = e.shift ? 50 : 10;`.
- Disegna una scia: tieni le ultime posizioni in un segnale che contiene una lista e mostra un piccolo `View` per ogni posizione.
- Usa `onKeyDown` al posto di `ui.onKey`: metti `focusable onKeyDown={...}` sul riquadro. Ora i tasti funzionano solo dopo che
  hai cliccato il riquadro (che ha il focus), ed è quello che vuoi quando una finestra ha più riquadri di questo tipo.
- Sostituisci i tre gestori del puntatore con un solo `onDrag={(e: ui.PointerEvent) => moveTo(e.x, e.y)}`: un trascinamento comincia dopo che il
  puntatore si è mosso di 8 pixel, e `e.phase` dice se comincia (0), si muove (1) o finisce (2).

## Avanti

[10. Stili](10-styles.md): colori, dimensioni, bordi e ombre con `className`.
