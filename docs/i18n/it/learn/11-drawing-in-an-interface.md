---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 11. Un disegno dentro un'interfaccia

**Cosa vedrai:** un pannello bianco a sinistra con un titolo, il numero di petali e due pulsanti; a destra, un
fiore che gira lentamente. *More* e *Fewer* aggiungono e tolgono petali.

![Un pannello con i pulsanti Fewer e More accanto a un fiore rosa con sette petali](img/11-drawing-in-an-interface.png)

## Il codice

Il progetto è in [`samples/11-drawing-in-an-interface`](samples/11-drawing-in-an-interface/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { rrect, stroke } from 'zinc:gfx';

const [petals, setPetals] = createSignal<i32>(6);
let time = 0;   // seconds since the start, moved forward every frame

function change(by: i32): void {
  const next = petals() + by;
  if (next < 3 || next > 12) return;
  setPetals(next);
  console.log(`petals: ${petals()}`);
}

function flower(x: i32, y: i32, w: i32, h: i32): void {
  const cx = x + w / 2, cy = y + h / 2;          // the middle of the canvas
  const reach = Math.min(w, h) * 0.22;           // how far the petals are from the middle
  stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);
  for (let i = 0; i < petals(); i++) {
    const angle = time * 0.5 + (i * 2 * Math.PI) / petals();
    const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;
    rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);
  }
  rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);
}

function App(): i32 {
  return <View className="w-full h-full flex-row">
    <View className="w-[200px] p-6 gap-4 bg-white">
      <Text className="text-2xl font-bold text-[#1d1b18]">Flower</Text>
      <Text className="text-base text-[#625d55]">{`${petals()} petals`}</Text>
      <Button className="px-2 h-10 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
        <Text className="text-base text-[#1d1b18]">Fewer</Text>
      </Button>
      <Button className="px-2 h-10 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
        <Text className="text-base text-white">More</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={flower} />
  </View>;
}

render(App, 0xdff3e4, (dt: number) => { time += dt; });
```

Clicca due volte *More* e una volta *Fewer*: il terminale mostra `petals: 7`, `petals: 8`, `petals: 7`.

## Un Canvas: la parte 1 dentro la parte 2

Alcune cose sono più facili da disegnare che da costruire con i riquadri: un grafico, una scacchiera di gioco, un disegno, una forma d'onda. Un `Canvas` è un
elemento dell'interfaccia che disegni tu, con le funzioni di `zinc:gfx` della parte 1. La disposizione gli dà il suo posto e la sua
dimensione come a qualsiasi elemento (qui `grow`: tutta la larghezza che il pannello lascia). Poi Zinc chiama la sua funzione `onDraw` con quel
posto: `x`, `y` (il suo angolo in alto a sinistra, nella finestra) e `w`, `h` (la sua larghezza e altezza). Tu disegni dentro quel riquadro.

Un Canvas viene ridisegnato a ogni fotogramma, quindi un disegno che si muove legge semplicemente il tempo. (Un'interfaccia senza Canvas viene
ridisegnata solo quando qualcosa al suo interno cambia, il che risparmia batteria; `style={{ lazy: 1 }}` fa aspettare un cambiamento anche
a un Canvas.)

## Riga per riga

- `import { rrect, stroke } from 'zinc:gfx';` le funzioni di disegno che usa questo programma, come nella parte 1. Non chiami
  `onFrame` né `clear`: `zinc:ui` gestisce i fotogrammi e dipinge lo sfondo.
- `const [petals, setPetals] = createSignal<i32>(6);` il numero di petali, un segnale: il testo `6 petals` lo segue.
- `let time = 0;` i secondi dall'inizio, una variabile normale: solo il disegno la legge, e il Canvas viene comunque ridisegnato a
  ogni fotogramma.
- `function change(by: i32): void` aggiunge o toglie un petalo, tra 3 e 12.
- `function flower(x: i32, y: i32, w: i32, h: i32): void` la funzione di disegno del Canvas. Zinc le dà il riquadro.
- `const cx = x + w / 2, cy = y + h / 2;` il centro del riquadro. Disegna sempre a partire da `x` e `y`: il Canvas non è in
  alto a sinistra nella finestra, comincia a 200 pixel dal bordo sinistro, dopo il pannello.
- `const reach = Math.min(w, h) * 0.22;` quanto i petali sono lontani dal centro: una parte del lato più piccolo del riquadro, così
  il fiore ci sta anche quando la finestra cambia dimensione.
- `stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);` il gambo: una linea verde spessa dal centro fino al
  fondo del riquadro.
- `for (let i = 0; i < petals(); i++)` un petalo per ogni giro del ciclo. `petals()` legge il segnale: il disegno usa il
  nuovo numero al fotogramma successivo.
- `const angle = time * 0.5 + (i * 2 * Math.PI) / petals();` dove si trova il petalo sul cerchio. Un giro completo è
  `2 * Math.PI` (circa 6,28); i petali se lo dividono in parti uguali, e `time * 0.5` li fa girare tutti lentamente.
- `const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;` il punto con quell'angolo su un cerchio di
  raggio `reach` intorno al centro. `cos` dà la parte in orizzontale, `sin` quella in verticale.
- `rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);` un petalo tondo di 80 pixel intorno a quel punto, un po'
  trasparente, così i petali sovrapposti si vedono.
- `rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);` il cuore giallo, disegnato per ultimo così sta sopra.
- `<View className="w-full h-full flex-row">` la finestra è una riga: il pannello, poi il Canvas.
- `<View className="w-[200px] p-6 gap-4 bg-white">` il pannello: largo 200 pixel, bianco, con i figli in colonna.
- `<Canvas className="grow" onDraw={flower} />` il Canvas prende il resto della riga e disegna con `flower`.
- `render(App, 0xdff3e4, (dt: number) => { time += dt; });` il terzo argomento di `render`, che prima era `null`, è una
  funzione che Zinc chiama a ogni fotogramma con `dt`, il tempo trascorso dall'ultimo fotogramma, come fa `onFrame` nella parte 1. Fa avanzare
  l'orologio del disegno.

## Prova tu

- Fai girare il fiore più veloce, o al contrario (con una velocità negativa).
- Dai a ogni petalo il suo colore, da una lista come nella lezione 6.
- Aggiungi un segnale per la dimensione dei petali, con altri due pulsanti.
- Fai respirare i petali: la loro dimensione per `1 + 0.1 * Math.sin(time * 3)`.
- Clicca sul Canvas per spostare il fiore: dagli `onPointerDown={(e: ui.PointerEvent) => ...}` (lezione 9) e tieni il
  centro in due variabili. `e.x`, `e.y` sono dentro il Canvas, quindi aggiungi `x`, `y` quando disegni.
- Disegna invece un grafico a barre: un `rect` per ogni valore di una lista, alto quanto il valore.

## Avanti

[12. Una piccola app completa](12-a-small-app.md): tutto insieme.
