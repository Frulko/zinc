# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.ts` et enregistrez.
- Apprenez le style Canvas, une leçon à la fois : https://frulko.github.io/zinc/fr/docs/learn/17-paths-and-fills/
- Les quatre façons d'écrire un programme : https://frulko.github.io/zinc/fr/docs/start/styles/
- `zinc tour` : une première visite guidée.

Un croquis fait avec le modèle `canvas` : il dessine avec l'API Canvas du web (`zinc:canvas`), donc le code canvas d'une page web ou d'un
tutoriel se porte avec peu de changements. Il n'y a ni page ni élément `<canvas>` : le `onFrame` de `zinc:gfx` appelle votre fonction environ 60 fois par
seconde, et `ctx.begin(0, 0, width(), height())` ... `ctx.end()` fait de toute la fenêtre le canevas.

```sh
zinc run     # a turning star on a gradient sky; click to blow bubbles
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.ts` | la boucle d'images : un ciel dégradé, une étoile tournée avec `translate` et `rotate`, des bulles qui montent et s'effacent, du texte |

Deux écritures diffèrent du web : un dégradé se définit avec `ctx.fillGradient = g` (et non `ctx.fillStyle = g`), et le pointeur se lit
avec `zinc:gfx` (`pointerX()`, `pointerY()`, `pointerDown()`) au lieu de `addEventListener`. Toutes les fonctions et les autres différences :
https://frulko.github.io/zinc/fr/docs/plugins/canvas2d/
