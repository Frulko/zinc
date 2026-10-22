# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.ts` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Un dispositivo fatto con il modello `iot-board`: un ESP32-S3, un sensore di movimento QMI8658 e un OLED SSD1306 da 128x64, che mostrano una livella a bolla e la
temperatura del sensore. Scuotilo per impostare la posizione attuale come piana.

```sh
zinc run                        # on the desktop: the OLED in a window, the sensor emulated (arrows or a mouse drag tilt, Space shakes)
zinc test                       # the level's maths (tests/level.test.ts)
zinc sim scenarios/level.yaml   # the board of board.json, driven by a scenario: shake, then check the screen
zinc flash --target esp32       # the core firmware on a real board, then zinc run --target esp32
```

| File | Cosa fa |
|---|---|
| `src/main.ts` | legge il sensore a ogni frame e disegna lo schermo |
| `src/level.ts` | angoli, calibrazione e dove va la bolla, senza hardware |
| `board.json` | i componenti e i loro collegamenti (il formato dei diagrammi di Wokwi): il simulatore e la documentazione lo leggono |
| `scenarios/level.yaml` | uno scenario di `zinc sim`: aspetta il programma, scuote la scheda, confronta lo schermo |

L'OLED è su I2C (SDA 21, SCL 22 sull'ESP32; `/dev/i2c-1` su un Raspberry Pi), impostato per ogni target in `zinc.json`.
