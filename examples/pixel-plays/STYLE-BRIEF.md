# Brief de transmission — des petits mondes Pixel Plays dans Zinc

Ce document fixe la direction artistique et l'esprit des jeux. Il ne certifie pas la fin du portage : au moment de sa rédaction, le code natif est dans `src/native/`, mais le manifeste et les anciens README décrivent encore l'entrée JavaScript. Consulter le code et les preuves avant de reprendre une affirmation technique.

## Intention

Créer un petit lieu habité, artisanal, chaleureux, que l'on aurait envie de regarder même sans jouer. Une action principale facile à comprendre, une difficulté physique lisible et des réactions charmantes. Le décor raconte la vie du lieu : matières usées, accessoires utiles, gestes quotidiens. Le calme n'interdit pas un défi ; chaque jeu explique son objectif et montre pourquoi une action réussit ou échoue.

Référence principale : [Pixel Plays, AmirMushich](https://github.com/amirmushichge/pixel-plays/tree/0c2a70f6809478772ac0b3976496a5147e60a43e). Les cinq jeux d'origine sont les références de composition, de matière et d'échelle. Le code est MIT ; conserver `LICENSE.upstream`. Les droits de la musique sont distincts : ne pas la reprendre sans autorisation.

## Ce qui fabrique le style

- Diorama compact sur fond blanc, bords du terrain irréguliers et dissous. Caméra orthographique fixe à 30°, profondeur et occultations cohérentes.
- Image source de 360 × 280 pixels. Agrandissement entier par plus proche voisin, sans lissage. Les pixels restent nets jusque dans la présentation native.
- Formes en volumes éclairés : sphères, capsules et géométrie du moteur partagé. Détails fins intégrés à ces volumes ; silhouettes lisibles à la résolution source.
- Lumière chaude, ombres fraîches tirant vers le violet. Rampes courtes de cinq nuances, tramage Bayer discret pour les matières. Les personnages utilisent des bandes plus franches pour rester lisibles.
- Pierre crème et calcaire, bois miel et brun patiné, terre cuite fanée, verts olive, eau jade. Des surfaces calmes et des détails localisés ; éviter la saturation uniforme et le bruit partout.
- Même projection, lumière, profondeur, palette et taille de pixel pour les animaux, personnages, objets et décor.

**Retour explicite du propriétaire :** les animaux plats de type sprite ASCII/cartoon, détourés et accompagnés d'étiquettes, ont été rejetés. Un chat ou une mouette doit sembler appartenir physiquement au quai. Ne pas réintroduire ces sprites, des emojis ou des assets provenant d'un autre style. Une image générée peut servir de recherche, mais ne prouve pas le rendu du jeu exécuté.

## Un monde vivant

Superposer plusieurs rythmes : courant lent, petites vagues et sillages ; barque qui flotte avec du poids ; feuillage et fanion qui suivent le vent ; fumée clairsemée ; animaux qui agissent occasionnellement. Éviter que tout bouge en permanence ou ensemble.

Les textures du sol restent stables entre les images. Le mouvement déplace des formes et des motifs ; il ne renouvelle pas du bruit aléatoire sur toute la scène. Les vagues respectent les berges, les objets et leur profondeur. Un poisson sous l'eau ne se dessine pas au-dessus du ponton.

Chaque action reçoit une réaction : pagaie → petit sillage ; colis raté → éclaboussure et anneaux ; poisson qui mord → bouchon qui plonge ; fil tendu → canne courbée. Le jeu se comprend aussi par ces indices visuels.

La cadence actuelle vise au plus 24 poses de scène par seconde simulée ; certains petits mouvements sont volontairement plus espacés. La simulation et le dessin restent séparés. Pause doit figer le monde et le son. Ceci décrit une politique d'animation, pas une mesure de performance.

## Esprit des mécaniques et du son

Un objectif énoncé en une phrase, un geste principal, une cible identifiable avant de jouer. Présenter la règle et le retour de réussite dans la scène autant que possible. Une première tentative doit apprendre quelque chose ; un échec doit avoir une cause observable. Prévoir recommencer, pause et son coupé, ainsi que clavier et pointeur.

Les sons prolongent les matières : eau douce, bois, pagaie, petits impacts, oiseaux espacés, moulinet. Ambiance basse et respirante, effets courts et proportionnés. Éviter une nappe sonore agressive ou des bips d'interface sur chaque geste. Écouter le mélange en situation ; des échantillons générés sans erreur ne suffisent pas à valider son agrément.

## Les trois jeux originaux

| Jeu | Lieu et geste | Vie et difficulté |
|---|---|---|
| Le dernier bateau | Quai de village, maison en pierre, toit de tuiles ; lancer cinq colis dans une barque mobile avant le départ | Anticiper son déplacement ; chat, mouette, poissons, fumée, sillage et réactions aux impacts |
| Les draveurs | Rivière canadienne bordée de conifères ; diriger une barque pour éviter les rondins descendants | Rondins de tailles, branches, écorces et orientations variées ; courant lisible ; quatre saisons avec végétation, neige/glace et ambiance différentes |
| Au fil de la Dordogne | Rive accueillante, maison en pierre et joli ponton ; lancer, attendre, ferrer et gérer le fil | Pêche cosy sans compte à rebours imposé ; bouchon, canne, poissons, oiseaux, chat, fumée et eau animés |

## Fichiers à transmettre avec ce brief

Les chemins ci-dessous sont relatifs à `examples/pixel-plays/`. Transmettre le dossier entier si possible, ainsi que les instructions du dépôt Zinc.

| Fichier ou dossier | Rôle |
|---|---|
| `src/native/renderer.ts` | Référence exécutable de projection, lumière, tramage, volumes, profondeur et caches |
| `src/native/surface.ts` | Présentation native et agrandissement des pixels |
| `src/native/models/` | Animaux, eau et conifères partagés : références de cohérence des objets |
| `src/native/games/` | Les cinq jeux d'origine portés, références de composition et de règles |
| `src/native/harbor/` | Palette, décor et vie du quai |
| `src/native/river/` | Rivière, rondins et palettes des quatre saisons dans `seasons.ts` |
| `src/native/fishing/` | Maison, ponton, pêche et réactions visuelles |
| `src/native/audio.ts` | Sons et ambiances générés partagés |
| `src/native/GameScene.ts`, `game.ts`, `main.ts` | Cycle de vie, commandes et intégration des jeux |
| `LICENSE.upstream` | Attribution et licence du code source original |

À la racine de Zinc : lire `AGENTS.md`, `RULES.md`, `ARCHITECTURE.md`, `examples/GUIDELINES.md`, et les skills `.agents/skills/zinc-app/SKILL.md` et `.agents/skills/zinc-demo/SKILL.md`. Réutiliser le moteur et les modèles existants ; ne pas créer un moteur par jeu. Si Zinc refuse une construction TypeScript valide, corriger le moteur avec une reproduction et un test.

Joindre aussi des captures **du jeu exécuté** : une vue d'ensemble de référence, un détail à l'échelle native, les quatre saisons et une courte vidéo avec son. Marquer clairement les images approuvées et rejetées. La capture avec les animaux cartoon est une contre-référence, pas une cible.

## Critères de revue

1. Comparer côte à côte avec un jeu d'origine : projection, taille des pixels, densité de détail et lumière doivent appartenir à la même famille.
2. Regarder un animal et le sol autour de lui : ombre, volume et occultation doivent les relier.
3. Laisser tourner sans jouer : le lieu vit discrètement, sans scintillement de texture.
4. Jouer une réussite et un échec : comprendre les deux sans explication orale.
5. Comparer les saisons : les reconnaître aussi par les formes, la végétation et la météo, au-delà d'un changement de teinte.
6. Vérifier dans Zinc le clavier, le pointeur, la pause, la reprise, le son et les ressources. Écouter et regarder le résultat réel avant de déclarer la démo terminée.

## Message de départ à copier

> Tu reprends des jeux natifs Zinc dans l'esprit de Pixel Plays. Lis d'abord `examples/pixel-plays/STYLE-BRIEF.md`, les instructions du dépôt et les skills Zinc app/demo. Étudie le renderer et les cinq jeux de référence dans `src/native/`. Réutilise leur projection orthographique, leurs volumes éclairés, leur profondeur, leurs palettes et leurs pixels nets. Chaque nouvel objet et animal doit appartenir à ce même monde. Crée un petit lieu vivant, une règle immédiatement compréhensible et des réactions physiques charmantes. Les sprites cartoon plats et les étiquettes sur les animaux ont été explicitement rejetés. Travaille dans le rendu natif TypeScript existant, puis fournis des captures et une courte session jouée avec son ; distingue ce qui est implémenté de ce qui est réellement vérifié. Le nouveau jeu à réaliser est : [décrire le lieu, le geste principal et le défi].
