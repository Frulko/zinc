# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.tsx` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Un panel en vivo hecho con la plantilla `dashboard`, sobre `zinc:ui/nuxt`.

```sh
zinc run      # the dashboard, fed by the mock source
zinc test     # the series and the source (tests/)
zinc build    # a native executable in build/
```

| Archivo | Qué hace |
|---|---|
| `src/source.ts` | de dónde vienen los números: `MockSource` (un paseo aleatorio con semilla fija, cuatro muestras por segundo) detrás de la interfaz `Source` |
| `src/series.ts` | una ventana deslizante de muestras con la última, el mínimo, el máximo y la media |
| `src/charts.ts` | los gráficos de líneas y de barras, dibujados en un `<Canvas>` |
| `src/main.tsx` | la página: las tarjetas de cifras, los gráficos, las alertas, pausa / reanudar |

Para mostrar datos reales, escribe una clase con `poll(dt: number): Sample[]` (desde `zinc:net` fetch, `zinc:mqtt`, un puerto serie...) y pásala a `start()` en
`src/main.tsx` en lugar de la fuente simulada.
