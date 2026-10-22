# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.tsx` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Un'app desktop fatta con il modello `desktop-app`, su `zinc:ui/nuxt` (componenti con l'aspetto di Nuxt UI).

```sh
zinc run      # the app
zinc test     # the router and the settings (tests/)
zinc build    # a native executable in build/
```

| File | Cosa fa |
|---|---|
| `src/main.tsx` | la struttura: una barra laterale comprimibile, la barra di navigazione con il menu dell'app, la pagina corrente |
| `src/router.ts` | le pagine e la cronologia (indietro), senza UI: testato |
| `src/settings.ts` | le impostazioni (nome, modalità scura) e come si salvano con `zinc:storage`: testato |
| `src/pages/*.tsx` | Home, Note (un elenco conservato tra un'esecuzione e l'altra), Impostazioni |

`src/desktop.ts` imposta il menu dell'applicazione (File, Modifica, Vista con scorciatoie, Finestra: la barra dei menu di macOS, disegnata altrove dal kit UI) e un'
icona nell'area di notifica del sistema dove la piattaforma ce l'ha; la pagina Impostazioni dice cosa offre questa piattaforma. Il menu File della barra di navigazione
contiene le stesse azioni dentro la finestra.
