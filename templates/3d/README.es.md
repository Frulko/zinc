# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.ts` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Una escena 3D hecha con la plantilla `3d`: código three.js como en la web, dibujado por el renderizador de Zinc (sin navegador y sin DOM).

```sh
zinc run      # drag to orbit around the scene, wheel or pinch to zoom
zinc test     # the motion (tests/motion.test.ts)
zinc build    # a native executable in build/
```

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | el renderizador, la cámara con OrbitControls, el bucle de animación |
| `src/scene.ts` | lo que hay en la escena: las luces, el suelo, el anillo, los satélites |
| `src/motion.ts` | dónde está cada cosa en el instante t, sin three.js (lo que comprueban los tests) |

Las diferencias con el mismo código en la web están marcadas con `zinc:` (`window` viene de 'three', el renderizador dibuja en la pantalla).
Los modelos glTF se cargan con `GLTFLoader` de 'three/addons/loaders/GLTFLoader.js' (mira examples/three/gltf-viewer en el repositorio de Zinc).
