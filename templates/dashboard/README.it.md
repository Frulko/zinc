# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.tsx` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Una dashboard in tempo reale fatta con il modello `dashboard`, su `zinc:ui/nuxt`.

```sh
zinc run      # the dashboard, fed by the mock source
zinc test     # the series and the source (tests/)
zinc build    # a native executable in build/
```

| File | Cosa fa |
|---|---|
| `src/source.ts` | da dove arrivano i numeri: `MockSource` (una passeggiata casuale con seme, quattro campioni al secondo) dietro l'interfaccia `Source` |
| `src/series.ts` | una finestra scorrevole di campioni con ultimo, minimo, massimo e media |
| `src/charts.ts` | i grafici a linee e a barre, disegnati in un `<Canvas>` |
| `src/main.tsx` | la pagina: schede con le statistiche, i grafici, gli avvisi, pausa / ripresa |

Per mostrare dati veri, scrivi una classe con `poll(dt: number): Sample[]` (da `fetch` di `zinc:net`, `zinc:mqtt`, una porta seriale...) e passala a `start()` in
`src/main.tsx` al posto del mock.
