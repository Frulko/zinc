# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.tsx` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Un tableau de bord en direct fait avec le modèle `dashboard`, sur `zinc:ui/nuxt`.

```sh
zinc run      # the dashboard, fed by the mock source
zinc test     # the series and the source (tests/)
zinc build    # a native executable in build/
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/source.ts` | d'où viennent les chiffres : `MockSource` (une marche aléatoire à graine fixe, quatre mesures par seconde) derrière l'interface `Source` |
| `src/series.ts` | une fenêtre glissante de mesures avec la dernière, le min, le max et la moyenne |
| `src/charts.ts` | les graphiques en courbes et en barres, dessinés dans un `<Canvas>` |
| `src/main.tsx` | la page : les cartes de chiffres, les graphiques, les alertes, pause / reprise |

Pour afficher de vraies données, écrivez une classe avec `poll(dt: number): Sample[]` (depuis `zinc:net` fetch, `zinc:mqtt`, un port série...) et passez-la à `start()` dans
`src/main.tsx` à la place de la source simulée.
