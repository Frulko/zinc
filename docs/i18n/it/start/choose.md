---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Scegli il tuo tipo di programma

Zinc esegue molti tipi di programmi con un solo strumento. Il tipo che scrivi decide cosa importi, da quale modello partire
e cosa leggere dopo. Questa pagina ti aiuta a scegliere. Puoi cambiare idea più tardi: ogni tipo usa lo stesso linguaggio e
gli stessi comandi (`zinc new`, `zinc run`, `zinc dev`).

Sei alle prime armi con la programmazione? Parti dal [percorso di lezioni](../learn/README.md), poi torna qui. Ti senti già a tuo agio? Esegui
`zinc new <template> my-project` con un modello della tabella, poi `zinc run`. [Per iniziare](../guide/01-getting-started.md)
ti guida nei primi cinque minuti. Un disegno, una scena, il canvas del web o un'interfaccia:
[Quattro modi di scrivere un programma](styles.md) mostra lo stesso piccolo programma in ciascun modo di mettere cose sullo schermo.

## La risposta breve

| Se vuoi fare... | Scegli |
| --- | --- |
| un gioco, o qualsiasi cosa che disegni tu stesso | disegno e giochi |
| un disegno con le chiamate canvas del web (tracciati, gradienti) | disegno e giochi, con `zinc:canvas` |
| una finestra con pulsanti, elenchi e campi di testo | un'app con schermate (stile Solid) |
| un'app già pronta e bella da vedere | componenti pronti (stile Nuxt UI o shadcn) |
| un'app che hai già scritto con React Native | codice React Native |
| una scena 3D | 3D |
| un programma senza finestra: un server, uno strumento per il terminale | servizi e programmi da riga di comando |
| qualcosa che gira su una piccola scheda con uno schermo o dei sensori | schede e microcontrollori |
| una libreria JavaScript (three.js, Phaser) così com'è | JavaScript puro |

## I tipi, uno per uno

"Modello" è ciò che `zinc new <template> my-project` copia. "Esempio" è un programma finito in `examples/`, eseguito con
`zinc run examples/<name>`.

### Disegno e giochi

- **Scrivi:** una funzione chiamata a ogni fotogramma che disegna rettangoli, testo e immagini, e legge tastiera, mouse o gamepad
  (`zinc:gfx`: `onFrame`, `rect`, `drawText`).
- **Modello:** `game` (un quadrato che muovi con le frecce), `game-2d` (un piccolo gioco con scene, sprite e un punteggio salvato),
  `canvas` (lo stesso disegno con il `CanvasRenderingContext2D` del web, da `zinc:canvas`: tracciati, gradienti, testo).
- **Esempio:** `examples/breakout`, `examples/platformer`.
- **Leggi dopo:** [Per iniziare](../guide/01-getting-started.md), poi [App con interfaccia](../guide/03-ui-apps.md#fonts-assets-and-images) per font e risorse.
  Le lezioni: [parte 1](../learn/README.md) per `zinc:gfx`, [parte 4](../learn/17-paths-and-fills.md) per `zinc:canvas`.

### Un'app con schermate, stile Solid

- **Scrivi:** componenti JSX (`<View>`, `<Text>`, `<Button>`) con stile dato da `className`, e valori che aggiornano lo schermo
  da soli (`createSignal` da `zinc:ui/solid`).
- **Modello:** `eink` e `remarkable` (entrambi scritti per il tablet reMarkable, girano anche sul tuo computer).
  Per questo tipo non c'è ancora un modello generico: copia `examples/ui` o parti da `desktop-app`.
- **Esempio:** `examples/ui`, `examples/hero`.
- **Leggi dopo:** [App con interfaccia](../guide/03-ui-apps.md).

### Un'app con schermate, stile React

- **Scrivi:** gli stessi componenti, con gli hook (`useState`, `useEffect` da `zinc:ui/react`).
- **Modello:** ancora nessuno.
- **Esempio:** `examples/rn-showcase`.
- **Leggi dopo:** [App con interfaccia](../guide/03-ui-apps.md#solid-vs-react).

### Componenti pronti, stile shadcn

- **Scrivi:** schermate costruite con parti già fatte (pulsanti, finestre di dialogo, schede, interruttori) da `zinc:ui/kit`.
- **Modello:** ancora nessuno.
- **Esempio:** `examples/ui/kit-gallery`.
- **Leggi dopo:** [il kit UI](../ui-kit.md).

### Componenti pronti, Nuxt UI

- **Scrivi:** schermate costruite con i componenti di Nuxt UI (`zinc:ui/nuxt`): barre laterali, tabelle, grafici, moduli.
- **Modello:** `desktop-app` (barra laterale, pagine, menu, modalità scura) e `dashboard` (schede e grafici).
- **Esempio:** `examples/nuxt-ui`.
- **Leggi dopo:** [Nuxt UI su Zinc](../nuxt-ui.md).

### Codice React Native

- **Scrivi:** componenti e stili React Native, con `"ui": { "preset": "react-native" }` in `zinc.json`.
- **Modello:** ancora nessuno.
- **Esempio:** `examples/rn-port`, `examples/rn-tester`.
- **Leggi dopo:** [React Native su Zinc](../react-native.md).

### 3D

- **Scrivi:** una scena con l'API di three.js (o con `zinc:3d`, di livello più basso).
- **Modello:** `3d`.
- **Esempio:** `examples/three`, `examples/gl-cube`.
- **Leggi dopo:** [il plugin three.js](../plugins/three.md).

### JavaScript puro

- **Scrivi:** file `.js`, con le librerie npm, eseguiti su QuickJS (o su V8, JavaScriptCore, Hermes con `--engine`).
- **Modello:** ancora nessuno: metti un'entrata `.js` in un progetto `zinc.json` e `zinc run` sceglie il motore.
- **Esempio:** `examples/js-three`, `examples/js-phaser`.
- **Leggi dopo:** [Motori JavaScript](../guide/12-js-engines.md).

### Servizi e programmi da riga di comando

- **Scrivi:** un programma senza finestra: legge i suoi argomenti, risponde a richieste HTTP, parla MQTT, avvia timer
  (`zinc:sys`, `zinc:net`).
- **Modello:** `cli`, `server`, `service` (un'API con test e un'unità systemd).
- **Esempio:** `examples/service/sensor-hub`.
- **Leggi dopo:** [Servizi senza interfaccia](../guide/04-headless-services.md).

### Schede e microcontrollori

- **Scrivi:** un programma che legge sensori, comanda i pin e disegna su un piccolo schermo (`zinc:gpio`, driver di display, o LVGL).
  Gira prima sulla tua scrivania, con l'hardware simulato, poi sulla scheda.
- **Modello:** `iot` (un pulsante e un LED su Raspberry Pi), `iot-board` (un ESP32 con un sensore di movimento e uno schermo).
- **Esempio:** `examples/boards`, `examples/esp32-widgets`.
- **Leggi dopo:** [Schede](../boards.md).

### Vecchi tablet e telefoni

- **Scrivi:** un albero di oggetti di visualizzazione (`zinc:stage`, come lo scrivono ActionScript 3 e Haxe), che tiene leggero ogni
  fotogramma su un tablet del 2011.
- **Modello:** `stage` (un titolo, pulsanti colorati e un adesivo che trascini).
- **Esempio:** `examples/music-tree`.
- **Leggi dopo:** [le lezioni sulle scene](../learn/13-a-stage-and-a-sprite.md), [il riferimento di zinc:stage](../reference/stage.md),
  `examples/GUIDELINES.md` nel repository.

## Quali tipi non hanno ancora un modello

Le app in stile React, il kit in stile shadcn, il codice React Native e il JavaScript puro non ne hanno: parti dall'esempio indicato
sopra (copia la sua cartella, poi eseguilo con `zinc run`). Un modello per ciascuno è in programma; fino ad allora l'esempio è il punto di partenza.

## Non sei sicuro?

Esegui due o tre esempi e tieni quello che somiglia di più a ciò che vuoi fare: `zinc run examples/breakout`,
`zinc run examples/hero`, `zinc run examples/nuxt-ui`. Poi [il promemoria della sintassi](../reference/syntax.md) mostra cosa
puoi scrivere, e `zinc explain <code>` spiega qualsiasi errore.
