---
source: a89b891f8d70d530101975a391dffc953c46bfdf
---
# Apprendre Zinc : d'une forme à une application

Ces leçons montrent comment faire un programme qui affiche quelque chose à l'écran, répond au clavier, à la souris et au toucher,
dessine, joue du son, puis comment construire une interface avec du texte et des boutons, une scène d'objets, ou un dessin avec le canvas
du web. Chaque leçon est courte. Chacune donne le code complet, l'explique ligne par ligne et se termine par des changements à essayer.

Vous n'avez pas besoin de connaître Zinc. Un peu de JavaScript aide, mais ce n'est pas obligatoire : chaque ligne est expliquée. Les programmes
Zinc s'écrivent en TypeScript (du JavaScript avec des types) avec quelques règles en plus ; presque tout ce que vous apprenez ici
fonctionne donc aussi sur le web.

## Avant de commencer

Installez Zinc avec une seule commande (d'autres façons dans [Premiers pas](../guide/01-getting-started.md#install)) :

```sh
brew install frulko/zinc/zinc
zinc doctor
```

Ou installez **Zinc Atelier**, l'application qui modifie et lance les programmes sans terminal (`--atelier` dans la commande d'installation de
[Premiers pas](../guide/01-getting-started.md#install)).

## Comment lancer une leçon

Le code de chaque leçon est un petit projet dans [`docs/learn/samples/`](samples/) : un fichier `zinc.json` et un dossier `src`.
Téléchargez ce dossier depuis [GitHub](https://github.com/Frulko/zinc/tree/main/docs/learn/samples), ou utilisez votre copie du
dépôt de Zinc.

**Dans un terminal**, donnez à `zinc run` le dossier de la leçon :

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Une fenêtre s'ouvre. Fermez-la pour arrêter le programme. Ce que le programme affiche avec `console.log` apparaît dans le terminal.

**Dans Zinc Atelier**, choisissez *Fichier > Ouvrir un croquis…* (Cmd+O sur un Mac, Ctrl+O ailleurs), sélectionnez le dossier de la leçon, puis
*Croquis > Lancer* (Cmd+R ou Ctrl+R). Les lignes affichées apparaissent dans la console d'Atelier. Changez le code et relancez-le.

**Votre propre projet** : créez un dossier avec les deux fichiers de la leçon. `zinc.json` dit où se trouve le code et quelle est la taille de la
fenêtre ; la leçon 1 l'explique. Ensuite, lancez `zinc run` dans ce dossier.

## Les leçons

**Partie 1 : dessiner.** Votre programme dessine lui-même toute l'image, encore et encore, plusieurs fois par seconde. C'est ainsi que fonctionnent les jeux,
les animations et l'art génératif. Elle utilise le module `zinc:gfx`.

1. [Une fenêtre et une forme](01-window-and-shape.md) : ouvrir une fenêtre, peindre le fond, dessiner un rectangle et un cercle.
2. [Couleurs et mouvement](02-colours-and-movement.md) : la boucle d'images, le temps entre deux images, des couleurs fabriquées avec des nombres.
3. [Le clavier](03-keyboard.md) : déplacer un carré avec les flèches, lire le nom de n'importe quelle touche.
4. [La souris et le toucher](04-mouse-and-touch.md) : tracer des lignes avec la souris ou un doigt, la molette, le bouton droit.
5. [Texte et images](05-text-and-images.md) : polices et tailles, texte centré, une image du dossier des ressources.
6. [Le son](06-sound.md) : jouer des notes quand vous cliquez ou appuyez sur une touche.

**Partie 2 : une interface.** Vous décrivez l'écran une seule fois, sous forme d'éléments dans un arbre (une boîte contient un titre et un bouton), et Zinc
le dessine et le tient à jour. C'est ainsi que fonctionnent les applications et les outils. Elle utilise `zinc:ui`, écrit comme React ou Solid.

7. [Composants](07-components.md) : `View`, `Text`, `Image`, `Button`, et comment ils sont disposés.
8. [L'état](08-state.md) : une valeur que l'écran suit tout seul (un signal).
9. [Événements](09-events.md) : clics, appuis et déplacements du pointeur, clavier.
10. [Styles](10-styles.md) : couleurs, tailles, espacements et coins avec `className`, des styles qui changent.
11. [Un dessin dans une interface](11-drawing-in-an-interface.md) : un `Canvas` qui dessine avec `zinc:gfx` à côté de boutons.
12. [Une petite application complète](12-a-small-app.md) : une liste de courses où l'on écrit, ajoute, coche et efface.

**Partie 3 : une scène.** Votre programme est fait d'objets, chacun étant une classe qui connaît sa place, se dessine elle-même et répond aux touchers et aux
glissements ; une scène les contient et ne redessine que lorsque quelque chose a changé. C'est ainsi qu'ActionScript 3 (Flash) et Haxe écrivent des jeux et des applications,
et c'est ce qui permet aux applications de Zinc de rester rapides sur de vieilles tablettes. Elle utilise `zinc:stage`.

13. [Une scène et un sprite](13-a-stage-and-a-sprite.md) : une classe de balle, trois balles sur une scène, `onUpdate` et `onDraw`.
14. [Enfants et coordonnées locales](14-children-and-local-coordinates.md) : une lune autour d'une planète autour du soleil.
15. [Touchers et glissements](15-taps-and-drags.md) : un bouton qui compte ses touchers, des cartes que l'on ramasse et déplace.
16. [La mise en page et une boîte défilante](16-layout-and-scrolling.md) : une barre de titre en ligne, une liste de fruits qui défile.

**Partie 4 : le canvas du web.** Le dessin de la partie 1, avec les appels que les pages web utilisent pour dessiner dans un `<canvas>` : chemins, contours,
courbes, transformations et dégradés. Le code d'une page web ou d'un tutoriel sur le canvas se lit de la même façon. Elle utilise `zinc:canvas`.

17. [Chemins et remplissages](17-paths-and-fills.md) : une maison avec un toit, une porte, une fenêtre et un chemin courbe.
18. [Transformations](18-transforms.md) : deux horloges dessinées en déplaçant, tournant et rétrécissant la feuille.
19. [Une animation](19-animation.md) : un moulin dont les ailes tournent et des nuages qui dérivent.
20. [Texte et dégradés](20-text-and-gradients.md) : une affiche avec un ciel qui s'estompe, un soleil rayonnant et du texte centré.

Chaque leçon prend de 10 à 20 minutes. Faites les leçons d'une partie dans l'ordre : chacune utilise ce qu'a enseigné la précédente. Les parties 2, 3
et 4 partent chacune de la partie 1 ; après la partie 1, prenez donc celle qui vous plaît.

## Quatre façons d'afficher des choses à l'écran

| | `zinc:gfx` (partie 1) | `zinc:ui` (partie 2) | `zinc:stage` (partie 3) | `zinc:canvas` (partie 4) |
|---|---|---|---|---|
| Vous écrivez | ce qu'il faut dessiner, à chaque image | ce que l'écran contient, une seule fois | des objets qui se dessinent eux-mêmes | ce qu'il faut dessiner, à chaque image, comme sur le web |
| Idéal pour | jeux, animations, art | applications, formulaires, outils, réglages | applications et jeux sur de vieilles tablettes | code de canvas web, dessins vectoriels |
| Position | vous donnez chaque x et y | la mise en page place les éléments | chaque objet dans son parent, ou une ligne ou une colonne | vous donnez chaque x et y, ou vous déplacez la feuille |
| Changements | vous dessinez la nouvelle image | vous changez une valeur, l'écran suit | vous déplacez un objet, la scène dessine | vous dessinez la nouvelle image |

Elles se combinent : la leçon 11 dessine avec `zinc:gfx` dans une interface. [Quatre façons d'écrire un programme](../start/styles.md) montre le même
petit programme écrit dans chacune, côte à côte, et comment elles s'associent. [Au-delà des composants](../start/beyond.md) met une scène dans une interface et une interface dans une scène,
et va plus loin que les éléments prêts à l'emploi : graphiques, styles en objets, vos propres composants, animations.

## Les mots que vous rencontrerez

| Mot | Sens |
|---|---|
| pixel | un point de l'écran. Les tailles et les positions se comptent en pixels. |
| x, y | une position : x compte les pixels depuis le bord gauche, y depuis le bord haut. (0, 0) est le coin en haut à gauche. |
| image (frame) | une image de la fenêtre. Un programme affiche environ 60 images par seconde, comme un folioscope. |
| fonction | un morceau de code nommé qui s'exécute quand vous l'appelez : `clear(0xffffff)` appelle `clear`. |
| callback (fonction de rappel) | une fonction que vous donnez à Zinc, qui l'appelle plus tard : à chaque image, à chaque clic. |
| module | un ensemble de fonctions que vous pouvez importer : `zinc:gfx` dessine, `zinc:audio` joue du son, `zinc:ui` construit des interfaces. |
| type | le genre de valeur que contient une variable : `number` (nombre), `string` (texte), `boolean` (vrai ou faux). Zinc les vérifie avant de lancer le programme. |
| signal | une valeur que l'interface suit : changez-la et chaque texte ou style qui la lit change aussi. |
| composant | un morceau d'interface, écrit comme une fonction qui renvoie des éléments : `View`, `Text`, `Button`, ou le vôtre. |
| classe | le plan d'un objet : ce qu'il contient (les champs) et ce qu'il fait (les méthodes). `new Ball()` fabrique un objet à partir du plan `Ball`. |
| sprite | un objet d'une scène (partie 3) : une position, une taille, des enfants, et les méthodes que Zinc appelle pour le mettre à jour et le dessiner. |
| chemin | une forme que le canvas construit point par point (partie 4) avant de la remplir ou d'en tracer le contour. |

## Quand vous maîtrisez ces notions

- [Référence de zinc:gfx](../reference/gfx.md) : toutes les fonctions de dessin et d'entrée, regroupées.
- [Événements de zinc:ui](../reference/ui-events.md) : tous les événements de l'interface, ce qu'ils vous donnent, quand ils se déclenchent.
- [Référence de zinc:stage](../reference/stage.md) : toutes les classes et fonctions de la partie 3.
- [zinc:canvas](../plugins/canvas2d.md) : toutes les fonctions de la partie 4, et les quelques différences avec le web.
- [Applications d'interface](../guide/03-ui-apps.md) et [zinc:ui en détail](../ui.md) : défilement, champs de texte, animations, calques.
- [Au-delà des composants](../start/beyond.md) : que faire quand les éléments prêts à l'emploi ne suffisent pas.
- [Le kit d'interface](../ui-kit.md) : des boutons, boîtes de dialogue, menus et onglets prêts à l'emploi.
- [Le son](../plugins/audio.md) : toutes les fonctions de `zinc:audio`.
- Les exemples de Zinc Atelier (*Fichier > Exemples…*) et `zinc new game-2d`, un petit jeu complet à lire et à modifier ;
  `zinc new stage` et `zinc new canvas` démarrent un projet dans le style de la partie 3 ou de la partie 4.
