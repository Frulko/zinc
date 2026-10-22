# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.ts` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Ein Gerät aus der Vorlage `iot-board`: ein ESP32-S3, ein Bewegungssensor QMI8658 und ein 128x64-OLED SSD1306, das eine Wasserwaage und die
Temperatur des Sensors zeigt. Schüttle es, um die aktuelle Lage als waagerecht festzulegen.

```sh
zinc run                        # on the desktop: the OLED in a window, the sensor emulated (arrows or a mouse drag tilt, Space shakes)
zinc test                       # the level's maths (tests/level.test.ts)
zinc sim scenarios/level.yaml   # the board of board.json, driven by a scenario: shake, then check the screen
zinc flash --target esp32       # the core firmware on a real board, then zinc run --target esp32
```

| Datei | Was sie tut |
|---|---|
| `src/main.ts` | liest den Sensor in jedem Frame und zeichnet den Bildschirm |
| `src/level.ts` | Winkel, Kalibrierung und wohin die Blase geht, ohne Hardware |
| `board.json` | die Bauteile und ihre Verdrahtung (das Diagrammformat von Wokwi): Der Simulator und die Dokumentation lesen es |
| `scenarios/level.yaml` | ein `zinc sim`-Szenario: wartet auf das Programm, schüttelt das Board, vergleicht den Bildschirm |

Das OLED hängt am I2C (SDA 21, SCL 22 auf dem ESP32; `/dev/i2c-1` auf einem Raspberry Pi), pro Ziel in `zinc.json` festgelegt.
