# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.ts` e salva.
- Impara lo stile Canvas, una lezione alla volta: https://frulko.github.io/zinc/it/docs/learn/17-paths-and-fills/
- I quattro modi di scrivere un programma: https://frulko.github.io/zinc/it/docs/start/styles/
- `zinc tour`: un primo tour guidato.

Uno sketch fatto con il modello `canvas`: disegna con l'API Canvas del web (`zinc:canvas`), quindi il codice canvas di una pagina web o di un
tutorial si porta qui con poche modifiche. Non c'è nessuna pagina e nessun elemento `<canvas>`: `onFrame` di `zinc:gfx` chiama la tua funzione circa 60 volte al
secondo, e `ctx.begin(0, 0, width(), height())` ... `ctx.end()` fa dell'intera finestra il canvas.

```sh
zinc run     # a turning star on a gradient sky; click to blow bubbles
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| File | Cosa fa |
|---|---|
| `src/main.ts` | il ciclo dei frame: un cielo sfumato, una stella ruotata con `translate` e `rotate`, bolle che salgono e svaniscono, testo |

Due scritture sono diverse dal web: un gradiente si imposta con `ctx.fillGradient = g` (non `ctx.fillStyle = g`), e il puntatore si legge
da `zinc:gfx` (`pointerX()`, `pointerY()`, `pointerDown()`) invece di usare `addEventListener`. Ogni funzione e le altre differenze:
https://frulko.github.io/zinc/it/docs/plugins/canvas2d/
