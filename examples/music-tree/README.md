# Musique (Arbre d'affichage AS3/Haxe + Layout Flexbox léger)

Version structurée et maintenable de l'exemple `examples/music` (télécommande murale Sonos / Spotify / Radios / StandBy / Météo / Notifications Mac), écrite **sans React ni JSX** à l'aide d'un arbre d'affichage orienté objet façon **ActionScript 3 / Haxe (`DisplayObject` / `Stage`)** couplé à un **moteur de mise en page Flexbox ultra-léger** directement sur `zinc:gfx`.

```sh
zinc run examples/music-tree             # sur le Mac (1024x768)
zinc check examples/music-tree           # vérification stricte des types par le compilateur Zinc
```

## Architecture de l'arbre d'affichage (`core/display.ts` & `components/layout-nodes.ts`)

1. **Hiérarchie orientée objet (`DisplayObject` & `Stage`)** :
   - Chaque page, slide, barre ou carte est un `DisplayObject` assemblé avec `addChild(child)` et `removeChild(child)`.
   - Coordonnées locales : chaque nœud dessine dans son propre repère `(0, 0, localWidth, localHeight)`. Le `Stage` applique automatiquement la matrice de transformation globale `setTransform` et décale les zones tactiles (`uiState.offsetX / offsetY`).
2. **Cycle de vie complet (Lifecycle)** :
   - `onAddedToStage()` : appelé lorsque le nœud est attaché à la scène active (ex: chargement automatique des données de la page).
   - `onRemovedFromStage()` : appelé lorsque le nœud est détaché de la scène.
   - `onUpdate(deltaSeconds)` : appelé à chaque frame pour faire avancer les minuteries.
   - `onMeasure()` : appelé avant le calcul du layout pour synchroniser l'état ou mesurer la taille intrinsèque d'un widget.
   - `onDraw(localWidth, localHeight)` : appelé uniquement lorsqu'un rafraîchissement visuel est requis (`uiState.dirty`).
3. **Moteur de layout Flexbox léger intégré (sans le coût de `zinc:ui`)** :
   - `VBox` (`direction = 'column'`), `HBox` (`direction = 'row'`), `SpacerNode` (`flex = 1`), `CardBox`, `ScrollContainerNode`, `PageHeaderBarNode`.
   - Supporte `gap`, `paddingTop/Right/Bottom/Left`, `flex`, `alignItems` (`start`, `center`, `end`, `stretch`), `justifyContent` (`start`, `center`, `end`, `space-between`), `autoWidth` et `autoHeight`.
   - **Zéro allocation par frame et zéro parsing CSS** : conserve 100 % des performances de `zinc:gfx` sur HP TouchPad et Nexus 7.

## Découpage des fichiers (`src/`)

```text
src/
├── main.ts                          # Montage du Stage, gestion des entrées et boucle principale onFrame
├── constants.ts                     # Palette de couleurs, dimensions, ports réseau et identifiants
├── fonts.ts                         # Polices de caractères typées et nommées
├── state.ts                         # État central de l'application (ApplicationState) et actions métier
├── core/
│   ├── display.ts                   # DisplayObject, Stage et moteur de layout Flexbox léger (row/column)
│   ├── input.ts                     # Zones tactiles (TouchZone), glisser et défilement inertiel (ScrollBox)
│   ├── pictures.ts                  # Cache d'images LRU, décodage progressif 1 image/frame et fond flouté
│   └── screen-power.ts              # Veille, rétroéclairage webOS, coup d'œil StandBy et fondu au noir
├── services/
│   ├── config.ts                    # Lecture et sauvegarde de config.json
│   ├── radios-service.ts            # Favoris (radios.json) et annuaire radio-browser.info
│   ├── remote-udp.ts                # Commandes physiques UDP sur le port 7777
│   ├── weather-service.ts           # Prévisions Open-Meteo et géocodage des villes
│   └── notify-service.ts            # Relais de notifications macOS (zinc:link) et cache d'icônes
├── components/
│   ├── layout-nodes.ts              # Nœuds Flexbox : VBox, HBox, SpacerNode, CardBox, ScrollContainerNode, LabelNode, IconNode, PillButtonNode, SegmentedControlNode, SliderNode, CoverArtNode...
│   ├── primitives.ts                # Textes (fit, label, centered, wrap, tabular), icônes Lucide et ombres
│   ├── buttons.ts                   # Rendu bas niveau des boutons et contrôles segmentés
│   ├── slider.ts                    # Rendu du curseur horizontal et de l'indicateur d'activité (spinner)
│   ├── cover.ts                     # Rendu des pochettes avec initiales de secours, tuiles et squelettes
│   ├── search-field.ts              # Rendu du champ de recherche
│   ├── keyboard.ts                  # VirtualKeyboardNode : Clavier virtuel AZERTY
│   ├── sidebar.ts                   # SidebarNode : Barre latérale de navigation et mini-lecteur
│   ├── status-bar.ts                # StatusBarNode : Heure, date, points du carrousel, batterie et pièce
│   ├── volume-popover.ts            # VolumePopoverNode : Popover Flexbox des volumes du groupe et des pièces
│   ├── context-sheet.ts             # ContextSheetNode : Feuille modale de sélection du groupe Sonos
│   ├── toast-layer.ts               # ToastLayerNode : Bandeau de notification éphémère
│   └── notification-overlay.ts      # NotificationOverlayNode : Superposition StandBy et bannières grises
└── pages/
    ├── home/
    │   ├── home-page.ts             # HomePageNode : Conteneur du carrousel (5 slides enfants)
    │   ├── player-slide.ts          # Slide 0 : Lecteur "À l'écoute"
    │   ├── clock-slide.ts           # Slide 1 : Horloge StandBy (5 SingleClockFaceNode enfants)
    │   ├── clock-faces.ts           # Rendu horloger, lampe à lave (shader GLSL / CPU) et odomètre
    │   ├── weather-slide.ts         # Slide 2 : Météo actuelle, courbe 24 h et 7 jours
    │   ├── rings-slide.ts           # Slide 3 : Anneaux de volume de toutes les pièces
    │   └── notifications-slide.ts   # Slide 4 : Centre de notifications et assistant d'appairage Mac
    ├── radios/
    │   └── radios-page.ts           # RadiosPageNode : Mes radios, Populaires, Rechercher
    ├── spotify/
    │   └── spotify-page.ts          # SpotifyPageNode : Playlists, Albums, Titres likés, Récents, Rechercher
    ├── rooms/
    │   └── rooms-page.ts            # RoomsPageNode : Groupes, volumes et regroupement en arbre Flexbox
    └── settings/
        ├── settings-page.ts         # SettingsPageNode : Réglages construits en arbre Flexbox
        └── city-search-page.ts      # CitySearchSubpageNode : Recherche de ville météo
```
