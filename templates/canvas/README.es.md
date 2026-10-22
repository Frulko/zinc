# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.ts` y guarda.
- Aprende el estilo Canvas, una lección cada vez: https://frulko.github.io/zinc/es/docs/learn/17-paths-and-fills/
- Las cuatro formas de escribir un programa: https://frulko.github.io/zinc/es/docs/start/styles/
- `zinc tour`: un primer recorrido guiado.

Un boceto hecho con la plantilla `canvas`: dibuja con la API Canvas de la web (`zinc:canvas`), así que el código canvas de una página web o de un
tutorial se adapta con pocos cambios. No hay página ni elemento `<canvas>`: el `onFrame` de `zinc:gfx` llama a tu función unas 60 veces por
segundo, y `ctx.begin(0, 0, width(), height())` ... `ctx.end()` convierte toda la ventana en el lienzo.

```sh
zinc run     # a turning star on a gradient sky; click to blow bubbles
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | el bucle de fotogramas: un cielo con degradado, una estrella girada con `translate` y `rotate`, burbujas que suben y se desvanecen, texto |

Dos escrituras difieren de la web: un degradado se define con `ctx.fillGradient = g` (no con `ctx.fillStyle = g`), y el puntero se lee
desde `zinc:gfx` (`pointerX()`, `pointerY()`, `pointerDown()`) en vez de `addEventListener`. Todas las funciones y las demás diferencias:
https://frulko.github.io/zinc/es/docs/plugins/canvas2d/
