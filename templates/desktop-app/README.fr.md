# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.tsx` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Une application de bureau faite avec le modèle `desktop-app`, sur `zinc:ui/nuxt` (des composants au style de Nuxt UI).

```sh
zinc run      # the app
zinc test     # the router and the settings (tests/)
zinc build    # a native executable in build/
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.tsx` | la coque : une barre latérale repliable, la barre de navigation avec le menu de l'application, la page en cours |
| `src/router.ts` | les pages et l'historique (retour), sans interface : testé |
| `src/settings.ts` | les réglages (nom, mode sombre) et leur sauvegarde avec `zinc:storage` : testé |
| `src/pages/*.tsx` | Accueil, Notes (une liste conservée d'une fois sur l'autre), Réglages |

`src/desktop.ts` définit le menu de l'application (Fichier, Édition, Affichage avec raccourcis, Fenêtre : la barre de menus de macOS, dessinée ailleurs par le kit d'interface) et une
icône dans la zone de notification du système là où la plateforme en a une ; la page Réglages indique ce que cette plateforme propose. Le menu Fichier de la barre de navigation reprend les mêmes
actions dans la fenêtre.
