---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Zinc lernen: von einer Form zu einer App

Diese Lektionen zeigen dir, wie du ein Programm machst, das etwas auf den Bildschirm bringt, auf Tastatur, Maus und Touch antwortet,
zeichnet und Töne spielt, und danach, wie du eine Oberfläche mit Text und Buttons, eine Szene aus Objekten oder eine Zeichnung mit dem Canvas
des Webs baust. Jede Lektion ist kurz. Jede gibt dir den ganzen Code, erklärt ihn Zeile für Zeile und endet mit Änderungen zum Ausprobieren.

Du musst Zinc nicht kennen. Ein bisschen JavaScript hilft, ist aber nicht nötig: Jede Zeile wird erklärt. Zinc-Programme
werden in TypeScript geschrieben (JavaScript mit Typen), mit ein paar zusätzlichen Regeln, daher funktioniert das meiste, was du hier lernst, auch im
Web.

## Bevor du anfängst

Installiere Zinc mit einem Befehl (weitere Wege in [Erste Schritte](../guide/01-getting-started.md#install)):

```sh
brew install frulko/zinc/zinc
zinc doctor
```

Oder installiere **Zinc Atelier**, die App, die Programme ohne Terminal bearbeitet und ausführt (`--atelier` im Installationsbefehl von
[Erste Schritte](../guide/01-getting-started.md#install)).

## So führst du eine Lektion aus

Der Code jeder Lektion ist ein kleines Projekt in [`docs/learn/samples/`](samples/): eine Datei `zinc.json` und ein Ordner `src`.
Lade diesen Ordner von [GitHub](https://github.com/Frulko/zinc/tree/main/docs/learn/samples) herunter oder nutze deine Kopie des
Zinc-Repositorys.

**In einem Terminal** gibst du `zinc run` den Ordner der Lektion:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

Ein Fenster öffnet sich. Schließe es, um das Programm zu beenden. Was das Programm mit `console.log` ausgibt, erscheint im Terminal.

**In Zinc Atelier** wählst du *Datei > Sketch öffnen…* (Cmd+O auf einem Mac, Strg+O sonst), suchst den Ordner der Lektion aus und wählst dann
*Sketch > Ausführen* (Cmd+R oder Strg+R). Die ausgegebenen Zeilen erscheinen in der Konsole von Atelier. Ändere den Code und führe ihn noch einmal aus.

**Dein eigenes Projekt**: Lege einen Ordner mit den zwei Dateien der Lektion an. `zinc.json` sagt, wo der Code liegt und wie groß das
Fenster ist; Lektion 1 erklärt es. Danach `zinc run` in diesem Ordner.

## Die Lektionen

**Teil 1: Zeichnen.** Dein Programm zeichnet das ganze Bild selbst, immer wieder, viele Male pro Sekunde. So funktionieren Spiele,
Animationen und generative Kunst. Es nutzt das Modul `zinc:gfx`.

1. [Ein Fenster und eine Form](01-window-and-shape.md): ein Fenster öffnen, den Hintergrund malen, ein Rechteck und einen Kreis zeichnen.
2. [Farben und Bewegung](02-colours-and-movement.md): die Frame-Schleife, die Zeit zwischen Frames, Farben aus Zahlen.
3. [Die Tastatur](03-keyboard.md): ein Quadrat mit den Pfeiltasten bewegen, den Namen jeder Taste lesen.
4. [Die Maus und Touch](04-mouse-and-touch.md): mit der Maus oder einem Finger Linien zeichnen, das Rad, die rechte Taste.
5. [Text und Bilder](05-text-and-images.md): Schriften und Größen, zentrierter Text, ein Bild aus dem Assets-Ordner.
6. [Sound](06-sound.md): Töne spielen, wenn du klickst oder eine Taste drückst.

**Teil 2: eine Oberfläche.** Du beschreibst den Bildschirm einmal, als Elemente in einem Baum (eine Box enthält einen Titel und einen Button), und Zinc
zeichnet ihn und hält ihn aktuell. So funktionieren Apps und Werkzeuge. Es nutzt `zinc:ui`, geschrieben wie React oder Solid.

7. [Komponenten](07-components.md): `View`, `Text`, `Image`, `Button` und wie sie angeordnet werden.
8. [Zustand](08-state.md): ein Wert, dem der Bildschirm von selbst folgt (ein Signal).
9. [Ereignisse](09-events.md): Klicks, Zeiger drücken und bewegen, die Tastatur.
10. [Styles](10-styles.md): Farben, Größen, Abstände und Ecken mit `className`, Styles, die sich ändern.
11. [Eine Zeichnung in einer Oberfläche](11-drawing-in-an-interface.md): ein `Canvas`, das mit `zinc:gfx` neben Buttons zeichnet.
12. [Eine kleine fertige App](12-a-small-app.md): eine Einkaufsliste, in der du tippst, hinzufügst, abhakst und aufräumst.

**Teil 3: eine Szene.** Dein Programm besteht aus Objekten, jedes eine Klasse, die ihren Platz kennt, sich selbst zeichnet und auf Tipps und
Ziehen antwortet; eine Bühne hält sie und zeichnet nur, wenn sich etwas geändert hat. So schreiben ActionScript 3 (Flash) und Haxe Spiele und Apps,
und so bleiben die Apps von Zinc auf alten Tablets schnell. Es nutzt `zinc:stage`.

13. [Eine Bühne und ein Sprite](13-a-stage-and-a-sprite.md): eine Ball-Klasse, drei Bälle auf einer Bühne, `onUpdate` und `onDraw`.
14. [Kinder und lokale Koordinaten](14-children-and-local-coordinates.md): ein Mond um einen Planeten um die Sonne.
15. [Tippen und Ziehen](15-taps-and-drags.md): ein Button, der seine Tipps zählt, Karten, die du aufnimmst und bewegst.
16. [Das Layout und eine Scroll-Box](16-layout-and-scrolling.md): eine Titelleiste in einer Zeile, eine Liste von Früchten, die scrollt.

**Teil 4: das Canvas des Webs.** Das Zeichnen aus Teil 1, mit den Aufrufen, die Webseiten benutzen, um in ein `<canvas>` zu zeichnen: Pfade, Umrisse,
Kurven, Transformationen und Farbverläufe. Code aus einer Webseite oder einem Canvas-Tutorial liest sich genauso. Es nutzt `zinc:canvas`.

17. [Pfade und Füllungen](17-paths-and-fills.md): ein Haus mit Dach, Tür, Fenster und einem gekrümmten Weg.
18. [Transformationen](18-transforms.md): zwei Uhren, gezeichnet, indem du das Papier verschiebst, drehst und verkleinerst.
19. [Eine Animation](19-animation.md): eine Windmühle, deren Flügel sich drehen, und Wolken, die vorbeiziehen.
20. [Text und Farbverläufe](20-text-and-gradients.md): ein Poster mit verblassendem Himmel, leuchtender Sonne und zentriertem Text.

Jede Lektion dauert 10 bis 20 Minuten. Mache die Lektionen eines Teils der Reihe nach: Jede nutzt, was die davor gelehrt hat. Die Teile 2, 3
und 4 beginnen jeweils bei Teil 1, also nimm nach Teil 1 den, der dir gefällt.

## Vier Wege, etwas auf den Bildschirm zu bringen

| | `zinc:gfx` (Teil 1) | `zinc:ui` (Teil 2) | `zinc:stage` (Teil 3) | `zinc:canvas` (Teil 4) |
|---|---|---|---|---|
| Du schreibst | was in jedem Frame zu zeichnen ist | was der Bildschirm enthält, einmal | Objekte, die sich selbst zeichnen | was in jedem Frame zu zeichnen ist, wie im Web |
| Gut für | Spiele, Animationen, Kunst | Apps, Formulare, Werkzeuge, Einstellungen | Apps und Spiele auf alten Tablets | Web-Canvas-Code, Vektorzeichnungen |
| Position | du gibst jedes x und y an | das Layout platziert die Elemente | jedes Objekt in seinem Elternobjekt, oder eine Zeile oder Spalte | du gibst jedes x und y an oder bewegst das Papier |
| Änderungen | du zeichnest das neue Bild | du änderst einen Wert, der Bildschirm folgt | du bewegst ein Objekt, die Bühne zeichnet | du zeichnest das neue Bild |

Sie lassen sich mischen: Lektion 11 zeichnet mit `zinc:gfx` in einer Oberfläche. [Vier Wege, ein Programm zu schreiben](../start/styles.md) zeigt dasselbe
kleine Programm in jedem Stil nebeneinander und wie sie zusammenpassen.

## Wörter, denen du begegnest

| Wort | Bedeutung |
|---|---|
| Pixel | ein Punkt des Bildschirms. Größen und Positionen werden in Pixeln gezählt. |
| x, y | eine Position: x zählt Pixel vom linken Rand, y vom oberen Rand. (0, 0) ist die obere linke Ecke. |
| Frame | ein Bild des Fensters. Ein Programm zeigt etwa 60 Frames pro Sekunde, wie ein Daumenkino. |
| Funktion | ein benannter Teil Code, der läuft, wenn du ihn aufrufst: `clear(0xffffff)` ruft `clear` auf. |
| Callback | eine Funktion, die du Zinc gibst und die es später aufruft: in jedem Frame, bei einem Klick. |
| Modul | eine Menge von Funktionen, die du importieren kannst: `zinc:gfx` zeichnet, `zinc:audio` spielt Sound, `zinc:ui` baut Oberflächen. |
| Typ | welche Art von Wert eine Variable enthält: `number`, `string` (Text), `boolean` (wahr oder falsch). Zinc prüft sie vor dem Ausführen. |
| Signal | ein Wert, dem die Oberfläche folgt: Ändere ihn, und jeder Text oder Stil, der ihn liest, ändert sich auch. |
| Komponente | ein Stück Oberfläche, geschrieben als Funktion, die Elemente zurückgibt: `View`, `Text`, `Button` oder deine eigene. |
| Klasse | der Bauplan eines Objekts: was es enthält (Felder) und was es tut (Methoden). `new Ball()` macht ein Objekt aus dem Bauplan `Ball`. |
| Sprite | ein Objekt einer Szene (Teil 3): eine Position, eine Größe, Kinder und die Methoden, die Zinc aufruft, um es zu aktualisieren und zu zeichnen. |
| Pfad | eine Form, die das Canvas Punkt für Punkt baut (Teil 4), bevor es sie füllt oder ihren Umriss zeichnet. |

## Wenn du das kannst

- [Referenz zu zinc:gfx](../reference/gfx.md): jede Zeichen- und Eingabefunktion, gruppiert.
- [Ereignisse von zinc:ui](../reference/ui-events.md): jedes Ereignis der Oberfläche, was es dir gibt, wann es ausgelöst wird.
- [Referenz zu zinc:stage](../reference/stage.md): jede Klasse und Funktion aus Teil 3.
- [zinc:canvas](../plugins/canvas2d.md): jede Funktion aus Teil 4 und die wenigen Unterschiede zum Web.
- [UI-Apps](../guide/03-ui-apps.md) und [zinc:ui im Detail](../ui.md): Scrollen, Textfelder, Animationen, Ebenen.
- [Das UI-Kit](../ui-kit.md): fertige Buttons, Dialoge, Menüs und Tabs.
- [Sound](../plugins/audio.md): jede Funktion von `zinc:audio`.
- Die Beispiele von Zinc Atelier (*Datei > Beispiele…*) und `zinc new game-2d`, ein kleines fertiges Spiel zum Lesen und Ändern;
  `zinc new stage` und `zinc new canvas` starten ein Projekt im Stil von Teil 3 oder Teil 4.
