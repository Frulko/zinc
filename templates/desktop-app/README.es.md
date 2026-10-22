# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.tsx` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Una aplicación de escritorio hecha con la plantilla `desktop-app`, sobre `zinc:ui/nuxt` (componentes con el aspecto de Nuxt UI).

```sh
zinc run      # the app
zinc test     # the router and the settings (tests/)
zinc build    # a native executable in build/
```

| Archivo | Qué hace |
|---|---|
| `src/main.tsx` | la carcasa: una barra lateral plegable, la barra de navegación con el menú de la aplicación, la página actual |
| `src/router.ts` | las páginas y el historial (volver), sin interfaz: con tests |
| `src/settings.ts` | los ajustes (nombre, modo oscuro) y cómo se guardan con `zinc:storage`: con tests |
| `src/pages/*.tsx` | Inicio, Notas (una lista que se conserva entre ejecuciones), Ajustes |

`src/desktop.ts` define el menú de la aplicación (Archivo, Edición, Visualización con atajos, Ventana: la barra de menús de macOS, dibujada en otros sitios por el kit de interfaz) y un
icono en la bandeja del sistema donde la plataforma lo tiene; la página de Ajustes dice qué ofrece esta plataforma. El menú Archivo de la barra de navegación son las mismas
acciones dentro de la ventana.
