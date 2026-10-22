---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Impara Zinc: da una forma a un'app

Queste lezioni ti mostrano come fare un programma che mette qualcosa sullo schermo, risponde alla tastiera, al mouse e al tocco,
disegna, riproduce suoni. Poi vedrai come costruire un'interfaccia con testo e pulsanti, una scena di oggetti, o un disegno con il canvas
del web. Ogni lezione è breve. Ognuna ti dà il codice completo, lo spiega riga per riga e finisce con modifiche da provare.

Non devi conoscere Zinc. Un po' di JavaScript aiuta, ma non è necessario: ogni riga è spiegata. I programmi Zinc
si scrivono in TypeScript (JavaScript con i tipi) con qualche regola in più, quindi quasi tutto quello che impari qui funziona anche
sul web.

## Prima di cominciare

Installa Zinc con un solo comando (altri modi in [Per iniziare](../guide/01-getting-started.md#install)):

```sh
brew install frulko/zinc/zinc
zinc doctor
```

Oppure installa **Zinc Atelier**, l'app che modifica ed esegue i programmi senza terminale (`--atelier` nel comando di installazione di
[Per iniziare](../guide/01-getting-started.md#install)).

## Come eseguire una lezione

Il codice di ogni lezione è un piccolo progetto in [`docs/learn/samples/`](samples/): un file `zinc.json` e una cartella `src`.
Scarica quella cartella da [GitHub](https://github.com/Frulko/zinc/tree/main/docs/learn/samples), oppure usa la tua copia del
repository di Zinc.

**In un terminale**, dai a `zinc run` la cartella della lezione:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Si apre una finestra. Chiudila per fermare il programma. Quello che il programma stampa con `console.log` appare nel terminale.

**In Zinc Atelier**, scegli *File > Open Sketch…* (Cmd+O su Mac, Ctrl+O altrove), seleziona la cartella della lezione, poi
*Sketch > Run* (Cmd+R o Ctrl+R). Le righe stampate appaiono nella console di Atelier. Cambia il codice ed eseguilo di nuovo.

**Il tuo progetto**: crea una cartella con i due file della lezione. `zinc.json` dice dov'è il codice e quanto è grande la
finestra; la lezione 1 lo spiega. Poi `zinc run` in quella cartella.

## Le lezioni

**Parte 1: disegnare.** Il tuo programma disegna da solo l'intera immagine, di continuo, molte volte al secondo. Così funzionano i giochi,
le animazioni e l'arte generativa. Usa il modulo `zinc:gfx`.

1. [Una finestra e una forma](01-window-and-shape.md): apri una finestra, colora lo sfondo, disegna un rettangolo e un cerchio.
2. [Colori e movimento](02-colours-and-movement.md): il ciclo dei frame, il tempo tra i frame, colori fatti con i numeri.
3. [La tastiera](03-keyboard.md): muovi un quadrato con le frecce, leggi il nome di un tasto qualsiasi.
4. [Il mouse e il tocco](04-mouse-and-touch.md): disegna linee con il mouse o con un dito, la rotellina, il tasto destro.
5. [Testo e immagini](05-text-and-images.md): font e dimensioni, testo centrato, un'immagine dalla cartella degli asset.
6. [Suono](06-sound.md): suona note quando clicchi o premi un tasto.

**Parte 2: un'interfaccia.** Descrivi lo schermo una volta sola, come elementi in un albero (una scatola contiene un titolo e un pulsante), e Zinc
lo disegna e lo tiene aggiornato. Così funzionano le app e gli strumenti. Usa `zinc:ui`, scritto come React o Solid.

7. [Componenti](07-components.md): `View`, `Text`, `Image`, `Button` e come vengono disposti.
8. [Stato](08-state.md): un valore che lo schermo segue da solo (un signal).
9. [Eventi](09-events.md): clic, pressioni e movimenti del puntatore, la tastiera.
10. [Stili](10-styles.md): colori, dimensioni, spazi e angoli con `className`, stili che cambiano.
11. [Un disegno dentro un'interfaccia](11-drawing-in-an-interface.md): un `Canvas` che disegna con `zinc:gfx` accanto ai pulsanti.
12. [Una piccola app completa](12-a-small-app.md): una lista della spesa dove scrivi, aggiungi, spunti e svuoti.

**Parte 3: una scena.** Il tuo programma è fatto di oggetti, ognuno è una classe che conosce il suo posto, si disegna da sé e risponde ai tocchi e
ai trascinamenti; un palco li contiene e disegna solo quando qualcosa è cambiato. Così ActionScript 3 (Flash) e Haxe scrivono giochi e app,
ed è così che le app di Zinc restano veloci sui tablet vecchi. Usa `zinc:stage`.

13. [Un palco e uno sprite](13-a-stage-and-a-sprite.md): una classe di palla, tre palle su un palco, `onUpdate` e `onDraw`.
14. [Figli e coordinate locali](14-children-and-local-coordinates.md): una luna intorno a un pianeta intorno al sole.
15. [Tocchi e trascinamenti](15-taps-and-drags.md): un pulsante che conta i suoi tocchi, carte che prendi e sposti.
16. [Il layout e una scatola a scorrimento](16-layout-and-scrolling.md): una barra del titolo in una riga, una lista di frutti che scorre.

**Parte 4: il canvas del web.** Il disegno della parte 1, con le chiamate che le pagine web usano per disegnare in un `<canvas>`: tracciati, contorni,
curve, trasformazioni e sfumature. Il codice di una pagina web o di un tutorial sul canvas si legge allo stesso modo. Usa `zinc:canvas`.

17. [Tracciati e riempimenti](17-paths-and-fills.md): una casa con un tetto, una porta, una finestra e un tracciato curvo.
18. [Trasformazioni](18-transforms.md): due orologi disegnati spostando, girando e rimpicciolendo il foglio.
19. [Un'animazione](19-animation.md): un mulino a vento con le pale che girano e nuvole che passano.
20. [Testo e sfumature](20-text-and-gradients.md): un poster con un cielo che sfuma, un sole luminoso e testo centrato.

Ogni lezione dura da 10 a 20 minuti. Fai le lezioni di una parte in ordine: ognuna usa quello che ha insegnato la precedente. Le parti 2, 3
e 4 partono tutte dalla parte 1, quindi dopo la parte 1 scegli quella che ti piace.

## Quattro modi di mettere le cose sullo schermo

| | `zinc:gfx` (parte 1) | `zinc:ui` (parte 2) | `zinc:stage` (parte 3) | `zinc:canvas` (parte 4) |
|---|---|---|---|---|
| Cosa scrivi | cosa disegnare, a ogni frame | cosa contiene lo schermo, una volta | oggetti che si disegnano da soli | cosa disegnare, a ogni frame, come sul web |
| Adatto a | giochi, animazioni, arte | app, moduli, strumenti, impostazioni | app e giochi su tablet vecchi | codice canvas del web, disegni vettoriali |
| Posizione | dai ogni x e y | il layout dispone gli elementi | ogni oggetto nel suo genitore, o una riga o colonna | dai ogni x e y, o sposti il foglio |
| Cambiamenti | disegni la nuova immagine | cambi un valore, lo schermo segue | sposti un oggetto, il palco disegna | disegni la nuova immagine |

Si possono mescolare: la lezione 11 disegna con `zinc:gfx` dentro un'interfaccia. [Quattro modi di scrivere un programma](../start/styles.md) mostra lo stesso
piccolo programma scritto in ognuno, affiancati, e come stanno insieme.

## Parole che incontrerai

| Parola | Significato |
|---|---|
| pixel | un punto dello schermo. Dimensioni e posizioni si contano in pixel. |
| x, y | una posizione: x conta i pixel dal bordo sinistro, y dal bordo in alto. (0, 0) è l'angolo in alto a sinistra. |
| frame | un'immagine della finestra. Un programma mostra circa 60 frame al secondo, come un flip book. |
| funzione | un pezzo di codice con un nome che parte quando lo chiami: `clear(0xffffff)` chiama `clear`. |
| callback | una funzione che dai a Zinc, che la chiama più tardi: a ogni frame, a un clic. |
| modulo | un insieme di funzioni che puoi importare: `zinc:gfx` disegna, `zinc:audio` riproduce suoni, `zinc:ui` costruisce interfacce. |
| tipo | che genere di valore contiene una variabile: `number`, `string` (testo), `boolean` (vero o falso). Zinc li controlla prima di eseguire. |
| signal | un valore che l'interfaccia segue: cambialo e ogni testo o stile che lo legge cambia a sua volta. |
| componente | un pezzo di interfaccia, scritto come una funzione che restituisce elementi: `View`, `Text`, `Button`, o uno tuo. |
| classe | il progetto di un oggetto: cosa contiene (campi) e cosa fa (metodi). `new Ball()` crea un oggetto dal progetto `Ball`. |
| sprite | un oggetto di una scena (parte 3): una posizione, una dimensione, dei figli e i metodi che Zinc chiama per aggiornarlo e disegnarlo. |
| tracciato | una forma che il canvas costruisce punto per punto (parte 4) prima di riempirla o di disegnarne il contorno. |

## Quando conosci queste cose

- [Riferimento di zinc:gfx](../reference/gfx.md): ogni funzione di disegno e di input, raggruppate.
- [Eventi di zinc:ui](../reference/ui-events.md): ogni evento dell'interfaccia, cosa ti dà, quando scatta.
- [Riferimento di zinc:stage](../reference/stage.md): ogni classe e funzione della parte 3.
- [zinc:canvas](../plugins/canvas2d.md): ogni funzione della parte 4 e le poche differenze dal web.
- [App con interfaccia](../guide/03-ui-apps.md) e [zinc:ui a fondo](../ui.md): scorrimento, campi di testo, animazioni, livelli.
- [Il kit UI](../ui-kit.md): pulsanti, finestre di dialogo, menu e schede già pronti.
- [Suono](../plugins/audio.md): ogni funzione di `zinc:audio`.
- Gli esempi di Zinc Atelier (*File > Examples…*) e `zinc new game-2d`, un piccolo gioco completo da leggere e modificare;
  `zinc new stage` e `zinc new canvas` avviano un progetto nello stile della parte 3 o della parte 4.
