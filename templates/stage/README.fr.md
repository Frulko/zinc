# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.ts` et enregistrez.
- Apprenez le style scène, une leçon à la fois : https://frulko.github.io/zinc/fr/docs/learn/13-a-stage-and-a-sprite/
- Les quatre façons d'écrire un programme : https://frulko.github.io/zinc/fr/docs/start/styles/
- `zinc tour` : une première visite guidée.

Une application faite avec le modèle `stage` : une scène d'objets (`zinc:stage`) comme l'écrivent ActionScript 3 (Flash) et Haxe/OpenFL. Une `Stage`
contient des sprites ; chaque sprite est une classe qui se dessine dans ses propres coordonnées (`onDraw`), avance dans `onUpdate`, et déclare où
elle reçoit un toucher ou un glissement. Une colonne et une ligne les placent. Rien n'est dessiné tant que rien ne change, donc c'est léger sur une tablette de 2011.

```sh
zinc run     # tap a colour, drag the sticker
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.ts` | la scène : une ligne d'en-tête (un titre et quatre boutons de couleur) au-dessus d'un plateau qui porte un autocollant que l'on fait glisser |

Toutes les classes et fonctions : https://frulko.github.io/zinc/fr/docs/reference/stage/. Une application plus grande écrite ainsi, pour les anciennes tablettes :
`examples/music-tree` dans le dépôt de Zinc.
