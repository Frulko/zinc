# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.tsx` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Un'app per reMarkable Paper Pro fatta con il modello `eink`: un elenco di cose da fare che spunti con la penna, e una pagina su cui disegnare. Entrambi si conservano tra un'esecuzione e l'altra.

```sh
zinc run                          # on the desktop, half the tablet's size (the mouse is the pen; right button erases)
zinc test                         # the to-do list (tests/todo.test.ts)
zinc export --target rmpp         # the tablet build in dist/ (see Zinc's docs/targets/remarkable-paper-pro.md to install it)
```

| File | Cosa fa |
|---|---|
| `src/main.tsx` | le due pagine e la barra delle schede |
| `src/todo.ts` | l'elenco: aggiungi, spunta, cancella le voci spuntate, salva / carica (testato) |
| `src/store.ts` | ciò che si salva con `zinc:storage`: l'elenco e i tratti dello schizzo |

La carta elettronica è lenta a cambiare e non ha colori: il modello usa nero su bianco, bordi larghi e testo grande, e cambia lo schermo solo
quando succede qualcosa (nessuna animazione, nessun cursore lampeggiante).
