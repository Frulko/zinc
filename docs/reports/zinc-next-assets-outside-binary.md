# Assets du musée : stockage, distribution et RAM

Rapport du 12 octobre 2026. Inventaire du `.app` produit et bilan des tests de ZN-721 / ZN-722.
Ce document décrit le problème et la disposition recommandée. L’externalisation et le déchargement n’ont pas encore été implémentés.

## Conclusion

Pour les applications desktop et les démos riches, les contenus doivent être **hors de l’exécutable**, dans des fichiers ou des packs livrés avec l’application. Sur macOS, ils peuvent rester dans `Museum Table.app/Contents/Resources` : l’utilisateur reçoit toujours un seul `.app` autonome.

Les images haute résolution, panoramas, textures de modèles et collections de glyphes ne doivent pas être incorporés systématiquement sous forme décompressée dans le code généré. Les médias audio/vidéo, modèles, descriptions du projet et sous-titres sont déjà des fichiers séparés dans le bundle du musée.

Deux corrections distinctes sont nécessaires : choisir une seule représentation distribuée de chaque contenu, puis charger et libérer ses ressources selon la vue qui les utilise. Déplacer un fichier seul ne garantit pas une baisse de RAM.

## Ce que contient actuellement le build

Les Mo ci-dessous sont décimaux, soit 1 000 000 octets. La RAM du processus est exprimée en MiB, soit 1 048 576 octets.

| Élément mesuré | Taille | Interprétation |
|---|---:|---|
| Exécutable du `.app` distribué | 93,67 Mo | Code natif et données embarquées |
| Bloc de ressources embarquées `ZRS1` | 87,35 Mo | Images RGBA, glyphes, sous-ensembles TTF et métadonnées |
| 15 images déjà décompressées | 75,60 Mo | Principale composante du binaire |
| Tables et bitmaps de 58 variantes de fontes | 11,69 Mo | Familles `sans`, `sans-bold`, `grid`, différentes tailles |
| 3 sous-ensembles TTF embarqués | 0,068 Mo | Inclus dans le bloc de ressources, pas à additionner une deuxième fois |
| Tous les fichiers source dans `assets/` | 9,16 Mo | Dont seulement 5,71 Mo pour les 15 JPEG |
| Sortie des importeurs du pack de développement | 79,05 Mo | Avant compression et structure du pack ; les JPEG deviennent du RGBA |
| Bibliothèques livrées dans `Frameworks` | 34,65 Mo | 15 dylibs nécessaires à la distribution ; ce ne sont pas des assets |
| Ensemble du `.app` préparé | 137,51 Mo | Exécutable, fichiers source, bibliothèques et métadonnées |
| Archive ZIP du `.app` | 66,82 Mo | Taille de téléchargement, distincte de la taille installée |

Le `.app` copie les fichiers source dans `Contents/Resources/assets`. Il contient donc les JPEG compressés **et** leur représentation RGBA incorporée au binaire. Le dossier de packs d’un lancement de développement peut encore fournir une représentation RGBA supplémentaire. Le `.app` distribué mesuré ne contient pas ce pack de développement.

Le chiffre de 77 Mo observé dans un dossier ne doit pas être assimilé à la taille des sources : l’inventaire actuel donne 9,16 Mo de sources et 79,05 Mo de données transformées pour le développement. Nous n’avons pas identifié exactement le dossier et la révision auxquels correspondait ce chiffre de 77 Mo.

## Quels assets externaliser ou conserver à l’extérieur

| Contenu du musée | Fichiers source | Placement recommandé | Situation actuelle |
|---|---:|---|---|
| `photos/*.jpg` | 12 fichiers, 4,02 Mo | Fichiers compressés ou pack, chargés par scène | Sources dans le bundle, RGBA aussi embarqué |
| `panoramas/ninomaru.jpg` | 1,03 Mo | Ressource de la vue panorama | Source séparée, 8,39 Mo de RGBA embarqué |
| `models/vase.jpg` | 0,58 Mo | Texture séparée, format adapté au renderer | Source séparée, 9,44 Mo de RGBA embarqué |
| `video/great-wave.jpg` | 0,073 Mo | Poster séparé, chargé avec la vidéo | Source séparée, 1,64 Mo de RGBA embarqué |
| `models/vase.obj` | 1,03 Mo | Modèle externe ; éventuellement représentation importée adaptée à la cible | Déjà séparé ; cette démo lit et parse l’OBJ |
| `video/great-wave.mp4` | 0,35 Mo | Fichier lisible par le décodeur, lecture progressive | Déjà séparé ; le code du musée le recopie actuellement dans un fichier temporaire |
| `audio/**/*.mp3` | 36 fichiers, 2,02 Mo | Fichiers externes, ouverts pour le média utilisé | Déjà séparés |
| `audio/**/*.vtt`, `video/*.vtt` | 38 fichiers, 0,010 Mo | Petites données externes, liées au média et à la langue | Déjà séparés |
| `project.json` | 0,046 Mo | Description externe du contenu | Déjà séparé |
| Fontes du moteur et glyphes calculés | 11,69 Mo de données rasterisées dans le binaire | Fontes/sous-ensembles dans un pack commun, glyphes utiles en cache borné | Collection de glyphes incorporée puis copiée au démarrage |

L’exécutable conserve le moteur, le code compilé, les shaders et les petites constantes nécessaires. Un minimum de ressources de démarrage peut rester embarqué si l’écran d’attente ou une erreur doivent s’afficher avant le montage des packs. Les profils matériels qui exigent une image firmware autonome peuvent conserver une stratégie d’embarquement adaptée ; ce rapport ne propose pas de leur imposer un filesystem desktop.

### Les images réellement présentes dans le binaire

Inventaire obtenu en lisant le bloc `ZRS1` de l’exécutable, pas par estimation à partir de l’extension du fichier.

| Image | Dimensions | RGBA embarqué |
|---|---|---:|
| `models/vase.jpg` | 1536 × 1536 | 9,44 Mo |
| `panoramas/ninomaru.jpg` | 2048 × 1024 | 8,39 Mo |
| `photos/water-lily-pond.jpg` | 1280 × 1138 | 5,83 Mo |
| `photos/irises.jpg` | 1280 × 1015 | 5,20 Mo |
| `photos/divan-japonais.jpg` | 968 × 1280 | 4,96 Mo |
| `photos/sudden-shower.jpg` | 895 × 1280 | 4,58 Mo |
| `photos/ejiri.jpg` | 1280 × 893 | 4,57 Mo |
| `photos/red-fuji.jpg` | 1280 × 882 | 4,52 Mo |
| `photos/the-letter.jpg` | 882 × 1280 | 4,52 Mo |
| `photos/plum-garden.jpg` | 869 × 1280 | 4,45 Mo |
| `photos/great-wave.jpg` | 1280 × 860 | 4,40 Mo |
| `photos/three-beauties.jpg` | 856 × 1280 | 4,38 Mo |
| `photos/nocturne.jpg` | 1280 × 854 | 4,37 Mo |
| `photos/kanbara-snow.jpg` | 1280 × 851 | 4,36 Mo |
| `video/great-wave.jpg` | 854 × 480 | 1,64 Mo |

Le RGBA fait quatre octets par pixel. Il est normal qu’il prenne plus de place qu’un JPEG ; le problème est de le distribuer en double et de tout le charger d’avance.

## Disposition et chargement recommandés

Une distribution desktop doit avoir une seule source de contenu effectivement lue par le moteur : les fichiers compressés ou leurs packs de production. Pour un média importé, conserver une seule représentation de diffusion lorsque l’original n’est plus nécessaire. Le projet source garde naturellement ses originaux pour l’édition.

Le pipeline doit choisir les formats selon la cible : images compressées à décoder à la demande, textures GPU prises en charge, et représentation CPU lorsque le renderer logiciel en a besoin. Un pack externe contenant tout en RGBA, puis chargé intégralement au démarrage, conserverait une grande partie du problème mémoire.

Le moteur possède déjà des packs ZPK, des groupes, des handles partagés et un budget de résidence. Les règles d’import `texture` savent déjà exclure certaines images du baker historique. Le musée utilise actuellement une déclaration simple `"assets": "assets"` : cette exclusion n’a pas été appliquée à ses JPEG. Ce n’est donc pas une optimisation déjà réalisée ni un simple oubli de copie du dossier.

Il faut relier les images décodées et les textures GPU aux handles d’assets. À la sortie d’une vue, après le dernier frame du fondu, libérer ses cibles 3D, ses lecteurs vidéo et ses ressources exclusives. Les ressources communes restent partagées ; les ressources inactives n’entrent dans un cache que dans la limite d’un budget en octets. Le manifeste doit préserver les références dynamiques de `project.json` : une image qui n’apparaît pas comme chaîne littérale dans le code peut être indispensable à une autre scène.

Pour FFmpeg, fournir un chemin vers le média séparé lorsque c’est possible évite de lire puis recopier tout le fichier avant sa lecture. Les contenus distribués dans le bundle restent signés ; un éventuel contenu téléchargé ou modifiable utilise un emplacement de données/cache distinct.

## RAM : résultat des tests, sans amélioration revendiquée

Parcours natif réel, renderer GL et FFmpeg, frame Retina 3840 × 2160, trois tours accueil → modèle → vidéo → accueil. Mesures sans captures, deux secondes sur chaque vue stabilisée. La machine avait d’autres sessions actives : ces valeurs ne sont pas une référence de performance sur une machine au repos.

| Moment | RSS du processus |
|---|---:|
| Accueil initial | 347,3 MiB |
| Retour à l’accueil, premier tour | 315,0 MiB |
| Retour à l’accueil, deuxième tour | 320,9 MiB |
| Retour à l’accueil, troisième tour | 321,2 MiB |

La RSS baisse ou varie avec la résidence des pages et les réserves des allocateurs/pilotes. Cela ne signifie pas que le moteur a déchargé les médias.

Les compteurs donnent la preuve de la rétention : après chaque retour à l’accueil, **un modèle et une cible 3D restent vivants**, avec **12,96 Mo de pixels CPU et 155,52 Mo de stockage GPU demandé estimé**. La cible comprend les buffers de rendu, de lecture et le multisampling. **Un lecteur vidéo arrêté conserve 8,20 Mo de buffers et deux contextes de décodage ouverts.** Les textures d’image du renderer 2D passent de 31,26 à 47,50 Mo de stockage GPU estimé au premier parcours, puis restent stables.

Au démarrage, le moteur copie aussi 75,60 Mo d’images et 11,61 Mo de payload de fontes dans le heap. Le bloc de ressources de 87,35 Mo demeure référencé dans le binaire. Les comptes heap et sérialisés diffèrent à cause de leurs représentations et métadonnées. On ne peut pas additionner les octets mappés, les estimations GPU et la RSS pour obtenir un total fiable ; les buffers empruntés par les images ne doivent pas être comptés une seconde fois.

Sur ces trois tours, les pools natifs restent identiques et le nombre de blocs Zinc vivants à l’accueil revient à 2 638. Nous n’avons pas reproduit une montée continue de 400 à 900 Mo dans le parcours sans captures. Cela n’exclut pas un problème sur une autre vue, une durée plus longue ou un autre chemin du moteur.

Une exécution séparée avec quatre captures DevTools pleine résolution atteint **818,6 MiB de RSS**. Les captures, l’encodage et le transport ajoutent de grosses allocations temporaires. Ce résultat ne mesure pas le même travail et ne démontre pas la cause exacte des 900 Mo observés par l’utilisateur. Le sampler désactive les captures par défaut pour les comparaisons mémoire.

## Gains possibles et ordre des corrections

1. Unifier le stockage des images et sortir les contenus du binaire : supprimer le doublon historique, charger les images nécessaires à la demande, assurer la disponibilité des fontes.
2. Relier les changements de vue au déchargement réel : fermer les vidéos et détruire les cibles 3D après le fondu ; traiter aussi les textures détenues par les caches du renderer.
3. Borner les caches d’images/fontes et les buffers d’inspection ; vérifier les pics de transition et la fluidité.

L’arithmétique du build laisse environ **6,31 Mo** lorsque l’on soustrait les 87,35 Mo de ressources à l’exécutable de 93,67 Mo. C’est un ordre de grandeur du reste actuel, **pas une taille finale mesurée** : la disposition du lien, le minimum embarqué et la nouvelle distribution doivent être vérifiés après implémentation. Le contenu externe et les bibliothèques continuent naturellement à occuper de la place dans le `.app`.

Nous ne pouvons pas annoncer une économie RSS égale à 87 Mo ou 155 Mo : déplacer des fichiers, éviter des copies et libérer des objets sont des changements différents, et le pilote peut garder des réserves après destruction. Le critère de réussite sera la disparition des ressources exclusives à l’accueil, une résidence limitée aux contenus utiles, et un état stable sur des parcours répétés.

## Sources locales et portée

- [Détail des mesures et tests de contrôle](zinc-next-museum-memory-probe.md) ; relevé local `.logs/museum-probe/samples.jsonl`.
- Inventaire de taille local : `examples/museum-table/build/museum-table-sizes.json` et lecture du bloc `ZRS1` dans le `.app` préparé.
- [Baker et ses exclusions](../../src/res/res.h), [installation et copies au démarrage](../../src/host/resources.cpp), [copie des assets dans le bundle](../../src/tc/bundle.cpp).
- [Gestionnaire de packs/groupes/handles](../../src/host/assets_host.h), [chargement des fichiers du musée](../../examples/museum-table/src/files.ts), [vue du modèle OBJ](../../examples/museum-table/src/viewer.ts).
- [Recherche sur les cycles de vie](zinc-next-resource-lifecycle.md) pour les techniques de partage, de cache borné et de libération.

Aucun nouveau benchmark, changement de moteur ou test sur un autre appareil n’a été réalisé pour ce rapport. Les tests précédents vérifient que les fonctions de destruction d’images, de cibles/meshes logiciels et de fermeture vidéo savent libérer leurs ressources ; le parcours du musée ne les appelle pas encore à chaque départ de vue.
