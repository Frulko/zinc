# Music (AS3/Haxe-style display tree + light Flexbox layout)

A structured, maintainable version of the `examples/music` demo (a wall remote for Sonos / Spotify / Radios / StandBy / Weather / Mac notifications), written **without React or JSX** with an object-oriented display tree in the style of **ActionScript 3 / Haxe (`DisplayObject` / `Stage`)** and a **very light Flexbox layout engine**, directly on `zinc:gfx`. The text on screen is in French.

```sh
zinc run examples/music-tree             # on the Mac (1024x768)
zinc check examples/music-tree           # strict type check by the Zinc compiler
```

## The display tree (`core/display.ts` and `components/layout-nodes.ts`)

1. **Object-oriented hierarchy (`DisplayObject` and `Stage`)**:
   - Every page, slide, bar or card is a `DisplayObject` assembled with `addChild(child)` and `removeChild(child)`.
   - Local coordinates: each node draws in its own frame `(0, 0, localWidth, localHeight)`. The `Stage` applies the global transform `setTransform` and shifts the touch zones (`uiState.offsetX / offsetY`).
2. **Lifecycle**:
   - `onAddedToStage()`: called when the node is attached to the active stage (e.g. a page loads its data).
   - `onRemovedFromStage()`: called when the node is detached from the stage.
   - `onUpdate(deltaSeconds)`: called every frame to advance timers.
   - `onMeasure()`: called before the layout to sync state or measure the intrinsic size of a widget.
   - `onDraw(localWidth, localHeight)`: called only when a visual refresh is needed (`uiState.dirty`).
3. **Light built-in Flexbox layout (without the cost of `zinc:ui`)**:
   - `VBox` (`direction = 'column'`), `HBox` (`direction = 'row'`), `SpacerNode` (`flex = 1`), `CardBox`, `ScrollContainerNode`, `PageHeaderBarNode`.
   - Supports `gap`, `paddingTop/Right/Bottom/Left`, `flex`, `alignItems` (`start`, `center`, `end`, `stretch`) and `autoHeight`.
   - **No CSS parsing, and frames are drawn only when something changes** (`uiState.dirty`), which keeps `zinc:gfx` fast on the HP TouchPad and the Nexus 7.

## Files (`src/`)

```text
src/
├── main.ts                          # Mounts the Stage; inputs and the main onFrame loop
├── constants.ts                     # Colors, sizes, network ports and ids
├── fonts.ts                         # Named, typed fonts
├── state.ts                         # The app's central state (ApplicationState) and its actions
├── spotify-client.ts                # Spotify app id built into the build (empty in the repository)
├── core/
│   ├── display.ts                   # DisplayObject, Stage and the light Flexbox layout (row/column)
│   ├── input.ts                     # Touch zones (TouchZone), drag and inertial scrolling (ScrollBox)
│   ├── pictures.ts                  # LRU picture cache, progressive decoding (1 picture per frame) and blurred background
│   └── screen-power.ts              # Sleep, webOS backlight, StandBy glance and fade to black
├── services/
│   ├── config.ts                    # Reads and saves config.json
│   ├── radios-service.ts            # Favorites (radios.json) and the radio-browser.info directory
│   ├── remote-udp.ts                # Physical remote commands over UDP on port 7777
│   ├── weather-service.ts           # Open-Meteo forecasts and city geocoding
│   ├── spotify-account.ts           # Spotify account: log in from a Mac, check, log out
│   ├── spotify-on-sonos.ts          # Spotify on the speakers: play, "Reprendre ici", queue, radios
│   ├── spotify-catalog.ts           # Spotify API answers kept by key, next pages, search after typing stops
│   └── notify-service.ts            # macOS notification relay (zinc:link) and icon cache
├── components/
│   ├── layout-nodes.ts              # Flexbox nodes: VBox, HBox, SpacerNode, CardBox, ScrollContainerNode, LabelNode, IconNode, PillButtonNode, SegmentedControlNode, SliderNode, CoverArtNode...
│   ├── primitives.ts                # Text (fit, label, centered, wrap, tabular), Lucide icons and shadows
│   ├── emoji-text.ts                # Text with the Mac's emoji as pictures (one cut line, a paragraph)
│   ├── buttons.ts                   # Low-level drawing of buttons and segmented controls
│   ├── slider.ts                    # Drawing of the horizontal slider and the activity indicator (spinner)
│   ├── cover.ts                     # Drawing of covers with fallback initials, and grid tiles
│   ├── search-field.ts              # Drawing of the search field
│   ├── keyboard.ts                  # VirtualKeyboardNode: AZERTY virtual keyboard
│   ├── sidebar.ts                   # SidebarNode: navigation sidebar and mini player
│   ├── status-bar.ts                # StatusBarNode: time, date, carousel dots, battery and room
│   ├── volume-popover.ts            # VolumePopoverNode: Flexbox popover of the group and room volumes
│   ├── context-sheet.ts             # ContextSheetNode: modal sheet to pick the Sonos group
│   ├── toast-layer.ts               # ToastLayerNode: short-lived notification banner
│   └── notification-overlay.ts      # NotificationOverlayNode: StandBy overlay and grey banners
└── pages/
    ├── home/
    │   ├── home-page.ts             # HomePageNode: carousel container (5 child slides)
    │   ├── player-slide.ts          # Slide 0: "À l'écoute" player
    │   ├── clock-slide.ts           # Slide 1: StandBy clock (5 child SingleClockFaceNode)
    │   ├── clock-faces.ts           # Clock drawing, lava lamp (GLSL shader / CPU) and odometer
    │   ├── weather-slide.ts         # Slide 2: Current weather, 24 h curve and 7 days
    │   ├── rings-slide.ts           # Slide 3: Volume rings of all rooms
    │   └── notifications-slide.ts   # Slide 4: Notification center and Mac pairing assistant
    ├── radios/
    │   └── radios-page.ts           # RadiosPageNode: My radios, Popular, Search
    ├── spotify/
    │   ├── spotify-page.ts          # SpotifyPageNode: header (back, title), login cards, the top view
    │   ├── spotify-views.ts         # The stack of views: library, search, artist, album, playlist
    │   └── spotify-pieces.ts        # Grids, track rows, tiles and a track's menu
    ├── rooms/
    │   └── rooms-page.ts            # RoomsPageNode: groups, volumes and grouping, as a Flexbox tree
    └── settings/
        ├── settings-page.ts         # SettingsPageNode: settings built as a Flexbox tree
        └── city-search-page.ts      # CitySearchSubpageNode: weather city search
```
