# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.ts` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Un jeu 2D fait avec le modèle `game-2d` : ramassez les pièces avant la fin du temps.

```sh
zinc run      # play: arrows / WASD or a gamepad, or hold the pointer where to go; Enter, Space or a click to start
zinc test     # the rules of the game (tests/world.test.ts)
zinc build    # a native executable in build/
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.ts` | la boucle d'images : exécute la scène en cours et passe à celle qu'elle désigne |
| `src/scenes.ts` | les scènes du titre, du jeu et de fin de partie (dessin et entrées) |
| `src/world.ts` | les règles sans dessin : déplacement, pièces, score, temps (ce que vérifient les tests) |
| `src/save.ts` | le meilleur score, conservé avec `zinc:storage` |
| `assets/*.svg` | les sprites : la règle `sprite` de `zinc.json` les range dans une seule texture, un atlas, dessiné avec `zinc:sprite` : `atlas('sprites').frame('player.svg').draw(x, y)` (les fichiers PNG et Aseprite aussi, voir docs/plugins/sprite.md) |
| `assets/coin.wav` | le son d'une pièce ramassée, joué avec `zinc:audio` : `load('coin.wav').play()` (WAV, FLAC, MP3 ou OGG ; `loop` et `volume` pour la musique) |
| `zinc.json` `loading` | l'écran de chargement : une barre dessinée pendant le chargement des ressources, avant le démarrage de `src/main.ts`, qui s'estompe vers le titre ; il n'apparaît pas si le chargement tient dans une image (`"screen"` accepte `"bar"`, `"default"` : l'écran d'accueil avec une barre, ou un module à vous, voir docs/plugins/loader.md) |
