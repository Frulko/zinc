# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.ts` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Une scène 3D faite avec le modèle `3d` : du code three.js comme sur le web, dessiné par le moteur de rendu de Zinc (ni navigateur, ni DOM).

```sh
zinc run      # drag to orbit around the scene, wheel or pinch to zoom
zinc test     # the motion (tests/motion.test.ts)
zinc build    # a native executable in build/
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.ts` | le moteur de rendu, la caméra avec OrbitControls, la boucle d'animation |
| `src/scene.ts` | ce que contient la scène : les lumières, le sol, l'anneau, les satellites |
| `src/motion.ts` | où sont les choses à l'instant t, sans three.js (ce que vérifient les tests) |

Les différences avec le même code sur le web sont marquées `zinc:` (`window` vient de 'three', le moteur de rendu dessine à l'écran).
Les modèles glTF se chargent avec `GLTFLoader` de 'three/addons/loaders/GLTFLoader.js' (voir examples/three/gltf-viewer dans le dépôt de Zinc).
