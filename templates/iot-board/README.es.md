# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.ts` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Un dispositivo hecho con la plantilla `iot-board`: un ESP32-S3, un sensor de movimiento QMI8658 y una pantalla OLED SSD1306 de 128x64, que muestra un nivel de burbuja y la
temperatura del sensor. Agítalo para fijar la posición actual como horizontal.

```sh
zinc run                        # on the desktop: the OLED in a window, the sensor emulated (arrows or a mouse drag tilt, Space shakes)
zinc test                       # the level's maths (tests/level.test.ts)
zinc sim scenarios/level.yaml   # the board of board.json, driven by a scenario: shake, then check the screen
zinc flash --target esp32       # the core firmware on a real board, then zinc run --target esp32
```

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | lee el sensor en cada fotograma y dibuja la pantalla |
| `src/level.ts` | los ángulos, la calibración y dónde va la burbuja, sin hardware |
| `board.json` | las piezas y su cableado (el formato de diagrama de Wokwi): lo leen el simulador y la documentación |
| `scenarios/level.yaml` | un escenario de `zinc sim`: espera al programa, agita la placa, compara la pantalla |

La pantalla OLED va por I2C (SDA 21, SCL 22 en el ESP32; `/dev/i2c-1` en una Raspberry Pi), y se configura por destino en `zinc.json`.
