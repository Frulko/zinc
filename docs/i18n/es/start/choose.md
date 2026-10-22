---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# Elige tu tipo de programa

Zinc ejecuta muchos tipos de programas con una sola herramienta. El tipo que escribas decide qué importas, desde qué plantilla
empiezas y qué lees después. Esta página te ayuda a elegir. Puedes cambiar de idea más tarde: todos los tipos usan el mismo
idioma y los mismos comandos (`zinc new`, `zinc run`, `zinc dev`).

¿Eres nuevo en la programación? Empieza por [el camino de lecciones](../learn/README.md) y luego vuelve aquí. ¿Ya te sientes cómodo? Ejecuta
`zinc new <template> my-project` con una plantilla de la tabla y después `zinc run`. [Primeros pasos](../guide/01-getting-started.md)
te guía por los primeros cinco minutos. Dibujo, una escena, el canvas de la web o una interfaz:
[Cuatro formas de escribir un programa](styles.md) muestra el mismo programa pequeño de cada forma de poner cosas en la pantalla.

## La respuesta corta

| Si quieres hacer... | Elige |
| --- | --- |
| un juego, o cualquier cosa que dibujes tú mismo | dibujo y juegos |
| un dibujo con las llamadas del canvas de la web (trazados, degradados) | dibujo y juegos, con `zinc:canvas` |
| una ventana con botones, listas y campos de texto | una app con pantallas (estilo Solid) |
| una app lista y con buen aspecto | componentes listos (estilo Nuxt UI o shadcn) |
| una app que ya escribiste con React Native | código de React Native |
| una escena 3D | 3D |
| un programa sin ventana: un servidor, una herramienta para la terminal | servicios y programas de línea de comandos |
| algo que funcione en una placa pequeña con pantalla o sensores | placas y microcontroladores |
| una biblioteca de JavaScript (three.js, Phaser) tal cual | JavaScript puro |

## Los tipos, uno por uno

«Plantilla» es lo que copia `zinc new <template> my-project`. «Ejemplo» es un programa terminado en `examples/`, que se ejecuta con
`zinc run examples/<name>`.

### Dibujo y juegos

- **Tú escribes:** una función que se llama en cada fotograma y dibuja rectángulos, texto e imágenes, y lee el teclado, el ratón o el mando
  (`zinc:gfx`: `onFrame`, `rect`, `drawText`).
- **Plantilla:** `game` (un cuadrado que mueves con las flechas), `game-2d` (un juego pequeño con escenas, sprites y una puntuación guardada),
  `canvas` (el mismo dibujo con el `CanvasRenderingContext2D` de la web, de `zinc:canvas`: trazados, degradados, texto).
- **Ejemplo:** `examples/breakout`, `examples/platformer`.
- **Lee después:** [Primeros pasos](../guide/01-getting-started.md) y luego [Apps de interfaz](../guide/03-ui-apps.md#fonts-assets-and-images) para fuentes y recursos.
  Las lecciones: [parte 1](../learn/README.md) para `zinc:gfx`, [parte 4](../learn/17-paths-and-fills.md) para `zinc:canvas`.

### Una app con pantallas, estilo Solid

- **Tú escribes:** componentes JSX (`<View>`, `<Text>`, `<Button>`) con estilo mediante `className`, y valores que actualizan la pantalla
  solos (`createSignal` de `zinc:ui/solid`).
- **Plantilla:** `eink` y `remarkable` (ambas escritas para la tableta reMarkable, también funcionan en tu ordenador).
  Todavía no hay una plantilla de uso general para este tipo: copia `examples/ui` o empieza desde `desktop-app`.
- **Ejemplo:** `examples/ui`, `examples/hero`.
- **Lee después:** [Apps de interfaz](../guide/03-ui-apps.md).

### Una app con pantallas, estilo React

- **Tú escribes:** los mismos componentes, con hooks (`useState`, `useEffect` de `zinc:ui/react`).
- **Plantilla:** ninguna todavía.
- **Ejemplo:** `examples/rn-showcase`.
- **Lee después:** [Apps de interfaz](../guide/03-ui-apps.md#solid-vs-react).

### Componentes listos, estilo shadcn

- **Tú escribes:** pantallas hechas con piezas terminadas (botones, diálogos, pestañas, interruptores) de `zinc:ui/kit`.
- **Plantilla:** ninguna todavía.
- **Ejemplo:** `examples/ui/kit-gallery`.
- **Lee después:** [el kit de interfaz](../ui-kit.md).

### Componentes listos, Nuxt UI

- **Tú escribes:** pantallas hechas con los componentes de Nuxt UI (`zinc:ui/nuxt`): barras laterales, tablas, gráficos, formularios.
- **Plantilla:** `desktop-app` (barra lateral, páginas, menú, modo oscuro) y `dashboard` (tarjetas y gráficos).
- **Ejemplo:** `examples/nuxt-ui`.
- **Lee después:** [Nuxt UI en Zinc](../nuxt-ui.md).

### Código de React Native

- **Tú escribes:** componentes y estilos de React Native, con `"ui": { "preset": "react-native" }` en `zinc.json`.
- **Plantilla:** ninguna todavía.
- **Ejemplo:** `examples/rn-port`, `examples/rn-tester`.
- **Lee después:** [React Native en Zinc](../react-native.md).

### 3D

- **Tú escribes:** una escena con la API de three.js (o la de más bajo nivel, `zinc:3d`).
- **Plantilla:** `3d`.
- **Ejemplo:** `examples/three`, `examples/gl-cube`.
- **Lee después:** [el plugin de three.js](../plugins/three.md).

### JavaScript puro

- **Tú escribes:** archivos `.js`, con bibliotecas de npm, que se ejecutan en QuickJS (o en V8, JavaScriptCore, Hermes con `--engine`).
- **Plantilla:** ninguna todavía: pon una entrada `.js` en un proyecto con `zinc.json` y `zinc run` elige el motor.
- **Ejemplo:** `examples/js-three`, `examples/js-phaser`.
- **Lee después:** [Motores de JavaScript](../guide/12-js-engines.md).

### Servicios y programas de línea de comandos

- **Tú escribes:** un programa sin ventana: lee sus argumentos, responde a peticiones HTTP, habla MQTT, ejecuta temporizadores
  (`zinc:sys`, `zinc:net`).
- **Plantilla:** `cli`, `server`, `service` (una API con pruebas y una unidad de systemd).
- **Ejemplo:** `examples/service/sensor-hub`.
- **Lee después:** [Servicios sin ventana](../guide/04-headless-services.md).

### Placas y microcontroladores

- **Tú escribes:** un programa que lee sensores, controla pines y dibuja en una pantalla pequeña (`zinc:gpio`, controladores de pantalla o LVGL).
  Primero funciona en tu mesa, con el hardware simulado, y después en la placa.
- **Plantilla:** `iot` (un botón y un LED en una Raspberry Pi), `iot-board` (un ESP32 con un sensor de movimiento y una pantalla).
- **Ejemplo:** `examples/boards`, `examples/esp32-widgets`.
- **Lee después:** [Placas](../boards.md).

### Tabletas y teléfonos antiguos

- **Tú escribes:** un árbol de objetos de pantalla (`zinc:stage`, como se escribe en ActionScript 3 y Haxe), que mantiene barato cada fotograma en una
  tableta de 2011.
- **Plantilla:** `stage` (un título, botones de colores y una pegatina que arrastras).
- **Ejemplo:** `examples/music-tree`.
- **Lee después:** [las lecciones de escenas](../learn/13-a-stage-and-a-sprite.md), [la referencia de zinc:stage](../reference/stage.md),
  `examples/GUIDELINES.md` en el repositorio.

## Los tipos que todavía no tienen plantilla

Las apps estilo React, el kit estilo shadcn, el código de React Native y el JavaScript puro no tienen ninguna: empieza desde el ejemplo indicado
arriba (copia su carpeta y luego ejecútala con `zinc run`). Está prevista una plantilla para cada uno; hasta entonces, el ejemplo es el punto de partida.

## ¿No estás seguro?

Ejecuta dos o tres ejemplos y quédate con el que más se parezca a lo que quieres hacer: `zinc run examples/breakout`,
`zinc run examples/hero`, `zinc run examples/nuxt-ui`. Después, [la hoja de referencia de sintaxis](../reference/syntax.md) muestra lo que
puedes escribir, y `zinc explain <code>` explica cualquier error.
