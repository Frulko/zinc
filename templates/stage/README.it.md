# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.ts` e salva.
- Impara lo stile a scena, una lezione alla volta: https://frulko.github.io/zinc/it/docs/learn/13-a-stage-and-a-sprite/
- I quattro modi di scrivere un programma: https://frulko.github.io/zinc/it/docs/start/styles/
- `zinc tour`: un primo tour guidato.

Un'app fatta con il modello `stage`: una scena di oggetti (`zinc:stage`) come la scrivono ActionScript 3 (Flash) e Haxe/OpenFL. Uno `Stage`
contiene sprite; ogni sprite è una classe che si disegna da sola nelle sue coordinate (`onDraw`), va avanti in `onUpdate`, e registra dove
riceve un tocco o un trascinamento. Una colonna e una riga li dispongono. Non si disegna nulla finché non cambia nulla, così resta leggero su un tablet del 2011.

```sh
zinc run     # tap a colour, drag the sticker
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| File | Cosa fa |
|---|---|
| `src/main.ts` | la scena: una riga di intestazione (un titolo e quattro pulsanti colore) sopra una tavola che contiene un adesivo da trascinare |

Ogni classe e funzione: https://frulko.github.io/zinc/it/docs/reference/stage/. Un'app più grande scritta in questo modo, per i vecchi tablet:
`examples/music-tree` nel repository di Zinc.
