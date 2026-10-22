---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# 16. Il layout e una scroll box

**Cosa vedrai:** una pagina con una barra del titolo, *Fruits* a sinistra e *Tap a fruit* a destra, e sotto una lista bianca di
venti frutti che non entra nella finestra. Falla scorrere con la rotellina del mouse, con due dita su un trackpad, o
trascinandola con un dito; continua ancora un po' quando la lasci. Tocca un frutto: la sua riga diventa grigia e la barra del
titolo dice *You chose: Lime*.

![Una barra del titolo "Fruits" e "You chose: Lime" sopra una lista scorsa, la riga Lime grigia](img/16-layout-and-scrolling.png)

## Il codice

Il progetto è in [`samples/16-layout-and-scrolling`](samples/16-layout-and-scrolling/). `src/main.ts`:

```ts
import { onFrame, rrect, rect, font, drawText, lineHeight } from 'zinc:gfx';
import {
  Stage, Sprite, ScrollBox, registerTapZone, beginScrollBox, endScrollBox, isLocalRectVisible, isZonePressed,
} from 'zinc:stage';

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry', 'Coconut', 'Fig', 'Grape', 'Kiwi', 'Lemon',
  'Lime', 'Mango', 'Melon', 'Orange', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Raspberry', 'Strawberry'];
const ROW = 44;                                   // the height of one row, in pixels
const bold = font('sans-bold', 22);
const plain = font('sans', 17);
let chosen = '';

// A line of text, centred in its height.
class Label extends Sprite {
  text: string = '';
  fontId: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(this.fontId, 0, (h - lineHeight(this.fontId)) / 2, this.text, 0x1d1b18, 255, 0);
  }
}

// The list of fruits: it draws only the rows you can see, and scrolls with a finger or the wheel.
class FruitList extends Sprite {
  box: ScrollBox = new ScrollBox();

  override onMeasure(): void {
    this.box.contentHeight = FRUITS.length * ROW;
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 12, 0xffffff, 255);
    beginScrollBox(this.box, 0, 0, w, h);         // what is drawn until endScrollBox stays inside the box
    for (let i = 0; i < FRUITS.length; i++) {
      const y = i * ROW - this.box.scrollY;       // scrolled: the rows move up
      if (!isLocalRectVisible(0, y, w, ROW)) continue;
      const id = `row ${i}`;
      if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);
      drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], 0x1d1b18, 255, 0);
      rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);
      registerTapZone(id, 0, y, w, ROW, () => {
        chosen = FRUITS[i];
        status.text = `You chose: ${chosen}`;
        console.log(`tapped ${chosen}, the list is scrolled by ${Math.round(this.box.scrollY)}`);
      });
    }
    endScrollBox();
  }
}

const stage = new Stage();
stage.color = 0xf3f1ec;
stage.direction = 'column';                       // children from top to bottom
stage.alignItems = 'stretch';                     // each one as wide as the stage
stage.setPaddingSymmetric(24, 20);
stage.gap = 12;

const header = new Sprite('header');
header.direction = 'row';                         // children from left to right
header.height = 40;
const title = new Label('title');
title.text = 'Fruits';
title.fontId = bold;
title.flex = 1;                                   // takes the room the status leaves
title.height = 40;
const status = new Label('status');
status.text = 'Tap a fruit';
status.fontId = plain;
status.width = 220;
status.height = 40;
header.addChild(title);
header.addChild(status);

const list = new FruitList('list');
list.flex = 1;                                    // the rest of the height

stage.addChild(header);
stage.addChild(list);
console.log(`${FRUITS.length} fruits, ${FRUITS.length * ROW} pixels of list`);
onFrame((dt: number) => stage.frame(dt));
```

Tocca *Cherry*, scorri in basso di tre scatti della rotellina, trascina la lista in su di 100 pixel, poi tocca la riga sotto il
puntatore:

```text
20 fruits, 880 pixels of list
tapped Cherry, the list is scrolled by 0
tapped Lime, the list is scrolled by 244
```

## Righe e colonne

Finora ogni oggetto aveva una `x` e una `y` che impostavi tu. Una pagina con una barra del titolo e una lista richiederebbe molti
numeri, tutti da cambiare quando la finestra cambia dimensione. Invece un genitore può **disporre i suoi figli**:

| Campo | Cosa fa |
|---|---|
| `direction = 'column'` | i figli uno sotto l'altro, dall'alto |
| `direction = 'row'` | i figli uno accanto all'altro, da sinistra |
| `gap` | pixel tra due figli |
| `setPaddingSymmetric(across, down)` | un margine vuoto dentro il genitore: `across` a sinistra e a destra, `down` in alto e in basso |
| `alignItems = 'stretch'` | ogni figlio prende tutta la larghezza di una colonna (o tutta l'altezza di una riga) |
| `flex = 1` | su un figlio: prende lo spazio che gli altri lasciano |

Qui il palco è una colonna: la barra del titolo (alta 40 pixel), poi la lista, che prende il resto (`flex = 1`). La barra del
titolo è una riga: il titolo prende ciò che lascia lo stato (largo 220 pixel). Cambia la dimensione della finestra in `zinc.json`
e tutto ci sta ancora, senza numeri da cambiare. Prima di disegnare, il palco chiama l'`onMeasure()` di ogni oggetto: il momento
per impostare una dimensione o un valore che serve al layout.

## Una scroll box

La lista è alta 880 pixel (20 righe da 44) e la finestra 400. Una **scroll box** ne mostra una parte, e si muove quando scorri:

- `box: ScrollBox = new ScrollBox();` contiene lo stato: `scrollY`, di quanto è scorsa la lista, e `contentHeight`, quanto è alta
  tutta la lista.
- `beginScrollBox(this.box, 0, 0, w, h)` ... `endScrollBox()`: ciò che viene disegnato tra i due è tagliato sulla scatola, e così
  le zone. Una riga a metà nascosta sotto il titolo non prende tocchi sulla sua metà nascosta.
- Disegni ogni riga a `i * ROW - this.box.scrollY`: quando la lista è scorsa di 100, ogni riga è 100 pixel più in alto.
- `stage.frame` fa il resto: la rotellina e il trackpad fanno scorrere la scatola sotto il puntatore; un dito che si muove di più
  di 12 pixel su di essa la fa scorrere (e non tocca niente), e un movimento rapido la lancia.

`isLocalRectVisible` dice se una riga è dentro la scatola: le righe che non si vedono non vengono disegnate, quindi una lista di
mille righe ne disegna al massimo venti.

## Riga per riga

- `const FRUITS = [...]` i venti frutti, in una lista. `const ROW = 44;` l'altezza di una riga.
- `let chosen = '';` l'ultimo frutto toccato, `''` (vuoto) all'inizio.
- `class Label extends Sprite` un testo centrato nella sua altezza: `(h - lineHeight(this.fontId)) / 2` dall'alto. `fontId` dice
  quale font, così il titolo e lo stato condividono la classe.
- `override onMeasure(): void` imposta l'altezza del contenuto prima del layout e del disegno.
- `rrect(0, 0, w, h, 12, 0xffffff, 255);` la carta bianca della lista, prima che la scatola si apra.
- `for (let i = 0; i < FRUITS.length; i++)` una riga per frutto. `continue` passa al frutto successivo quando questa riga è fuori
  vista.
- ``const id = `row ${i}`;`` il nome della zona della riga: `row 0`, `row 1`... `isZonePressed(id)` è vero finché il dito è
  sopra.
- `if (isZonePressed(id) || FRUITS[i] === chosen) rect(0, y, w, ROW, 0xe9e6df);` uno sfondo grigio per la riga tenuta o scelta.
  `||` significa "o".
- `drawText(plain, 16, y + (ROW - lineHeight(plain)) / 2, FRUITS[i], ...)` il nome del frutto, centrato nella sua riga.
- `rect(16, y + ROW - 1, w - 32, 1, 0xe9e6df);` una linea sottile sotto ogni riga.
- `registerTapZone(id, 0, y, w, ROW, () => { ... });` la riga prende i tocchi. La funzione ricorda `i`: ogni riga ha la sua.
- `status.text = ...` cambia il testo dell'etichetta di stato. `status` viene creato più sotto nel file; la funzione parte dopo,
  a un tocco, quando esiste. Un tocco chiede già una nuova immagine: il nuovo testo si vede subito.
- `stage.direction = 'column'; stage.alignItems = 'stretch';` la pagina è una colonna, i suoi figli larghi quanto la finestra
  meno il padding.
- `header.direction = 'row';` la barra del titolo è una riga di due etichette.
- `title.flex = 1;` il titolo prende la larghezza che lascia lo stato; `status.width = 220;` lo stato ha una larghezza fissa.
- `list.flex = 1;` la lista prende l'altezza che lascia la barra del titolo.

## Prova tu

- Rendi le righe più alte o più basse: cambia `ROW`. Tutto si adegua.
- Aggiungi una terza etichetta alla barra del titolo, *20 fruits*, tra il titolo e lo stato.
- Metti lo stato in fondo alla pagina: aggiungilo al palco dopo la lista, non all'header.
- Fai la lista larga metà finestra: `stage.direction = 'row'`, e una seconda lista accanto.
- Torna in cima quando tocchi il titolo: nell'`onDraw` di `Label`, una zona di tocco che imposta `list.box.scrollY = 0`.

## Dove andare ora

Sai costruire una scena: oggetti che si muovono e si disegnano da soli, un albero di figli, tocchi, trascinamenti, un layout e una
lista che scorre. Basta per la maggior parte delle app su un vecchio tablet.

- Il [riferimento di zinc:stage](../reference/stage.md): ogni campo, metodo e funzione, e ciò che ActionScript 3 ha e `zinc:stage`
  no.
- `zinc new stage` crea una piccola app da cui partire: un titolo, pulsanti colorati e un adesivo da trascinare.
- [`examples/music-tree`](../../examples/music-tree/src/main.ts) nel repository: un intero lettore musicale scritto così,
  veloce su un tablet del 2011.
- [Una scena dentro un'interfaccia](../start/beyond.md#a-scene-inside-an-interface), e un'interfaccia dentro una scena: sprite accanto
  a pulsanti, pulsanti su uno sprite.
- [Quattro modi di scrivere un programma](../start/styles.md), oppure la parte 4: [17. Tracciati e riempimenti](17-paths-and-fills.md), il canvas del web.
