# Zinc : démo GPU, compatibilité et Studio créatif

Date : 2026-09-29. **Étude et spécification de démo ; aucune nouvelle fonction implémentée ou mesurée ici.**

Cette note complète [l'étude WebGL et audio](creative-runtime-webgl-audio-2026-09-29.md). Objectif : jeux, expériences interactives et applications créatives avec rendu GPU, plugins facultatifs et outils utilisables depuis le Studio comme depuis la CLI ou VS Code. JUCE reste une référence fonctionnelle pour l'audio, pas une dépendance proposée.

## 1. Compatibilité : distinguer l'existant et l'objectif

Les états ci-dessous viennent du code et des manifests consultés, pas d'une campagne de tests sur ces appareils. Une cible déclarée par un plugin n'est pas une certification matérielle. Le système, le pilote, le moteur JS et la version des bibliothèques font partie de la compatibilité.

| Plateforme | État Zinc observé | Chemin GPU proposé | Limites / validation nécessaire |
| --- | --- | --- | --- |
| macOS | `display-gl` et GPU 2D ; plugin Three basé sur la 3D logicielle | WebGL 2 natif via hôte WebGL + ANGLE/Metal | Intégration du contexte, shaders, ressources, ABI et Three amont à réaliser ; le GL actuel n'est pas WebGL 2 |
| Linux desktop | `display-gl` déclaré, chemin KMS/GBM/EGL/GLES2 | Backend compatible GLES3 ou ANGLE selon pilote | Le chemin KMS ne constitue pas une intégration fenêtre Wayland/X11 ; disponibilité des pilotes et droits d'accès à vérifier |
| Pi 1 / Pi 2 / Pi 3, VideoCore IV | Backend Zinc nommé `rpi1`, GLES2 ; chaque modèle reste à valider | Profil light sur EGL/GLES2, façade WebGL 1 à construire | Pas de WebGL 2 matériel promis ; budgets CPU, mémoire et bande passante ; ANGLE n'ajoute pas les capacités absentes |
| Pi 4 / Pi 5 | Ne pas déduire le support validé de la seule target `rpi1` | Candidat WebGL 2 sur pilote V3D adapté | Tester OS, version Mesa, contexte GLES3 et extensions sur chaque modèle |
| Navigateur / WASM | Cibles WASM de plusieurs plugins, Three Zinc logiciel | WebGL 2 du navigateur et Three amont | Vérifier chargement de modules, interop JS/WASM, assets, événements et intégration du runtime ; non implémenté par cette note |
| PS1 | Rasterisation Zinc CPU, puis transfert vers VRAM et affichage | Backend de primitives GPU via PSn00bSDK ; transformations CPU/GTE | Pipeline fixe, pas de shaders GLSL ; 2 MiB RAM et 1 MiB VRAM ; adapter matériaux, tri, géométrie et assets |
| PS2 | Rasterisation Zinc CPU, texture transférée puis sprite GS | Géométrie EE/VU et rasterisation GS via ps2sdk/gsKit | Pas de pipeline WebGL ; 32 MiB RAM et 4 MiB mémoire GS ; backend scène GPU à écrire et tester |
| ESP32 / appareils e-paper | Chemins logiciels spécifiques selon cible | Pas de 3D GPU présumée | UI/Canvas réduit possible ; hors profil de référence GPU |
| Windows / Android / iOS | Pas établis dans cette inspection | Candidats ultérieurs selon backend et hôte | ANGLE compatible avec une plateforme ne signifie pas que Zinc y est porté |
| Headless / CLI / service | Usage sans écran | Aucun plugin graphique obligatoire | Un rendu hors écran GPU éventuel reste une capacité distincte, dépendante du matériel |

Sources locales : [display-gl](../../plugins/display-gl/plugin.json), [3D](../../plugins/3d/plugin.json), [Three](../../plugins/three/plugin.json), [cibles PlayStation](../targets/playstation.md), [HAL PS1](../../targets/ps1/hal_ps1.cpp), [HAL PS2](../../targets/ps2/hal_ps2.cpp).

Mesa décrit VC4 comme GLES2 sur Pi 0 à 3 ; prévoir notamment des indices 16 bits et le découpage des maillages. Le pilote V3D concerne les générations suivantes. Ces capacités ne prouvent pas encore l'intégration Zinc. [Mesa VC4](https://docs.mesa3d.org/drivers/vc4.html), [Mesa V3D](https://docs.mesa3d.org/drivers/v3d.html).

### Contrats proposés par profil

Toutes les colonnes suivantes sont des **objectifs**, pas des fonctionnalités disponibles. « Light » désigne des capacités réduites ; la qualité visuelle et le nombre d'objets sont des réglages indépendants.

| Fonction | Standard WebGL 2 | Light GLES2 / WebGL 1 | PS1 adapté | PS2 adapté |
| --- | --- | --- | --- | --- |
| Three | Version amont fixée, hôte JS compatible | Adaptateur Zinc ou ancienne version fixée et entretenue | Sous-ensemble de scène et matériaux | Sous-ensemble de scène et matériaux |
| Shaders utilisateur | GLSL ES 3.00 et règles WebGL 2 | Variantes GLSL ES 1.00, limites interrogées | Pas de GLSL arbitraire | Pas de GLSL arbitraire ; VU spécifique éventuel |
| Éclairage | Matériaux éclairés, PBR et ombres selon budget | Éclairage simple, variantes explicites | Couleurs de sommets / éclairage calculé CPU-GTE | Éclairage EE/VU et matériaux GS adaptés |
| glTF animé | Squelettes, clips, morphs selon loader/extensions | Squelettes limités, morphs ou alternatives selon ressources | Conversion hors ligne ; animation réduite ou précalculée | Conversion hors ligne ; skinning EE/VU à valider |
| Particules | Sprites groupés, instancing ; simulation GPU optionnelle | Simulation CPU, géométrie groupée ; extensions facultatives | Sprites / triangles groupés, simulation CPU | Sprites / triangles GS, simulation EE/VU |
| Canvas | Sous-ensemble Zinc accéléré à étendre | Sous-ensemble déclaré | Tessellation CPU vers primitives GPU proposée | Tessellation CPU vers primitives GS proposée |
| Post-traitement / mapping global | Texture de composition puis passes GPU | Passes simples, résolution et formats limités | Hors socle initial ; étude VRAM et copie framebuffer nécessaire | Hors socle initial ; étude buffers GS et synchronisation nécessaire |

Le `WebGLRenderer` Three actuel exige WebGL 2 depuis r163. Le profil light ne peut donc pas promettre l'exécution inchangée du Three actuel. [Documentation Three](https://threejs.org/docs/pages/WebGLRenderer.html).

Pour une livraison, chaque cellule devra porter un état `non pris en charge`, `proposé`, `compilé`, `testé en émulateur` ou `testé sur matériel`, avec versions, limites numériques interrogées et date. Le Studio et la CLI doivent afficher le même diagnostic : fonctionnalité, cause, alternative disponible. Une fonctionnalité obligatoire absente bloque le lancement ; une dégradation explicitement choisie reste visible.

## 2. Démo de référence : Interactive Lab

Une seule scène interactive, avec charges activables indépendamment, permettrait de mesurer plus que le nombre de balles. Conserver bouncing-ball pour isoler la 2D ; cette nouvelle démo teste l'ensemble de la chaîne 3D.

| Élément de la scène | Interaction | Ce qu'il vérifie |
| --- | --- | --- |
| Personnage glTF skinné, plusieurs clips | Marche/course, pause, vitesse, transition et déplacement de la timeline | Chargement, interpolation, hiérarchie, skinning et coût du mélange d'animations |
| Objet glTF avec morph targets | Curseur de déformation | Poids animés, mise à jour des données et coexistence avec matériaux |
| Sol et objets métalliques / rugueux | Déplacer une lumière, régler matériau et exposition | Matériaux PBR du profil standard, espace colorimétrique, textures et éclairage |
| Une lumière directionnelle avec ombre et une lumière ponctuelle | Activer séparément ombres et lumières | Coût des passes, variantes de shaders et remplissage |
| Surface avec shader personnalisé | Déformation vertex et effet fragment pilotés au pointeur | Compilation GLSL, uniforms, temps, erreurs de compilation lisibles |
| Émetteur de particules | Maintenir une touche pour émettre ; régler durée et taille | Allocation, simulation, batching, transparence et overdraw |
| Plusieurs copies d'un objet | Augmenter par paliers, basculer instancing | Coût de soumission, draw calls, coût CPU du moteur JS |
| Canvas / UI dans la scène et HUD | Dessiner, sélectionner un objet, changer les réglages | Texture actualisée, composition 2D/3D, picking et saisie |
| Son de collision / ambiance facultatif | Position et volume liés à la scène | Moteur audio séparé et maintien du rendu pendant le traitement audio |
| Sortie déformée | Éditer les quatre coins puis un maillage | Mapping de toute la composition et correction des coordonnées d'entrée |

Les animations glTF ne sont pas présentes dans le [loader Zinc actuel](../../plugins/three/addons/GLTFLoader.ts) : il expose une liste d'animations vide et ignore notamment squelettes et morph targets. Il faut une implémentation ou l'intégration du loader amont, pas simplement ajouter un fichier GLB à une démo existante. Choisir des fixtures petites et redistribuables, avec licences consignées. [Spécification glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [assets Khronos](https://github.com/KhronosGroup/glTF-Sample-Assets), [AnimationMixer Three](https://threejs.org/docs/pages/AnimationMixer.html).

### Mesures et critères de réussite

- Afficher backend réel, appareil, pilote, moteur d'exécution, profil, résolution et capacités. Le rendu logiciel de la scène suivi d'un upload de texture ne satisfait pas le critère « 3D GPU ».
- Vérifier par capture de commandes que les maillages de scène sont rasterisés sur le GPU. L'animation, les collisions ou le skinning peuvent utiliser le CPU : les identifier séparément.
- Mesurer temps de frame médian, p95/p99, FPS, CPU simulation/animation/soumission, temps GPU quand une mesure fiable est disponible, draw calls, triangles, objets/particules réellement rendus, uploads et mémoire. Afficher « indisponible » pour les compteurs non accessibles.
- Séparer démarrage, compilation des shaders et chargement des mesures en régime stable. Fixer caméra, seed, résolution, durée et état de VSync ; consigner chauffe et throttling sur appareil.
- Augmenter une charge à la fois jusqu'au dépassement d'un budget choisi, par exemple 16,7 ms ou 33,3 ms. Rapporter la charge et le seuil soutenu, pas un « maximum universel ».
- Prévoir une passe avec toutes les entités visibles, sans suppression silencieuse ni réduction automatique de qualité. Compter les éléments rejetés et l'écrêtage des pools pour ne pas récompenser des dessins manquants.
- Distinguer simulation GPU de particules et rendu GPU de particules. Une simulation CPU avec sprites rendus en lots sur GPU est un premier jalon valable ; WebGL 2 ne fournit pas des compute shaders généraux.
- Tester ensuite le coût cumulé : animation + ombres + particules + UI + mapping, puis aperçu distant activé/désactivé.

Une variante light garde les mêmes interactions avec moins d'effets. Les variantes consoles conservent le scénario, avec assets et matériaux adaptés. Leurs résultats ne sont comparables en performance que pour les sous-tests visuellement et fonctionnellement équivalents. Une scène réussie ne remplace pas les tests de conformité WebGL.

## 3. PS1 et PS2 : adapter Three et Canvas au matériel

Réutiliser les SDK déjà employés par les targets : [PSn00bSDK](https://github.com/Lameguy64/PSn00bSDK), [ps2sdk](https://github.com/ps2dev/ps2sdk) et [gsKit](https://github.com/ps2dev/gsKit). L'étape utile est de soumettre les primitives de la scène au matériel ; aujourd'hui les HAL présentent une image rasterisée par le CPU.

Sur PS1, PSn00bSDK expose primitives GPU et opérations GTE de transformation/projection/éclairage. Un renderer adapté construirait les paquets et l'ordre de dessin, avec textures préparées et géométrie limitée. Le GPU ne fournit pas le pipeline programmable WebGL ; la perspective des textures et l'absence de depth buffer imposent des compromis visibles. Sur PS2, le partage proposé est EE/VU pour la géométrie et GS pour les pixels ; ps2sdk expose notamment les attributs STQ/RGBAQ/XYZ. Programmer un VU ne revient pas à exécuter un fragment shader GLSL. [Documentation GPU PS1](https://psx-spx.consoledev.net/ps1/gpu/), [primitives 3D ps2sdk](https://raw.githubusercontent.com/ps2dev/ps2sdk/master/ee/draw/include/draw3d.h).

Le contrat utile serait un sous-ensemble commun : nœuds, transforms, caméra, mesh, texture, matériau simple, animation et sprites. Les matériaux à shader arbitraire exigeraient une variante console écrite/préparée explicitement. Ne pas présenter ce backend comme compatible avec l'intégralité de Three ou de WebGL.

Préparer les assets sur le poste de développement : découpage de meshes, atlas/palettes, quantification, réduction du squelette et des influences, conversion de clips, textures et matériaux. Le build doit signaler extensions glTF obligatoires non gérées et dépassements de budgets. Garder sources originales et variantes générées reproductibles ; éviter de parser tout glTF et décompresser de grosses textures sur PS1.

Pour Canvas, réutiliser la géométrie CPU quand elle convient, puis envoyer triangles, sprites et glyphes au GPU. Le [Canvas Zinc actuel](../plugins/canvas2d.md) possède déjà des limites : clipping par rectangle englobant, transformations incomplètes sur texte/images, ombres ignorées et compositing réduit à source-over. Les consoles ne figurent pas dans son manifest. Une API commune ne dispense donc pas d'une table opération par opération : support exact, approximation acceptée ou erreur. Masques complexes, filtres et mélanges doivent être précalculés ou déclarés indisponibles si le backend ne peut pas les reproduire.

## 4. Mapping de toute la vue applicative

Le [mapping actuel](../plugins/mapping.md) déforme des couches image/pattern ; le [présentateur GL](../../plugins/display-gl/src/display_gl.cpp) dessine ensuite l'overlay gfx séparément. Il ne transforme donc pas automatiquement toute l'application. Son manifest déclare macOS et `rpi1`, pas Linux malgré le support Linux du display : alignement et tests nécessaires avant de l'annoncer.

Chemin proposé : **scène 3D + Canvas + UI → texture de composition applicative → warp, masques, edge blend et couleur → sortie physique**. Garder les pixels sur GPU ; pas de lecture CPU par frame pour relier 3D et mapping. Prévoir taille de rendu, gestion de profondeur/alpha, ordre des passes et espace colorimétrique explicites. Les ressources GL/ANGLE ne sont pas nécessairement partageables avec le backend GL existant : intégrer la composition dans un même contexte/backend ou valider un mécanisme d'interop, sans supposer un simple échange d'identifiants de texture.

« Toute la fenêtre » signifie ici le contenu rendu par Zinc. La barre de titre du système ou une WebView native extérieure au compositeur n'entre pas automatiquement dans cette texture. Un panneau technique de calibration peut volontairement rester hors transformation.

Les clics suivent la transformation inverse : homographie pour quatre coins, recherche du triangle et interpolation inverse pour un maillage. Définir les règles hors masque, en cas de recouvrement ou de maillage replié ; ne pas transmettre une position ambiguë sans politique. Tester le picking 3D après cette conversion. Sur plusieurs sorties, partager la composition si utile, mais mesurer chaque passe et les contraintes de synchronisation. Sur consoles, étudier d'abord les buffers et budgets : pas de promesse de mapping global gratuit.

## 5. Studio : prolonger ce qui existe, conserver la CLI

Le [Studio actuel](../studio.md) est déjà une application Zinc : graphes de comportements, inspector, scripts, assets, choix de cible, build/run via CLI, logs et aperçu distant. Il ne constitue pas encore un éditeur complet de scènes 3D, de matériaux et de timelines. Réutiliser cette base plutôt que construire un second système de projets.

L'objectif produit associe les usages Unity/Godot (scène, caméra, animation, Play), Qt (UI et déploiement embarqué) et outils créatifs (mapping, particules, contrôle en direct), selon les plugins choisis.

| Travail | Évolution proposée du Studio | Même possibilité hors Studio |
| --- | --- | --- |
| Construire l'app | Édition UI, scène, propriétés, assets ; graphes et scripts existants | Sources et assets éditables dans VS Code |
| Choisir la cible | Capacités du backend, formats et budgets ; diagnostic sur propriété ou asset incompatible | Même validation dans le build CLI |
| Simuler | Aperçu hôte, contraintes de profil et entrées simulées | Commande de lancement reproductible |
| Tester une target | Émulateur lorsqu'il existe, puis appareil réel | Même artefact et mêmes options |
| Déployer | Choix d'appareil, build, transfert, lancement et logs | Transports déjà disponibles ou adaptateurs spécifiques ; pas de SSH supposé sur console |
| Contrôler à distance | Entrées, paramètres, start/stop et aperçu autorisés sur appareil | Protocole partagé, liaison explicitement configurée |
| Déboguer | Arbre/scène, métriques, ressources, erreurs shader, événements | Inspector et outils adaptés au moteur natif/VM/JS |

L'aperçu hôte vérifie interactions et contraintes déclarées ; il ne prédit pas le FPS d'un Pi. L'émulation teste une partie du comportement cible ; la validation des pilotes, de la mémoire, de la latence et du débit doit se faire sur appareil.

Le [display distant actuel](../../plugins/display-remote/plugin.json) remplace l'afficheur. Pour examiner la vraie 3D GPU d'un appareil, prévoir une capture/transport optionnel de la sortie GPU sans substituer un autre renderer. Mesurer séparément capture, encodage et réseau. Laisser l'exécution continuer sans client Studio. Un contrôle réseau doit authentifier le client et limiter les opérations ; il reste un module de développement facultatif.

L'[inspection actuelle](../dev-mode.md) ne fournit pas automatiquement des breakpoints source universels : `Runtime.evaluate` et le débogage diffèrent selon moteur. Publier séparément inspection UI, logs, captures, profilage et débogage source. Ne pas nommer « debugger complet » une simple vue distante.

Conserver une source de vérité commune au Studio et à la CLI. Dans le projet actuel, le graphe génère du code ; cela ne permet pas de reconvertir arbitrairement tout TypeScript en graphe. Documenter les frontières entre code généré et code utilisateur, préserver ce dernier à chaque sauvegarde. Ajouter les métadonnées visuelles sans rendre le Studio nécessaire au build. Ni éditeur, ni layout, ni GPU, ni audio ne deviennent des dépendances du core headless.

## 6. Ordre de validation proposé

1. Un mesh GPU et un shader utilisateur sur desktop, avec preuve du backend et comptage des ressources ; puis une scène Three amont, versions fixées.
2. glTF animé, lumières et particules indépendamment, puis Interactive Lab complet avec mesures reproductibles.
3. Profil light sur un vrai Pi 1/2 : shaders adaptés, mêmes interactions, limites documentées ; refuser le mode standard si absent.
4. Composition applicative GPU puis mapping global et coordonnées d'entrée corrigées ; mesurer le coût et la mémoire supplémentaires.
5. Une scène minimale PS1 et PS2 par primitives matérielles, avant de porter davantage de l'API Three/Canvas. Vérifier matériel et émulateur séparément.
6. Exposer les commandes et diagnostics validés dans le Studio, puis enrichir l'édition de scènes, d'UI et d'animations au rythme des capacités réelles.

Aucun chiffre de FPS ni niveau de compatibilité complet n'est promis avant ces essais. La première implémentation utile reste une preuve GPU étroite ; cette note définit la destination et les critères, pas une obligation de construire tous les sous-systèmes simultanément.
