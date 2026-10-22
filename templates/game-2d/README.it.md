# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.ts` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Un gioco 2D fatto con il modello `game-2d`: raccogli le monete prima che finisca il tempo.

```sh
zinc run      # play: arrows / WASD or a gamepad, or hold the pointer where to go; Enter, Space or a click to start
zinc test     # the rules of the game (tests/world.test.ts)
zinc build    # a native executable in build/
```

| File | Cosa fa |
|---|---|
| `src/main.ts` | il ciclo dei frame: esegue la scena corrente e passa a quella che indica |
| `src/scenes.ts` | le scene del titolo, del gioco e della fine partita (disegno e input) |
| `src/world.ts` | le regole senza disegno: movimento, monete, punteggio, tempo (ciò che controllano i test) |
| `src/save.ts` | il punteggio migliore, conservato con `zinc:storage` |
| `assets/*.svg` | gli sprite: la regola `sprite` di `zinc.json` li impacchetta in un'unica texture, un atlante, disegnato con `zinc:sprite`: `atlas('sprites').frame('player.svg').draw(x, y)` (anche file PNG e Aseprite, vedi docs/plugins/sprite.md) |
| `assets/coin.wav` | il suono di una moneta raccolta, riprodotto con `zinc:audio`: `load('coin.wav').play()` (WAV, FLAC, MP3 o OGG; `loop` e `volume` per la musica) |
| `zinc.json` `loading` | la schermata di caricamento: una barra disegnata mentre si caricano le risorse, prima che parta `src/main.ts`, che sfuma nel titolo; non compare se il caricamento sta dentro un frame (`"screen"` accetta `"bar"`, `"default"`: la schermata iniziale con una barra, o un tuo modulo, vedi docs/plugins/loader.md) |
