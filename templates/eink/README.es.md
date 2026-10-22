# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.tsx` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Una aplicación para la reMarkable Paper Pro hecha con la plantilla `eink`: una lista de tareas que marcas con el lápiz y una página para dibujar. Ambas se conservan entre ejecuciones.

```sh
zinc run                          # on the desktop, half the tablet's size (the mouse is the pen; right button erases)
zinc test                         # the to-do list (tests/todo.test.ts)
zinc export --target rmpp         # the tablet build in dist/ (see Zinc's docs/targets/remarkable-paper-pro.md to install it)
```

| Archivo | Qué hace |
|---|---|
| `src/main.tsx` | las dos páginas y la barra de pestañas |
| `src/todo.ts` | la lista: añadir, marcar, borrar las marcadas, guardar / cargar (con tests) |
| `src/store.ts` | lo que se guarda con `zinc:storage`: la lista y los trazos del dibujo |

El papel electrónico tarda en cambiar y no tiene color: la plantilla se queda en negro sobre blanco, con bordes anchos y letra grande, y solo cambia la pantalla
cuando pasa algo (sin animación ni cursor parpadeante).
