# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.ts` y guarda.
- Aprende el estilo escena, una lección cada vez: https://frulko.github.io/zinc/es/docs/learn/13-a-stage-and-a-sprite/
- Las cuatro formas de escribir un programa: https://frulko.github.io/zinc/es/docs/start/styles/
- `zinc tour`: un primer recorrido guiado.

Una aplicación hecha con la plantilla `stage`: una escena de objetos (`zinc:stage`) tal como la escriben ActionScript 3 (Flash) y Haxe/OpenFL. Un `Stage`
contiene sprites; cada sprite es una clase que se dibuja en sus propias coordenadas (`onDraw`), avanza en `onUpdate` y registra dónde
acepta un toque o un arrastre. Una columna y una fila los colocan. No se dibuja nada mientras nada cambia, así que sigue siendo ligera en una tableta de 2011.

```sh
zinc run     # tap a colour, drag the sticker
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | la escena: una fila de cabecera (un título y cuatro botones de color) sobre un tablero que contiene una pegatina que puedes arrastrar |

Todas las clases y funciones: https://frulko.github.io/zinc/es/docs/reference/stage/. Una aplicación más grande escrita así, para tabletas antiguas:
`examples/music-tree` en el repositorio de Zinc.
