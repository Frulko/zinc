---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Wähle deine Programmart

Zinc führt viele Arten von Programmen mit einem einzigen Werkzeug aus. Welche Art du schreibst, entscheidet darüber, was du importierst, mit
welcher Vorlage du startest und was du als Nächstes liest. Diese Seite hilft dir bei der Wahl. Du kannst deine Meinung später ändern: Jede Art
ist dieselbe Sprache mit denselben Befehlen (`zinc new`, `zinc run`, `zinc dev`).

Neu beim Programmieren? Beginne mit [dem Lernpfad](../learn/README.md) und komm danach hierher zurück. Schon vertraut mit dem Thema? Führe
`zinc new <template> my-project` mit einer Vorlage aus der Tabelle aus, dann `zinc run`. [Erste Schritte](../guide/01-getting-started.md)
begleitet dich durch die ersten fünf Minuten. Zeichnen, eine Szene, das Canvas des Webs oder eine Oberfläche:
[Vier Wege, ein Programm zu schreiben](styles.md) zeigt dasselbe kleine Programm auf jedem Weg, etwas auf den Bildschirm zu bringen.

## Die kurze Antwort

| Wenn du Folgendes machen willst ... | Wähle |
| --- | --- |
| ein Spiel oder alles, was du selbst zeichnest | Zeichnen und Spiele |
| eine Zeichnung mit den Canvas-Aufrufen des Webs (Pfade, Farbverläufe) | Zeichnen und Spiele, mit `zinc:canvas` |
| ein Fenster mit Buttons, Listen und Textfeldern | eine App mit Bildschirmen (Solid-Stil) |
| eine fertige, gut aussehende App | fertige Komponenten (Nuxt UI oder shadcn-Stil) |
| eine App, die du schon mit React Native geschrieben hast | React-Native-Code |
| eine 3D-Szene | 3D |
| ein Programm ohne Fenster: ein Server, ein Werkzeug für das Terminal | Dienste und Kommandozeilenprogramme |
| etwas, das auf einem kleinen Board mit Display oder Sensoren läuft | Boards und Mikrocontroller |
| eine JavaScript-Bibliothek (three.js, Phaser), so wie sie ist | reines JavaScript |

## Die Arten, eine nach der anderen

Eine "Vorlage" ist das, was `zinc new <template> my-project` kopiert. Ein "Beispiel" ist ein fertiges Programm in `examples/`, das du mit
`zinc run examples/<name>` ausführst.

### Zeichnen und Spiele

- **Du schreibst:** eine Funktion, die in jedem Frame aufgerufen wird, Rechtecke, Text und Bilder zeichnet und Tastatur, Maus oder Gamepad liest
  (`zinc:gfx`: `onFrame`, `rect`, `drawText`).
- **Vorlage:** `game` (ein Quadrat, das du mit den Pfeiltasten bewegst), `game-2d` (ein kleines Spiel mit Szenen, Sprites und gespeichertem Punktestand),
  `canvas` (dieselbe Zeichnung mit dem `CanvasRenderingContext2D` des Webs, aus `zinc:canvas`: Pfade, Farbverläufe, Text).
- **Beispiel:** `examples/breakout`, `examples/platformer`.
- **Als Nächstes lesen:** [Erste Schritte](../guide/01-getting-started.md), dann [UI-Apps](../guide/03-ui-apps.md#fonts-assets-and-images) für Schriften und Assets.
  Die Lektionen: [Teil 1](../learn/README.md) für `zinc:gfx`, [Teil 4](../learn/17-paths-and-fills.md) für `zinc:canvas`.

### Eine App mit Bildschirmen, Solid-Stil

- **Du schreibst:** JSX-Komponenten (`<View>`, `<Text>`, `<Button>`), gestaltet mit `className`, und Werte, die den Bildschirm von
  selbst aktualisieren (`createSignal` aus `zinc:ui/solid`).
- **Vorlage:** `eink` und `remarkable` (beide für das reMarkable-Tablet geschrieben, sie laufen auch auf deinem Computer).
  Für diese Art gibt es noch keine allgemeine Vorlage: Kopiere `examples/ui` oder starte mit `desktop-app`.
- **Beispiel:** `examples/ui`, `examples/hero`.
- **Als Nächstes lesen:** [UI-Apps](../guide/03-ui-apps.md).

### Eine App mit Bildschirmen, React-Stil

- **Du schreibst:** dieselben Komponenten, mit Hooks (`useState`, `useEffect` aus `zinc:ui/react`).
- **Vorlage:** noch keine.
- **Beispiel:** `examples/rn-showcase`.
- **Als Nächstes lesen:** [UI-Apps](../guide/03-ui-apps.md#solid-vs-react).

### Fertige Komponenten, shadcn-Stil

- **Du schreibst:** Bildschirme aus fertigen Teilen (Buttons, Dialoge, Tabs, Schalter) aus `zinc:ui/kit`.
- **Vorlage:** noch keine.
- **Beispiel:** `examples/ui/kit-gallery`.
- **Als Nächstes lesen:** [das UI-Kit](../ui-kit.md).

### Fertige Komponenten, Nuxt UI

- **Du schreibst:** Bildschirme aus den Komponenten von Nuxt UI (`zinc:ui/nuxt`): Seitenleisten, Tabellen, Diagramme, Formulare.
- **Vorlage:** `desktop-app` (Seitenleiste, Seiten, Menü, dunkler Modus) und `dashboard` (Karten und Diagramme).
- **Beispiel:** `examples/nuxt-ui`.
- **Als Nächstes lesen:** [Nuxt UI auf Zinc](../nuxt-ui.md).

### React-Native-Code

- **Du schreibst:** React-Native-Komponenten und -Styles, mit `"ui": { "preset": "react-native" }` in `zinc.json`.
- **Vorlage:** noch keine.
- **Beispiel:** `examples/rn-port`, `examples/rn-tester`.
- **Als Nächstes lesen:** [React Native auf Zinc](../react-native.md).

### 3D

- **Du schreibst:** eine Szene mit der three.js-API (oder dem tiefer liegenden `zinc:3d`).
- **Vorlage:** `3d`.
- **Beispiel:** `examples/three`, `examples/gl-cube`.
- **Als Nächstes lesen:** [das three.js-Plugin](../plugins/three.md).

### Reines JavaScript

- **Du schreibst:** `.js`-Dateien mit npm-Bibliotheken, ausgeführt auf QuickJS (oder V8, JavaScriptCore, Hermes mit `--engine`).
- **Vorlage:** noch keine: Lege einen `.js`-Einstiegspunkt in ein `zinc.json`-Projekt, und `zinc run` wählt die Engine.
- **Beispiel:** `examples/js-three`, `examples/js-phaser`.
- **Als Nächstes lesen:** [JavaScript-Engines](../guide/12-js-engines.md).

### Dienste und Kommandozeilenprogramme

- **Du schreibst:** ein Programm ohne Fenster: Es liest seine Argumente, beantwortet HTTP-Anfragen, spricht MQTT und lässt Timer laufen
  (`zinc:sys`, `zinc:net`).
- **Vorlage:** `cli`, `server`, `service` (eine API mit Tests und einer systemd-Unit).
- **Beispiel:** `examples/service/sensor-hub`.
- **Als Nächstes lesen:** [Dienste ohne Fenster](../guide/04-headless-services.md).

### Boards und Mikrocontroller

- **Du schreibst:** ein Programm, das Sensoren liest, Pins steuert und auf einem kleinen Display zeichnet (`zinc:gpio`, Display-Treiber oder LVGL).
  Es läuft zuerst auf deinem Schreibtisch, mit simulierter Hardware, dann auf dem Board.
- **Vorlage:** `iot` (ein Raspberry-Pi-Button mit LED), `iot-board` (ein ESP32 mit Bewegungssensor und Display).
- **Beispiel:** `examples/boards`, `examples/esp32-widgets`.
- **Als Nächstes lesen:** [Boards](../boards.md).

### Alte Tablets und Handys

- **Du schreibst:** einen Baum aus Anzeigeobjekten (`zinc:stage`, wie ActionScript 3 und Haxe ihn schreiben), der jeden Frame auf einem
  Tablet von 2011 günstig hält.
- **Vorlage:** `stage` (ein Titel, farbige Buttons und ein Sticker, den du ziehst).
- **Beispiel:** `examples/music-tree`.
- **Als Nächstes lesen:** [die Szenen-Lektionen](../learn/13-a-stage-and-a-sprite.md), [die Referenz zu zinc:stage](../reference/stage.md),
  `examples/GUIDELINES.md` im Repository.

## Für welche Arten es noch keine Vorlage gibt

React-Apps, das Kit im shadcn-Stil, React-Native-Code und reines JavaScript haben keine: Starte mit dem oben genannten
Beispiel (kopiere seinen Ordner und führe ihn dann mit `zinc run` aus). Für jede Art ist eine Vorlage geplant; bis dahin ist das Beispiel der Startpunkt.

## Unsicher?

Führe zwei oder drei Beispiele aus und behalte das, was sich nach dem anfühlt, was du machen willst: `zinc run examples/breakout`,
`zinc run examples/hero`, `zinc run examples/nuxt-ui`. Danach zeigt dir [der Syntax-Spickzettel](../reference/syntax.md), was du
schreiben kannst, und `zinc explain <code>` erklärt dir jeden Fehler.
