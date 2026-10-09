# Zinc : plugins GPU WebGL et audio pour jeux et création interactive

Date : 2026-09-29. Statut : **recherche et proposition, aucune implémentation dans cette note**.
Public : conception du runtime, des plugins et du compilateur Zinc.

Suite : [démo GPU, matrice de compatibilité, PS1/PS2, mapping global et Studio](creative-studio-compatibility-demo-2026-09-29.md). Cette étude complémentaire distingue les capacités actuelles des backends proposés et décrit les critères de validation sur matériel.

## Intention produit confirmée

Zinc doit permettre des jeux 2D/3D, du creative coding, des expériences interactives, des installations et des outils de création. Il reste également utilisable pour des CLI et services sans interface.

Les exigences exprimées sont :

- Une vraie 3D GPU, des shaders programmables et une API suivant la spécification WebGL, permettant notamment l'écosystème Three.js.
- Un vrai moteur audio : traitement temps réel, routage et DSP, avec JUCE comme référence fonctionnelle ; pas seulement des appels de lecture sans moteur derrière.
- Des fonctionnalités **en plugins**, absentes des applications qui ne les utilisent pas. GPU, audio et layout ne deviennent pas des dépendances obligatoires du core.
- Des capacités adaptées à la cible. L'absence de GPU ou d'audio doit rester un cas normal et explicite.

**Clarification utilisateur : JUCE est une référence fonctionnelle et architecturale, pas une bibliothèque à intégrer. Le moteur audio appartient aux plugins Zinc.** Les autres bibliothèques mentionnées sont des pistes à valider. L'hébergement de VST/AU et la production de plugins pour DAW sont des possibilités distinctes à préciser ; ils ne sont pas implicitement requis par « comme JUCE ».

## 1. État constaté dans le dépôt

| Élément | Ce qui existe | Écart avec l'objectif |
|---|---|---|
| [Plugins](../plugins.md), [résolution](../../compiler/src/plugins.ts) | Modules importables, sources natives, options/cibles et pilotes display optionnels | Pas de contrat WebGL ni de moteur audio commun |
| [display-gl](../../plugins/display-gl/src/display_gl.cpp) | Contexte GL, compilation de shaders internes, composition et chemin GPU des commandes 2D via `gl_renderer.cpp` | Pas un `WebGL2RenderingContext` ; les préambules GLSL internes ne valident pas la spec WebGL |
| [3D](../plugins/3d.md) | Rasterisation logicielle de scènes dans une image runtime | Pas une exécution GPU des shaders utilisateur |
| [three](../../plugins/three/plugin.json) | Sous-ensemble de l'API Three réécrit en Zinc au-dessus de la 3D logicielle | Ce n'est pas l'exécution du paquet Three.js amont |
| [Audio pinball](../../examples/pinball/src/audio/sound.ts) | Points d'intégration et recettes de sons | Pas de sortie audio implémentée derrière ces points |
| [ABI native](../../runtime/include/zinc_abi.h) | Handles opaques, scalaires, snapshots d'octets/tableaux numériques, callbacks | Les snapshots sont copiés ; pas encore de contrat général de buffers mutables partagés et de complétion asynchrone |
| [Moteurs](../engines.md) | Natif, Zinc VM/JIT, QuickJS avec intégration native partielle | La présence de QuickJS ne garantit pas le chargement direct de bibliothèques npm arbitraires |

La [note GPU 2D antérieure](gpu-renderer-design.md) traite l'accélération du rendu Zinc, pas WebGL/Three complet. Son état initial décrit certains travaux désormais visibles dans le code : prendre le code comme référence pour l'existant, et cette nouvelle note comme extension du périmètre recherché.

## 2. GPU : deux niveaux explicites, WebGL 1 et WebGL 2

Le `WebGLRenderer` actuel de Three.js requiert WebGL 2 ; WebGL 1 n'est plus pris en charge depuis r163. Un backend GLES2 ne suffit donc pas pour cet objectif. [Documentation Three.js](https://threejs.org/docs/pages/WebGLRenderer.html).

WebGL 2 s'appuie sur OpenGL ES 3.0 mais impose ses propres règles. Fournir les fonctions `gl*` ne constitue pas à lui seul une implémentation WebGL. Il faut traiter validation, erreurs, état des objets, limites et extensions, formats et transferts de données ainsi que comportement des shaders. [Spécification WebGL 2](https://registry.khronos.org/webgl/specs/latest/2.0/).

La gestion du contexte, de sa perte/restauration, de l'initialisation des ressources et de la présentation du drawing buffer fait aussi partie du contrat. Une façade native devra préciser ce qu'elle fournit à la place du canvas et des événements du navigateur. Les règles de provenance des images et d'accès aux données ne doivent pas disparaître dans une façade destinée à exécuter du contenu web. [Spécification WebGL 1, fondation de WebGL 2](https://registry.khronos.org/webgl/specs/latest/1.0/).

Les liens `latest` consultés sont des drafts évolutifs. Avant implémentation : fixer les révisions de spécification, des tests et des bibliothèques ; publier une matrice de conformité. Un triangle ou une scène Three réussis sont des jalons, jamais une preuve de conformité générale. [Tests Khronos](https://github.com/KhronosGroup/WebGL/tree/main/sdk/tests).

### Candidats pour le backend

| Option | Apport | Limite / conclusion proposée |
|---|---|---|
| **ANGLE + façade WebGL Zinc** | Implémentation GLES/EGL et traduction vers plusieurs API GPU | Candidat sur matériel compatible ; la façade WebGL et l'environnement JS restent à fournir |
| **GLES3/EGL système + façade WebGL** | Réutilisation des pilotes sur certaines cibles Linux | À comparer à ANGLE sur matériel réel ; charge supplémentaire de validation et gestion des différences pilotes |
| **WebGL 2 du navigateur** | Contrat WebGL fourni par le navigateur pour la cible web | Choix naturel dans le navigateur ; pas besoin d'y embarquer ANGLE |
| **wgpu / WebGPU** | API GPU moderne multi-backend | Autre contrat : ne rend pas directement compatibles les applications WebGL et leurs shaders |
| **Webview** | Délégation du JS, DOM et WebGL à un moteur web | Chemin possible pour contenu web complet, à valider sur chaque hôte ; reste un plugin avec son coût propre |

La matrice ANGLE annonce notamment GLES 3.0 sur Metal, Vulkan et GL ; Metal est disponible sur macOS. C'est une base pertinente pour éviter d'écrire nous-mêmes les traductions de shaders et les backends GPU. Cela ne certifie ni la façade Zinc ni tous les appareils. Le README contient aussi un paragraphe historique moins à jour que ses tableaux : vérifier la révision effectivement retenue. [ANGLE](https://github.com/google/angle).

wgpu expose un modèle fondé sur WebGPU et peut lui-même utiliser WebGL2 comme backend sur le web : **cette direction n'est pas une implémentation de WebGL au-dessus de wgpu**. Ne pas engager une couche de traduction supplémentaire pour satisfaire le besoin WebGL initial. [wgpu](https://github.com/gfx-rs/wgpu).

### Pi 1 / Pi 2 : GPU réel, mais pas WebGL 2 complet

Les Pi 1/2 utilisent VideoCore IV. Mesa documente VC4 pour les Pi 0 à 3 avec GLES 2.0 et OpenGL 2.1, pas GLES 3.0. Le Pi 2 conserve ce GPU malgré son CPU plus puissant. [Mesa VC4](https://docs.mesa3d.org/drivers/vc4.html), [fiche officielle Pi 2](https://www.raspberrypi.com/products/raspberry-pi-2-model-b/).

**ANGLE n'est pas une mise à niveau matérielle.** Sa prise en charge GLES3 sur certains backends ne signifie pas qu'il sait fournir WebGL2 complet et accéléré sur VC4. Ne pas retenir ce chemin pour Pi 1/2. Une émulation de fonctions particulières ne donne pas automatiquement toute la spec ; un backend logiciel éventuel serait une autre capacité, avec compatibilité ARM et performances à mesurer, pas le chemin de jeu GPU promis.

Proposition pour les petites cibles VC4 : **façade WebGL 1 → GLES2/EGL système → GPU**, sans imposer ANGLE. Elle exige toujours validation WebGL et tests ; un accès GLES2 brut n'est pas WebGL conforme. Cela permet shaders vertex/fragment GLSL ES 1.00, géométrie texturée et effets compatibles avec ce niveau. Extensions, précision, formats et limites doivent être interrogés, pas supposés.

Pour Three.js : le renderer actuel exige WebGL2. Sur VC4, soit choisir et maintenir une version antérieure à r163 après validation, soit utiliser un renderer 3D Zinc visant GLES2 ; aucune de ces options n'est la compatibilité avec tout le Three.js actuel. Les scènes partagées doivent rester dans le niveau commun ou fournir des matériaux/effets adaptés.

Pi 4/5 relèvent du pilote de rendu V3D et constituent une autre classe de matériel : tester leur contexte et leur pile effective avant d'annoncer le profil WebGL2. Le pilote noyau nommé VC4 peut également assurer l'affichage sur ces cartes ; son nom seul n'identifie donc pas les capacités de rendu. [Mesa V3D](https://docs.mesa3d.org/drivers/v3d.html).

Deux contrats distincts sont proposés : `webgl1` pour GLES2 et `webgl2` pour GLES3 ou backend équivalent. Un programme qui exige le second doit échouer clairement sur une cible du premier, sauf variante explicitement fournie. Ne pas dégrader silencieusement un shader WebGL2 en GLSL ES 1.00.

### Proposition : profil créatif light

Un profil **light** est une cible de conception utile pour les Pi 1/2 et autres appareils contraints. Il conserve le GPU et les shaders ; il réduit les exigences et budgets. Ce profil n'est pas encore une option CLI ou `zinc.json` implémentée.

| Domaine | Light | Standard |
|---|---|---|
| Contrat graphique | WebGL1 / GLES2, GLSL ES 1.00 | WebGL2 / GLES3 ou backend équivalent, GLSL ES 3.00 |
| Backend VC4 / desktop | GLES2/EGL direct sur VC4 | ANGLE ou GLES3 selon matériel |
| 2D | Sprites, atlas, formes, batching CPU des géométries | Même base, instancing si disponible et fonctionnalités GPU supplémentaires |
| 3D | Géométries texturées, caméra, profondeur, éclairage simple ou précalculé | Matériaux et effets avancés selon budgets |
| Effets | Shaders compatibles GLES2, résolution et passes limitées | Passes supplémentaires selon capacités et coût mesuré |
| Three.js | Version WebGL1 figée et testée, ou renderer Zinc adapté | Three.js amont WebGL2, intégration host à valider |
| Audio, si importé | Voix/bus/DSP et mémoire bornés, même architecture temps réel | Budgets plus élevés ; fonctions supplémentaires déclarées |
| UI, si importée | Layout minimal ou placement explicite | Moteur de layout choisi séparément |

Les exemples de matériaux sont des choix de budget, pas des interdictions arbitraires de GLES2 : un effet reste possible s'il utilise les fonctions présentes et tient dans le budget. Interroger les extensions avant d'activer instancing, index 32 bits ou formats particuliers ; aucune extension n'est obligatoire dans le minimum light. Fractionner les meshes pour des indices 16 bits quand nécessaire.

Trois réglages restent distincts :

1. **Capacités** : contrat WebGL1 ou WebGL2, formats, extensions et limites réellement disponibles.
2. **Qualité** : résolution de rendu, tailles de textures, nombre de particules, lumières et passes. Ces valeurs peuvent varier sur une même API.
3. **Modules** : GPU, audio et UI restent indépendamment optionnels. Light n'importe aucun module à lui seul.

Un preset light peut proposer une résolution interne basse et des ressources compactes ; les valeurs exactes restent à mesurer sur Pi 1/2. Réduire seulement la résolution d'un shader WebGL2 ne le rend pas compatible WebGL1. Ne pas réécrire automatiquement des shaders arbitraires : sélectionner une variante déclarée ou signaler l'incompatibilité.

L'objectif portable est de partager règles, entrées, scènes et assets compatibles, avec variantes explicites de matériaux/effets quand nécessaire. Le mode light doit pouvoir être forcé sur desktop pour développer et tester ce contrat. Ce test vérifie les fonctionnalités ; il ne reproduit pas la vitesse, la mémoire disponible ou toutes les particularités du GPU Pi.

Validation ajoutée : même petite scène interactive sur desktop en light et Pi réel, shader personnalisé GLSL ES 1.00, textures, profondeur, sprites superposés ; mesure CPU/GPU/mémoire et vérification d'absence d'underruns audio avec un budget de voix fixé. Tester aussi le refus clair d'un programme exigeant WebGL2.

### Shaders et Three.js : deux validations différentes

Pour les shaders : viser GLSL ES 3.00 avec WebGL 2 et définir séparément la prise en charge WebGL 1/GLSL ES 1.00. Conserver les sources, les erreurs de compilation/link et la détection réelle des extensions. Ne pas remplacer la validation par quelques substitutions de chaînes comme les préambules du display actuel.

Pour Three.js amont, il faut aussi un environnement d'exécution : modules JS, objets/typed arrays, canvas ou équivalent, événements de contexte et ordonnanceur d'animation. Les loaders et contrôles peuvent demander d'autres services, notamment chargement et décodage d'images. Le renderer accepte un canvas/contexte fournis ; cela réduit l'adaptation mais ne supprime pas ses attentes. [Source WebGLRenderer](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js), [ImageLoader](https://github.com/mrdoob/three.js/blob/dev/src/loaders/ImageLoader.js).

**Proposition : tester le vrai paquet Three.js, version figée**, dans une intégration JS explicitement définie, plutôt que continuer à étendre un faux équivalent sous le même nom. QuickJS est un candidat pour cette expérimentation ; le pipeline Zinc actuel ne prouve pas encore cette compatibilité. Conserver le plugin Three existant comme chemin logiciel explicitement identifié pendant la transition.

Les programmes Zinc compilés pourront appeler le plugin GPU directement. La compilation native sans modification de toute bibliothèque JS amont est un chantier de langage distinct ; elle ne doit pas devenir une promesse implicite de la couche GPU. WebXR, les addons DOM et un renderer WebGPU demanderaient également leurs propres capacités.

## 3. Organisation des plugins et composition 2D/3D

Noms de travail, **pas de nouveaux imports déjà disponibles** :

| Composant proposé | Responsabilité |
|---|---|
| `webgl` | API WebGL, validation, ressources, shaders, binding des moteurs d'exécution |
| Backend ANGLE / GLES / navigateur | Exécution GPU et création des contextes selon la cible |
| Adaptateur Three amont | Environnement nécessaire au paquet et compatibilité des exemples sélectionnés |
| `audio` | API audio, horloge d'échantillons, paramètres et événements |
| Moteur audio Zinc + backend de périphériques | Graphe et DSP du plugin ; accès système direct ou bibliothèque adaptée comme miniaudio |
| UI/layout | Option indépendante, utilisée seulement pour les interfaces qui en ont besoin |

Un seul backend GPU et un seul backend audio sont sélectionnés par application/cible dans une première version. Utiliser la découverte et le système de build des plugins existants ; éviter un nouveau gestionnaire de plugins. Les dépendances entre plugins et l'intégration des builds tiers restent à définir : les champs actuels de `plugin.json` ne prouvent pas à eux seuls que les builds des bibliothèques GPU/audio peuvent être intégrés tels quels.

Le core ne doit inclure ni en-têtes des bibliothèques GPU/audio, ni graphe audio, ni scène Three. JUCE ne fait pas partie des dépendances proposées. Des points d'intégration génériques peuvent être nécessaires pour la surface, le cycle de vie et les buffers, sans dépendance transitive vers ces bibliothèques. Dans Zinc, « plugin » peut signifier module lié à la compilation seulement si utilisé, pas nécessairement bibliothèque chargée dynamiquement.

Pour mélanger jeu 3D, sprites 2D et UI : garder les images sur le GPU. Définir la propriété du contexte, l'ordre des passes, la synchronisation, le format/couleur/alpha et la durée de vie des textures. Le chemin normal ne doit pas faire `GPU → readPixels → image CPU → upload GPU` chaque frame. Les captures peuvent payer ce transfert explicitement.

Le pilote de présentation et le plugin WebGL devront partager une stratégie de contexte/backend. Une texture d'un contexte ANGLE/Metal n'est pas automatiquement utilisable dans le contexte OpenGL historique de `display-gl`. Première expérience : une surface contrôlée par le backend choisi, une scène WebGL puis un overlay 2D sur ce même chemin ; pas une promesse immédiate d'interop entre tous les backends.

La 2D interactive utilise les mêmes ressources GPU : quads, atlas de sprites, instancing et effets de fragment. Flexbox ne positionne pas les entités du jeu ; il peut organiser les menus et outils. Le chemin logiciel demeure une capacité distincte, pas une émulation déclarée compatible avec tous les shaders WebGL.

## 4. Audio : un moteur indépendant du framerate

Contrat fonctionnel recherché pour Zinc :

- Entrée/sortie périphérique, format négocié et changements de périphérique.
- Voix, samples et streaming, bus, mixage, effets, spatialisation selon le backend.
- DSP et événements programmés sur une horloge d'échantillons ; paramètres lissés.
- Capture et analyse pour des visuels réactifs ; MIDI pour les usages musicaux.
- Rendu hors ligne et fonctionnement sans fenêtre.
- Mesures de charge, latence, underruns, mémoire et nombre de voix.

Ce contrat est une proposition de périmètre à livrer par étapes. Ce n'est pas l'affirmation que chaque backend fournit déjà chaque fonction.

### Moteur Zinc, JUCE comme référence uniquement

Le plugin audio Zinc possède son contrat, ses voix/bus, son ordonnanceur et ses capacités DSP. On peut réutiliser des briques existantes pour les périphériques, codecs, resampling ou graphe si leur comportement convient, sans reconstruire tout le bas niveau ni importer JUCE.

| Piste | Rôle | Position proposée |
|---|---|---|
| **Architecture JUCE** | Référence pour les périphériques, le MIDI, les processeurs et le graphe | Étudier les concepts, sans intégrer ni copier le code JUCE |
| **miniaudio** | Périphériques, mixage, graphe, décodage, resampling et spatialisation | Candidat de mise en œuvre sous l'API audio Zinc ; sélectionner les briques réellement utiles |
| **API système / matériel** | Backend spécialisé si nécessaire | CoreAudio, ALSA ou sortie embarquée selon cible ; éviter de multiplier les backends avant besoin mesuré |
| **Web Audio + AudioWorklet/Wasm** | Traitement dans le navigateur | Backend web distinct à qualifier |

JUCE fournit des exemples de séparation [périphériques/MIDI](https://github.com/juce-framework/JUCE/blob/master/modules/juce_audio_devices/juce_audio_devices.h), [DSP](https://github.com/juce-framework/JUCE/blob/master/modules/juce_dsp/juce_dsp.h) et [graphe de processeurs](https://docs.juce.com/master/classjuce_1_1AudioProcessorGraph.html). Ces liens documentent la référence fonctionnelle, pas un choix de dépendance.

miniaudio possède déjà un moteur et un graphe, au-delà d'une simple sortie PCM. Il prend en charge notamment Raspberry Pi et Emscripten et permet des backends personnalisés. Les besoins musicaux avancés restent à qualifier : sa présence ne donne pas automatiquement l'équivalent de tout JUCE. [Projet](https://github.com/mackron/miniaudio), [manuel](https://miniaud.io/docs/manual/index.html).

Sur le web, Emscripten documente un chemin AudioWorklet pour traiter l'audio en Wasm. Prévoir un prototype qui précise notamment l'activation utilisateur et les conditions de partage mémoire. [Wasm Audio Worklets](https://emscripten.org/docs/api_reference/wasm_audio_worklets.html).

### Frontière temps réel

JUCE appelle le traitement sur le thread audio dédié du périphérique. [AudioIODeviceCallback](https://docs.juce.com/master/classjuce_1_1AudioIODeviceCallback.html).

Architecture proposée : le code Zinc pilote l'audio depuis le thread applicatif ; des commandes horodatées rejoignent le moteur natif par une file bornée. Le callback audio traite des blocs préalloués et ne dépend pas de `onFrame`.

- Aucun appel de VM/QuickJS, accès disque, compilation, journalisation ou allocation non bornée dans le callback.
- DSP natif préparé à l'avance ; du DSP écrit en Zinc ne devient admissible qu'après définition et validation d'un sous-ensemble temps réel.
- Préparer les modifications de graphe hors callback, puis appliquer un échange sûr à une frontière de bloc ; libérer les anciennes ressources hors thread audio.
- Définir le comportement de file pleine : signaler les pertes et préserver les événements critiques, notamment les fins de notes ; aucun blocage du thread audio.
- Reporter les erreurs, mesures et analyses vers l'application par snapshots bornés. L'audio reste stable même si une frame graphique prend 100 ms.

Ces contraintes sont particulièrement importantes ici : l'ABI actuelle autorise les callbacks seulement sur le thread propriétaire du moteur. Ses buffers par copie peuvent servir aux chargements ponctuels, mais ne constituent pas une interface de callback audio temps réel.

La synchronisation audiovisuelle associera le compteur d'échantillons à l'horloge monotone ; les visuels liront cet état. Un accumulateur de `dt` graphique ne doit pas servir d'horloge musicale.

## 5. Cibles, capacités et packaging

| Cible / usage | GPU proposé | Audio proposé | Politique |
|---|---|---|---|
| macOS | ANGLE/Metal à prototyper | Plugin audio Zinc, sortie CoreAudio | Première cible de validation locale |
| Linux desktop | ANGLE/Vulkan ou GL ; GLES3 selon environnement | Plugin audio Zinc, backend système disponible | Valider pilotes, surface et périphériques réels |
| Pi 1 / Pi 2 / Pi 3 (VC4) | GLES2/EGL direct, façade WebGL1 à valider | Plugin audio Zinc, budget voix/DSP réduit à mesurer | Pas de WebGL2 accéléré annoncé ; pas de Three actuel |
| Pi 4 / Pi 5 (V3D) | Profil WebGL2 à qualifier sur la pile réelle | Plugin audio Zinc, backend Linux | Détection des versions/extensions ; le profil `rpi1` ne suffit pas |
| Navigateur | WebGL2 natif navigateur | Web Audio / AudioWorklet | Bibliothèques JS amont possibles selon intégration ; aucun backend natif implicite |
| ESP32, consoles historiques | Aucun WebGL2 présumé | Backend matériel spécifique éventuel | Graphisme logiciel/limité explicitement séparé |
| CLI/service sans média | Aucun | Aucun | Aucun SDK GPU/audio lié |
| Service de rendu/audio sans fenêtre | Contexte GPU hors écran si requis | Offline ou périphérique audio | « Headless » ne signifie pas nécessairement sans GPU/audio |

Windows, iOS et Android sont des possibilités des bibliothèques candidates, pas des ports Zinc annoncés par cette recherche.

Déclarer les exigences de build puis détecter au démarrage les capacités du matériel : WebGL2, extensions, limites textures, entrée audio, canaux, fréquence, taille de bloc. Refuser clairement une capacité obligatoire absente. Un fallback logiciel n'est acceptable que si l'application le demande et que son contrat est respecté.

Les versions et options de compilation seront figées dans le packaging du plugin. ANGLE emploie une licence de type BSD à trois clauses, avec dépendances à inventorier  ; miniaudio propose domaine public ou MIT No Attribution. Le choix de backend implique donc aussi un choix de distribution. Ne pas considérer l'isolation en plugin comme une exemption de licence. [ANGLE LICENSE](https://github.com/google/angle/blob/main/LICENSE), [miniaudio](https://github.com/mackron/miniaudio#license).

## 6. Expériences et critères de décision

Aucun chiffre de performance, taille binaire ou latence des solutions candidates n'a été mesuré pendant cette recherche.

1. **GPU natif minimal sur deux classes de cibles** : ANGLE/GLES3 sur macOS et GLES2/EGL direct sur Pi 1/2, shaders et rendu dans une surface. Mesurer aussi le build ARMv6/ARMv7, les limites GPU et les extensions sur les cartes réelles. Relever temps de build, dépendances exportées, taille ajoutée, mémoire, temps CPU/GPU. Ce jalon ne s'appelle pas « WebGL conforme ».
2. **Contrat WebGL** : inventaire API/IDL et tests Khronos figés, validation des mauvais arguments, offsets de typed arrays, ressources libérées, framebuffer/texture et perte de contexte. Distinguer tests passés, échecs, tests non exécutés et éventuels tests adaptés au host.
3. **Three.js réel** : version amont figée ; géométrie texturée, shader personnalisé, instancing, glTF, ombres et post-traitement. Documenter les adaptations de host et les addons non couverts. Exécuter le même contenu dans un navigateur de référence.
4. **Composition** : scène GPU + sprites + panneau Zinc, redimensionnement/HiDPI, clipping et ordre des passes. Vérifier l'absence de readback dans le chemin normal et la libération des ressources après fermeture/rechargement.
5. **Audio Zinc** : prototyper le plugin sans JUCE, en évaluant les briques miniaudio sur lecture/mixage, synthèse et filtre, entrée live, automatisation et rendu offline. Mesurer latence réelle par boucle audio, et non seulement durée théorique du buffer ; tester changements de périphérique/fréquence et blocs variables.
6. **Interaction audiovisuelle** : entrée MIDI/OSC/pointeur → événement sonore horodaté + effet GPU. Charger le rendu volontairement et vérifier que l'audio ne décroche pas ; mesurer dérive et latence.
7. **Indépendance** : construire une CLI, un service audio sans fenêtre et une app GPU sans audio. Inspecter leurs dépendances : les bibliothèques GPU/audio, UI et Flex ne doivent apparaître que là où elles sont utilisées ; JUCE doit rester absent de tous les builds.
8. **Parité des moteurs** : mêmes tests de ressources et de transferts sur natif, VM, JIT et QuickJS lorsque leurs adapters sont disponibles. Un succès dans un moteur ne vaut pas support des autres.

Pour comparer les backends GPU : fixer scène, nombre d'objets, résolution physique, AA, shaders et période de chauffe ; relever médiane/p95/p99, temps de simulation, soumission, GPU, présentation, draw calls et transferts. Les captures de bouncing-ball sont un point de départ, pas un benchmark de WebGL ni du layout.

Pour l'audio : définir une fréquence, une taille de bloc, un graphe et un nombre de voix identiques ; compter underruns, événements perdus et pics de traitement. Le budget d'un bloc de 128 échantillons à 48 kHz est environ 2,67 ms, mais ce n'est pas la latence aller-retour du système.

## 7. Recommandation issue de la recherche

**Premier axe : plugin GPU à deux niveaux, WebGL1/GLES2 direct sur VC4 et WebGL2 sur matériel compatible, avec ANGLE comme candidat desktop et WebGL navigateur côté web.** Valider très tôt le vrai Three.js et l'environnement JS nécessaire, pour éviter de confondre une démo GPU avec l'objectif de compatibilité.

**Deuxième axe : plugin audio Zinc indépendant, sans JUCE.** Reprendre les exigences d'un moteur audio temps réel et évaluer miniaudio comme ensemble de briques réutilisables. Le graphe, le DSP et les budgets sont adaptés à la cible ; les petites cartes ne sont pas tenues de fournir toutes les fonctions d'un poste de création audio.

**Le core reste un runtime généraliste.** Les seuls ajustements possibles concernent des contrats génériques nécessaires aux plugins : cycle de vie, buffers, ressources, surface et réveil d'événements. Pas de dépendance obligatoire à un moteur UI, GPU ou audio.

Questions à trancher après les premiers prototypes : version Three de référence, périmètre des addons, besoin de DSP utilisateur, MIDI et hébergement de plugins audio, cibles matérielles prioritaires, bibliothèques audio réutilisables et budget par cible. Ces questions n'empêchent pas la recherche ni les preuves techniques minimales.
