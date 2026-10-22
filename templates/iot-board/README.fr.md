# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.ts` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Un appareil fait avec le modèle `iot-board` : un ESP32-S3, un capteur de mouvement QMI8658 et un écran OLED SSD1306 de 128x64, qui montre un niveau à bulle et la
température du capteur. Secouez-le pour définir la position actuelle comme position à plat.

```sh
zinc run                        # on the desktop: the OLED in a window, the sensor emulated (arrows or a mouse drag tilt, Space shakes)
zinc test                       # the level's maths (tests/level.test.ts)
zinc sim scenarios/level.yaml   # the board of board.json, driven by a scenario: shake, then check the screen
zinc flash --target esp32       # the core firmware on a real board, then zinc run --target esp32
```

| Fichier | Ce qu'il fait |
|---|---|
| `src/main.ts` | lit le capteur à chaque image et dessine l'écran |
| `src/level.ts` | les angles, l'étalonnage et la position de la bulle, sans matériel |
| `board.json` | les composants et leur câblage (le format de diagramme de Wokwi) : le simulateur et la documentation le lisent |
| `scenarios/level.yaml` | un scénario `zinc sim` : attend le programme, secoue la carte, compare l'écran |

L'OLED est sur I2C (SDA 21, SCL 22 sur l'ESP32 ; `/dev/i2c-1` sur un Raspberry Pi), réglé par cible dans `zinc.json`.
