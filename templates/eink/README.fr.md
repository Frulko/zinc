# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.tsx` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Une application pour la reMarkable Paper Pro faite avec le modèle `eink` : une liste de tâches que l'on coche au stylet, et une page pour dessiner. Les deux sont conservées d'une fois sur l'autre.

```sh
zinc run                          # on the desktop, half the tablet's size (the mouse is the pen; right button erases)
zinc test                         # the to-do list (tests/todo.test.ts)
zinc export --target rmpp         # the tablet build in dist/ (see Zinc's docs/targets/remarkable-paper-pro.md to install it)
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.tsx` | les deux pages et la barre d'onglets |
| `src/todo.ts` | la liste : ajouter, cocher, effacer les tâches cochées, enregistrer / charger (testé) |
| `src/store.ts` | ce qui est enregistré avec `zinc:storage` : la liste et les traits du dessin |

Le papier électronique est lent à changer et n'a pas de couleur : le modèle reste en noir sur blanc, avec de larges bordures et de grands caractères, et ne change l'écran
que lorsqu'il se passe quelque chose (pas d'animation, pas de curseur qui clignote).
