---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# Quattro modi di scrivere un programma

Zinc ti permette di mettere le cose sullo schermo in quattro modi. Girano sullo stesso motore, nella stessa finestra, con gli stessi comandi
(`zinc new`, `zinc run`, `zinc dev`); cambia il modo in cui pensi lo schermo. Scegli quello che ti viene più naturale, o quello
che si adatta a ciò che crei. Puoi mescolarli e puoi cambiare più tardi: il linguaggio, il suono, i file e la rete sono uguali
in tutti e quattro.

| | Disegno | Scena | Canvas | Interfaccia |
| --- | --- | --- | --- | --- |
| Modulo | `zinc:gfx` | `zinc:stage` | `zinc:canvas` | `zinc:ui` |
| Come | Processing, p5.js, LÖVE | ActionScript 3 (Flash), Haxe e OpenFL | il `<canvas>` del web | React, Solid, React Native |
| Cosa scrivi | una funzione che disegna l'intera immagine, a ogni frame | oggetti che si disegnano da soli, in un albero | la stessa funzione di frame, con le chiamate canvas del web | gli elementi dello schermo, una volta sola, in JSX |
| Adatto a | giochi, animazioni, arte, un primo programma | app e giochi su tablet vecchi, oggetti che tocchi e trascini | codice canvas del web, disegni vettoriali, grafici | app, moduli, liste, impostazioni, strumenti |
| Come iniziare | `zinc new game` | `zinc new stage` | `zinc new canvas` | `zinc new desktop-app` |
| Lezioni | [da 1 a 6](../learn/README.md#the-lessons) | [da 13 a 16](../learn/13-a-stage-and-a-sprite.md) | [da 17 a 20](../learn/17-paths-and-fills.md) | [da 7 a 12](../learn/07-components.md) |

Dove scegliere: `zinc new` da solo ti chiede cosa vuoi fare e poi, per un gioco o un disegno (Disegno, Scena, Canvas) e per un'app
con finestre (Interfaccia, Scena), come vuoi scriverlo. In Zinc Atelier, **Nuovo sketch**, in cima alla vista iniziale, propone i
quattro stili, ognuno un piccolo programma da cui partire, e gli esempi sotto sono raggruppati per stile.

## Lo stesso programma, quattro volte

Una palla rimbalza nella finestra. Un clic (o un tocco) sulla palla cambia il suo colore e aggiunge un punto al punteggio in alto a sinistra.
Ecco il programma in ogni stile. I quattro programmi sembrano uguali:

![Una palla dorata su uno sfondo scuro, "Score: 2" in alto a sinistra](img/bounce.png)

Ogni versione è un piccolo progetto in [`docs/start/samples/`](samples/), da eseguire come una lezione: `zinc run docs/start/samples/drawing`
(o `scene`, `canvas`, `interface`). Ognuna stampa una riga quando colpisci la palla:

```text
hit: score 1, the ball is blue
hit: score 2, the ball is gold
```

### Disegno (`zinc:gfx`)

[`samples/drawing/src/main.ts`](samples/drawing/src/main.ts):

```ts
import { onFrame, clear, rrect, font, drawText, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const label = font('sans', 20);

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  // a press on the ball: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown) {
    const dx = pointerX() - x, dy = pointerY() - y;
    if (dx * dx + dy * dy <= R * R) {
      color = (color + 1) % COLORS.length;
      score++;
      console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
    }
  }
  wasDown = down;

  // draw the whole picture again
  clear(0x1c1b20);
  rrect(x - R, y - R, 2 * R, 2 * R, R, COLORS[color], 255);
  drawText(label, 16, 12, `Score: ${score}`, 0xffffff, 255, 0);
});
```

- Tutto vive in variabili: dove si trova la palla, la sua velocità, il suo colore, il punteggio.
- Una funzione parte circa 60 volte al secondo. Muove la palla, guarda il mouse, poi dipinge di nuovo tutta la finestra, a partire dallo
  sfondo.
- Nessuno avvisa il programma di un clic: lui chiede `pointerDown()` a ogni frame e confronta con il frame precedente
  (`wasDown`) per vedere il momento in cui il pulsante si è abbassato. Poi misura la distanza dal centro della palla.

### Scena (`zinc:stage`)

[`samples/scene/src/main.ts`](samples/scene/src/main.ts):

```ts
import { onFrame, rrect, font, drawText, width, height } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const label = font('sans', 20);

class Score extends Sprite {
  points: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(label, 0, 0, `Score: ${this.points}`, 0xffffff, 255, 0);
  }
}

class Ball extends Sprite {
  vx: number = 150;           // its speed, in pixels per second
  vy: number = 110;
  color: i32 = 0;             // which colour of COLORS it has
  override onUpdate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > width() - this.width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height() - this.height) this.vy = -this.vy;
    uiState.dirty = true;     // it moved: draw the next frame
  }
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, COLORS[this.color], 255);           // (0, 0) is the ball's own corner
    registerTapZone('ball', 0, 0, w, h, () => this.hit());
  }
  hit(): void {
    this.color = (this.color + 1) % COLORS.length;
    score.points++;
    console.log(`hit: score ${score.points}, the ball is ${NAMES[this.color]}`);
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
const score = new Score('score');
score.x = 16;
score.y = 12;
const ball = new Ball('ball');
ball.x = 70;                  // the corner: the centre is at 100, 80
ball.y = 50;
ball.width = 60;
ball.height = 60;
stage.addChild(ball);
stage.addChild(score);
onFrame((dt: number) => stage.frame(dt));
```

- La palla e il punteggio sono oggetti, ognuno una classe con i suoi campi. Il palco (stage) li contiene, come un palcoscenico contiene gli attori.
- Ogni oggetto si disegna nelle sue coordinate: `(0, 0)` è l'angolo in alto a sinistra della palla, ovunque sia la palla. Zinc sposta il
  disegno al posto giusto.
- La palla dice dove si può toccare (`registerTapZone`) mentre si disegna, e indica la funzione da chiamare. Il palco trova la zona
  sotto il dito e chiama `hit()`.
- `uiState.dirty = true` chiede una nuova immagine. Una scena in cui nulla si muove non disegna niente, ed è per questo che piace ai tablet vecchi.

### Canvas (`zinc:canvas`)

[`samples/canvas/src/main.ts`](samples/canvas/src/main.ts):

```ts
import { onFrame, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const COLORS = ['#f27aa6', '#5ec2f2', '#e8b06a', '#7bd389'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const ctx = new CanvasRenderingContext2D();

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  ctx.begin(0, 0, width(), height());          // the canvas is the whole window
  ctx.fillStyle = '#1c1b20';
  ctx.fillRect(0, 0, width(), height());

  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  // a press inside the ball's path: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown && ctx.isPointInPath(pointerX(), pointerY())) {
    color = (color + 1) % COLORS.length;
    score++;
    console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
  }
  wasDown = down;
  ctx.fillStyle = COLORS[color];
  ctx.fill();

  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';
  ctx.fillText(`Score: ${score}`, 16, 12);
  ctx.end();
});
```

- La stessa funzione di frame dello stile a disegno; le chiamate di disegno sono quelle del web: `fillStyle`, `beginPath`, `arc`, `fill`, `fillText`.
  Il codice di una pagina web o di un tutorial di MDN si legge allo stesso modo.
- `ctx.begin(0, 0, width(), height())` fa di tutta la finestra il canvas; non c'è una pagina, né un elemento `<canvas>`, né JSX.
- I colori sono stringhe CSS (`'#f27aa6'`, `'white'`, `'rgba(0, 0, 0, 0.5)'`).
- Il clic si legge da `zinc:gfx`, come nello stile a disegno. Il canvas risponde alla domanda "questo punto è dentro la forma che ho appena
  costruito?" con `isPointInPath`.

### Interfaccia (`zinc:ui`)

[`samples/interface/src/main.tsx`](samples/interface/src/main.tsx):

```tsx
import { createSignal, render } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';

const COLORS = ['bg-[#f27aa6]', 'bg-[#5ec2f2]', 'bg-[#e8b06a]', 'bg-[#7bd389]'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
const [x, setX] = createSignal<number>(100);   // the centre of the ball
const [y, setY] = createSignal<number>(80);
const [color, setColor] = createSignal<i32>(0);
const [score, setScore] = createSignal<i32>(0);
let vx = 150, vy = 110;       // its speed, in pixels per second

function move(dt: number): void {
  setX(x() + vx * dt);
  setY(y() + vy * dt);
  if (x() < R || x() > width() - R) vx = -vx;
  if (y() < R || y() > height() - R) vy = -vy;
}

function hit(): void {
  setColor((color() + 1) % COLORS.length);
  setScore(score() + 1);
  console.log(`hit: score ${score()}, the ball is ${NAMES[color()]}`);
}

function App(): i32 {
  return <View className="w-full h-full">
    <View className={`absolute w-[60px] h-[60px] rounded-full ${COLORS[color()]}`}
      style={{ left: x() - R, top: y() - R }} onClick={hit} />
    <Text className="absolute text-xl text-white" style={{ left: 16, top: 12 }}>{`Score: ${score()}`}</Text>
  </View>;
}

render(App, 0x1c1b20, move);
```

- Lo schermo è descritto una volta sola: una scatola che riempie la finestra, con dentro una scatola rotonda (la palla) e un testo (il punteggio). L'aspetto viene
  da `className`, come con Tailwind sul web.
- I valori che lo schermo mostra sono signal: `setX`, `setColor`, `setScore` li cambiano, e la palla e il testo seguono da
  soli. Non si disegna niente a mano.
- `onClick={hit}` sulla palla: Zinc chiama `hit` quando la palla viene premuta e rilasciata. Il terzo argomento di `render` viene chiamato a
  ogni frame, qui per muovere la palla.
- Un'interfaccia dà il meglio con campi di testo, liste, pulsanti e pagine; una palla che si muove è il caso più difficile per lei, e richiede comunque poche righe.

### Cosa cambia dall'uno all'altro

| | Disegno | Scena | Canvas | Interfaccia |
| --- | --- | --- | --- | --- |
| Dove si trova la palla | due variabili | `x` e `y` dello sprite | due variabili | due signal |
| Come si trova il clic | la distanza dal centro | una zona di tocco registrata dalla palla | `isPointInPath` | `onClick` sulla scatola della palla |
| Cosa si disegna a ogni frame | tutto | solo quando qualcosa è cambiato | tutto | solo quando un signal è cambiato |
| Righe | 36 | 49 | 43 | 34 |

## Ogni stile nel dettaglio

### Disegno, come Processing

**Adatto a** un primo programma, giochi, animazioni, arte generativa, visualizzazioni; per chi conosce Processing, p5.js, LÖVE o Pico-8.

**Come ragioni:** un flip book. A ogni frame parti da una pagina vuota e disegni tutto dove si trova adesso: lo sfondo,
poi le forme, poi il testo sopra. Quello che cambia vive nelle tue variabili; spostare qualcosa vuol dire cambiare un numero.

**Come gli eventi arrivano al tuo codice:** tu chiedi. `pointerX()`, `pointerY()` e `pointerDown()` dicono dove si trovano il mouse o il primo dito,
`isDown(Btn.Left)` se un tasto o un pulsante del gamepad è premuto, `keyCount()` e `keyName(i)` quali tasti sono arrivati dall'ultimo frame.
Per vedere un clic, confronta con il frame precedente. Nessuno ti chiama, tranne il frame.

**Sui dispositivi vecchi:** ogni frame costa quanto ciò che disegna, a ogni frame, anche quando nulla si muove. Forme, immagini e un po' di testo si ridisegnano
in fretta ovunque, ed è così che funzionano i giochi; chiama `keep()` in un frame in cui nulla è cambiato per mostrare di nuovo l'ultima immagine gratis.

### Scena, come ActionScript 3 e Haxe

**Adatto a** app e giochi fatti di tanti oggetti: carte che trascini, pulsanti che tocchi, liste che scorrono, pagine che scivolano dentro; per chi ha fatto
giochi o app in Flash, o conosce Haxe/OpenFL, Starling o Pixi. È lo stile che le demo di Zinc usano sui tablet vecchi (l'HP TouchPad, il
Nexus 7, un Raspberry Pi 3: [`examples/music-tree`](../../examples/music-tree/src/main.ts)).

**Come ragioni:** un teatro di marionette. Ogni oggetto è una classe che conosce il suo posto nel genitore (`x`, `y`), la sua dimensione, i suoi figli,
come disegnarsi (`onDraw`) e cosa fare a ogni frame (`onUpdate`). Un figlio si muove con il suo genitore. Una riga o una colonna possono disporre
i figli al posto tuo.

**Come gli eventi arrivano al tuo codice:** un oggetto dice, mentre si disegna, quale rettangolo accetta un tocco (`registerTapZone`) o un trascinamento
(`registerDragZone`), con la funzione da chiamare. `stage.frame(dt)` trova la zona più in alto sotto il dito e la chiama. I tasti si
leggono da `zinc:gfx`, come nello stile a disegno.

**Sui dispositivi vecchi:** il più leggero dei quattro. Non si disegna nulla finché nulla è cambiato (`uiState.dirty`), non c'è un foglio di stile da
applicare né un albero di elementi da confrontare, quindi uno schermo fermo non costa quasi niente e uno in movimento costa quanto ciò che disegna.

### Canvas, alla maniera del web

**Adatto a** chi conosce il canvas del web, codice portato da una pagina web o da un tutorial JavaScript, disegni vettoriali con curve,
tratti e sfumature, grafici.

**Come ragioni:** una penna con delle impostazioni. Scegli un colore (`fillStyle`), uno spessore di linea (`lineWidth`), poi costruisci un tracciato
(`moveTo`, `lineTo`, `arc`, `bezierCurveTo`) e lo riempi con `fill` o lo disegni con `stroke`. `translate`, `rotate` e `scale` muovono il foglio sotto la penna;
`save` e `restore` lo rimettono a posto. Le impostazioni restano finché non le cambi, anche nel frame successivo, come sul web.

**Come gli eventi arrivano al tuo codice:** come nello stile a disegno, da `zinc:gfx`; non c'è `addEventListener`. `isPointInPath(x, y)` dice
se un punto è dentro il tracciato che hai appena costruito, il che rende facile controllare i colpi su qualsiasi forma.

**Sui dispositivi vecchi:** ogni curva diventa tanti piccoli segmenti, e ogni forma viene riempita con bordi morbidi (16 campioni per pixel) e
sfumature calcolate pixel per pixel. Una finestra piena di curve e sfumature a ogni frame è il lavoro più pesante dei quattro per un tablet del 2011.
Tieni piccola la parte che si muove, e disegna ciò che non si muove una volta sola in un `Canvas` fuori schermo che mostri con `drawImage`
([zinc:canvas](../plugins/canvas2d.md#drawing-targets)).

### Interfaccia, come React e Solid

**Adatto a** le app: moduli, liste, impostazioni, strumenti, dashboard, tutto ciò che ha campi di testo e pulsanti; per chi conosce React, Solid,
React Native, o HTML e CSS con Tailwind.

**Come ragioni:** una descrizione. Dici una volta sola cosa contiene lo schermo, come scatole dentro scatole (`<View>`, `<Text>`, `<Button>`,
`<Image>`), e che aspetto hanno (`className="p-4 rounded-xl bg-white"`). I valori che cambiano sono signal; cambiane uno e ogni testo e
stile che lo legge lo segue. Il layout dispone tutto: raramente dai una x o una y.

**Come gli eventi arrivano al tuo codice:** attributi sugli elementi: `onClick`, `onPointerDown`, `onKeyDown`, `onInput`... Zinc chiama la tua
funzione con quello che è successo ([gli eventi](../reference/ui-events.md)). Campi di testo, focus, tastiera, scorrimento e lettori di
schermo sono già inclusi.

**Sui dispositivi vecchi:** il maggior lavoro per elemento: un layout flexbox, stili, composizione del testo, un albero di elementi tenuto in memoria. È la
scelta per un desktop, un Raspberry Pi 4 o un telefono degli ultimi cinque anni; su un tablet più vecchio, scrivi lo stesso schermo come una scena
([`examples/GUIDELINES.md`](../../examples/GUIDELINES.md)).

## Come si mescolano

- **Un disegno dentro un'interfaccia.** `<Canvas className="grow" onDraw={fn} />` è una scatola dell'interfaccia che disegni tu:
  `fn(x, y, w, h)` riceve il suo posto e la sua dimensione e disegna con `zinc:gfx`. La [lezione 11](../learn/11-drawing-in-an-interface.md) mette un
  fiore accanto a dei pulsanti in questo modo.
- **Un Canvas dentro un'interfaccia.** Lo stesso `<Canvas onDraw>`, con un contesto canvas: `ctx.begin(x, y, w, h)` all'inizio di `fn`,
  `ctx.end()` alla fine ([zinc:canvas](../plugins/canvas2d.md)).
- **Un Canvas dentro un disegno.** In una sola funzione di frame, le chiamate di `zinc:gfx` e un contesto canvas possono alternarsi: `ctx.begin(x, y, w, h)`
  dà al contesto la sua scatola, e quello che disegni dopo `ctx.end()` va sopra.
- **Disegno e Canvas dentro una scena.** Lo `onDraw` di uno sprite disegna con `zinc:gfx` nelle sue coordinate; anche un contesto canvas funziona lì:
  `ctx.begin(0, 0, w, h)` disegna nelle coordinate dello sprite e si muove con lui.
- **Una scena dentro un'interfaccia.** `<Canvas onDraw={(x, y, w, h) => stage.drawIn(x, y, w, h)} />` disegna un palco in un riquadro
  dell'interfaccia, e `stage.update(dt)` nel terzo argomento di `render` lo muove e gli dà i suoi tocchi. Un tocco su uno sprite va
  allo sprite, un clic su un pulsante va al pulsante.
- **Un'interfaccia dentro una scena.** Un Canvas che riempie la finestra disegna la scena, e gli elementi dell'interfaccia sono posti sopra uno
  sprite (`absolute`, alla `x` e alla `y` dello sprite); lo sprite registra sotto di loro una zona di tocco, così la scena dietro non prende
  i loro clic.

Tutti e due sono spiegati, con il codice, in [Oltre i componenti](beyond.md), che mostra anche grafici che disegni tu, stili come
oggetti, componenti tuoi, animazioni e transizioni.

Non sei sicuro? Comincia con lo stile a disegno e [le lezioni](../learn/README.md): ogni altro stile usa quello che insegnano. Per scegliere che
tipo di programma fare (un gioco, un'app, un server, una scheda), vedi [Scegli il tuo tipo di programma](choose.md).
