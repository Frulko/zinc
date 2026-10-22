---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Choisir son type de programme

Zinc fait tourner beaucoup de types de programmes avec un seul outil. Le type que vous écrivez décide de ce que vous importez, du
modèle de départ et de ce que vous lirez ensuite. Cette page vous aide à choisir. Vous pourrez changer d'avis plus tard : tous les
types utilisent le même langage et les mêmes commandes (`zinc new`, `zinc run`, `zinc dev`).

Vous débutez en programmation ? Commencez par [le parcours de leçons](../learn/README.md), puis revenez ici. Vous êtes déjà à l'aise ? Lancez
`zinc new <template> my-project` avec un modèle du tableau, puis `zinc run`. [Premiers pas](../guide/01-getting-started.md)
vous guide pendant les cinq premières minutes. Un dessin, une scène, le canvas du web ou une interface :
[Quatre façons d'écrire un programme](styles.md) montre le même petit programme dans chaque façon d'afficher des choses à l'écran.

## La réponse courte

| Si vous voulez faire... | Choisissez |
| --- | --- |
| un jeu, ou tout ce que vous dessinez vous-même | dessin et jeux |
| un dessin avec les appels du canvas du web (tracés, dégradés) | dessin et jeux, avec `zinc:canvas` |
| une fenêtre avec des boutons, des listes et des champs de texte | une application avec des écrans (style Solid) |
| une application toute prête et jolie | des composants prêts à l'emploi (style Nuxt UI ou shadcn) |
| une application que vous avez déjà écrite avec React Native | du code React Native |
| une scène 3D | 3D |
| un programme sans fenêtre : un serveur, un outil pour le terminal | services et programmes en ligne de commande |
| quelque chose qui tourne sur une petite carte avec un écran ou des capteurs | cartes et microcontrôleurs |
| une bibliothèque JavaScript (three.js, Phaser) telle quelle | JavaScript pur |

## Les types, un par un

Un « modèle » est ce que `zinc new <template> my-project` copie. Un « exemple » est un programme terminé dans `examples/`, lancé avec
`zinc run examples/<name>`.

### Dessin et jeux

- **Vous écrivez :** une fonction appelée à chaque image qui dessine des rectangles, du texte et des images, et qui lit le clavier,
  la souris ou la manette (`zinc:gfx` : `onFrame`, `rect`, `drawText`).
- **Modèle :** `game` (un carré que vous déplacez avec les flèches), `game-2d` (un petit jeu avec des scènes, des sprites et un score
  sauvegardé), `canvas` (le même dessin avec le `CanvasRenderingContext2D` du web, venant de `zinc:canvas` : tracés, dégradés, texte).
- **Exemple :** `examples/breakout`, `examples/platformer`.
- **À lire ensuite :** [Premiers pas](../guide/01-getting-started.md), puis [Applications d'interface](../guide/03-ui-apps.md#fonts-assets-and-images) pour les polices et les ressources.
  Les leçons : [partie 1](../learn/README.md) pour `zinc:gfx`, [partie 4](../learn/17-paths-and-fills.md) pour `zinc:canvas`.

### Une application avec des écrans, style Solid

- **Vous écrivez :** des composants JSX (`<View>`, `<Text>`, `<Button>`) mis en forme avec `className`, et des valeurs qui mettent
  l'écran à jour toutes seules (`createSignal` de `zinc:ui/solid`).
- **Modèle :** `eink` et `remarkable` (tous deux écrits pour la tablette reMarkable, ils tournent aussi sur votre ordinateur).
  Il n'existe pas encore de modèle généraliste pour ce type : copiez `examples/ui` ou partez de `desktop-app`.
- **Exemple :** `examples/ui`, `examples/hero`.
- **À lire ensuite :** [Applications d'interface](../guide/03-ui-apps.md).

### Une application avec des écrans, style React

- **Vous écrivez :** les mêmes composants, avec des hooks (`useState`, `useEffect` de `zinc:ui/react`).
- **Modèle :** aucun pour l'instant.
- **Exemple :** `examples/rn-showcase`.
- **À lire ensuite :** [Applications d'interface](../guide/03-ui-apps.md#solid-vs-react).

### Composants prêts à l'emploi, style shadcn

- **Vous écrivez :** des écrans construits avec des pièces toutes faites (boutons, boîtes de dialogue, onglets, interrupteurs) de `zinc:ui/kit`.
- **Modèle :** aucun pour l'instant.
- **Exemple :** `examples/ui/kit-gallery`.
- **À lire ensuite :** [le kit d'interface](../ui-kit.md).

### Composants prêts à l'emploi, Nuxt UI

- **Vous écrivez :** des écrans construits avec les composants de Nuxt UI (`zinc:ui/nuxt`) : barres latérales, tableaux, graphiques, formulaires.
- **Modèle :** `desktop-app` (barre latérale, pages, menu, mode sombre) et `dashboard` (cartes et graphiques).
- **Exemple :** `examples/nuxt-ui`.
- **À lire ensuite :** [Nuxt UI sur Zinc](../nuxt-ui.md).

### Code React Native

- **Vous écrivez :** des composants et des styles React Native, avec `"ui": { "preset": "react-native" }` dans `zinc.json`.
- **Modèle :** aucun pour l'instant.
- **Exemple :** `examples/rn-port`, `examples/rn-tester`.
- **À lire ensuite :** [React Native sur Zinc](../react-native.md).

### 3D

- **Vous écrivez :** une scène avec l'API de three.js (ou celle, de plus bas niveau, de `zinc:3d`).
- **Modèle :** `3d`.
- **Exemple :** `examples/three`, `examples/gl-cube`.
- **À lire ensuite :** [le plugin three.js](../plugins/three.md).

### JavaScript pur

- **Vous écrivez :** des fichiers `.js`, avec des bibliothèques npm, exécutés sur QuickJS (ou V8, JavaScriptCore, Hermes avec `--engine`).
- **Modèle :** aucun pour l'instant : mettez un point d'entrée `.js` dans un projet `zinc.json` et `zinc run` choisit le moteur.
- **Exemple :** `examples/js-three`, `examples/js-phaser`.
- **À lire ensuite :** [Les moteurs JavaScript](../guide/12-js-engines.md).

### Services et programmes en ligne de commande

- **Vous écrivez :** un programme sans fenêtre : il lit ses arguments, répond à des requêtes HTTP, parle MQTT, lance des minuteurs
  (`zinc:sys`, `zinc:net`).
- **Modèle :** `cli`, `server`, `service` (une API avec des tests et une unité systemd).
- **Exemple :** `examples/service/sensor-hub`.
- **À lire ensuite :** [Services sans fenêtre](../guide/04-headless-services.md).

### Cartes et microcontrôleurs

- **Vous écrivez :** un programme qui lit des capteurs, pilote des broches et dessine sur un petit écran (`zinc:gpio`, pilotes d'écran, ou LVGL).
  Il tourne d'abord sur votre bureau, avec le matériel simulé, puis sur la carte.
- **Modèle :** `iot` (un bouton et une LED sur Raspberry Pi), `iot-board` (un ESP32 avec un capteur de mouvement et un écran).
- **Exemple :** `examples/boards`, `examples/esp32-widgets`.
- **À lire ensuite :** [Les cartes](../boards.md).

### Anciennes tablettes et anciens téléphones

- **Vous écrivez :** un arbre d'objets d'affichage (`zinc:stage`, comme l'écrivent ActionScript 3 et Haxe), qui garde chaque image
  légère sur une tablette de 2011.
- **Modèle :** `stage` (un titre, des boutons de couleur et un autocollant que vous faites glisser).
- **Exemple :** `examples/music-tree`.
- **À lire ensuite :** [les leçons sur la scène](../learn/13-a-stage-and-a-sprite.md), [la référence de zinc:stage](../reference/stage.md),
  `examples/GUIDELINES.md` dans le dépôt.

## Les types qui n'ont pas encore de modèle

Les applications de style React, le kit de style shadcn, le code React Native et le JavaScript pur n'en ont pas : partez de l'exemple
indiqué plus haut (copiez son dossier, puis lancez-le avec `zinc run`). Un modèle pour chacun est prévu ; d'ici là, l'exemple est le point de départ.

## Vous hésitez ?

Lancez deux ou trois exemples et gardez celui qui ressemble à ce que vous voulez faire : `zinc run examples/breakout`,
`zinc run examples/hero`, `zinc run examples/nuxt-ui`. Ensuite, [l'aide-mémoire de la syntaxe](../reference/syntax.md) montre ce que
vous pouvez écrire, et `zinc explain <code>` explique n'importe quelle erreur.
