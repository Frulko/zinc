# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.ts` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Un juego 2D hecho con la plantilla `game-2d`: recoge las monedas antes de que se acabe el tiempo.

```sh
zinc run      # play: arrows / WASD or a gamepad, or hold the pointer where to go; Enter, Space or a click to start
zinc test     # the rules of the game (tests/world.test.ts)
zinc build    # a native executable in build/
```

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | el bucle de fotogramas: ejecuta la escena actual y pasa a la que esta indica |
| `src/scenes.ts` | las escenas del título, del juego y del fin de partida (dibujo y entradas) |
| `src/world.ts` | las reglas sin dibujo: movimiento, monedas, puntuación, tiempo (lo que comprueban los tests) |
| `src/save.ts` | la mejor puntuación, guardada con `zinc:storage` |
| `assets/*.svg` | los sprites: la regla `sprite` de `zinc.json` los agrupa en una sola textura, un atlas, que se dibuja con `zinc:sprite`: `atlas('sprites').frame('player.svg').draw(x, y)` (también archivos PNG y Aseprite, mira docs/plugins/sprite.md) |
| `assets/coin.wav` | el sonido de una moneda recogida, que suena con `zinc:audio`: `load('coin.wav').play()` (WAV, FLAC, MP3 u OGG; `loop` y `volume` para la música) |
| `zinc.json` `loading` | la pantalla de carga: una barra que se dibuja mientras se cargan los recursos, antes de que arranque `src/main.ts`, y que se funde con el título; no aparece si todo carga en un fotograma (`"screen"` acepta `"bar"`, `"default"`: la pantalla de bienvenida con una barra, o un módulo tuyo, mira docs/plugins/loader.md) |
