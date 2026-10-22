# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.ts` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Eine 3D-Szene aus der Vorlage `3d`: three.js-Code wie im Web, gezeichnet vom Renderer von Zinc (kein Browser, kein DOM).

```sh
zinc run      # drag to orbit around the scene, wheel or pinch to zoom
zinc test     # the motion (tests/motion.test.ts)
zinc build    # a native executable in build/
```

| Datei | Was sie tut |
|---|---|
| `src/main.ts` | der Renderer, die Kamera mit OrbitControls, die Animationsschleife |
| `src/scene.ts` | was in der Szene ist: Lichter, Boden, der Ring, die Satelliten |
| `src/motion.ts` | wo die Dinge zum Zeitpunkt t sind, ohne three.js (das prüfen die Tests) |

Die Unterschiede zum selben Code im Web sind mit `zinc:` markiert (`window` kommt aus 'three', der Renderer zeichnet auf den Bildschirm).
glTF-Modelle lädst du mit `GLTFLoader` aus 'three/addons/loaders/GLTFLoader.js' (siehe examples/three/gltf-viewer im Zinc-Repository).
