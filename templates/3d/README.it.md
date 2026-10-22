# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.ts` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Una scena 3D fatta con il modello `3d`: codice three.js come sul web, disegnato dal renderer di Zinc (niente browser, niente DOM).

```sh
zinc run      # drag to orbit around the scene, wheel or pinch to zoom
zinc test     # the motion (tests/motion.test.ts)
zinc build    # a native executable in build/
```

| File | Cosa fa |
|---|---|
| `src/main.ts` | il renderer, la camera con OrbitControls, il ciclo di animazione |
| `src/scene.ts` | cosa c'è nella scena: luci, pavimento, l'anello, i satelliti |
| `src/motion.ts` | dove sono le cose al tempo t, senza three.js (ciò che controllano i test) |

Le differenze rispetto allo stesso codice sul web sono segnate con `zinc:` (`window` viene da 'three', il renderer disegna sullo schermo).
I modelli glTF si caricano con `GLTFLoader` da 'three/addons/loaders/GLTFLoader.js' (vedi examples/three/gltf-viewer nel repository di Zinc).
