# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `example/main.ts` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/

Un plugin de Zinc hecho con el punto de partida `plugin`: un programa lo importa como `zinc:{{id}}`.

```ts
import { greet, checksum } from 'zinc:{{id}}';
greet('Ada');        // 'Hello, Ada!', in Zinc (index.ts)
checksum('hello');   // 1335831723, in C++ (native/{{id}}.host.cpp)
```

| Ruta | Qué es |
|---|---|
| `plugin.json` | el manifiesto: nombre, módulo, versión, destinos, permisos, editor ([docs/plugins.md](https://github.com/zinc-engine/zinc/blob/main/docs/plugins.md)) |
| `index.ts` | la API, compilada en cada programa que importa el plugin |
| `native/{{id}}.spec.ts` | la interfaz de la parte nativa; zinc genera a partir de ella la clase C++ `Native{{ident}}` |
| `native/{{id}}.host.cpp` | su C++ para macOS y Linux, compilado con el zig fijado la primera vez que se usa |
| `native/{{id}}.sim.ts` | el mismo comportamiento escrito en Zinc, para donde no se ejecuta código nativo |
| `tests/` | `zinc test` ejecuta cada `*.test.ts` |
| `example/main.ts` | un programa que usa el plugin (`zinc run`); `zinc.json` encuentra el plugin con `"pluginDirs": [".."]` |
| `.github/workflows/ci.yml` | la integración continua: tests, binarios para cuatro destinos, versiones firmadas |

## Desarrollar

```sh
zinc run                      # example/main.ts with the plugin
zinc test                     # tests/*.test.ts on the native part
ZINC_NATIVE=sim zinc test     # the same tests on native/{{id}}.sim.ts: both must pass
zinc plugin-build {{id}}      # the native part alone, into ~/.zinc/cache
```

¿No necesitas C++? Borra `native/`, y el import y `checksum` de `index.ts`: el plugin pasa a ser Zinc puro y no se compila nada.
Una biblioteca del sistema se declara en `plugin.json` bajo `targets.<target>`: `pkg` (pkg-config), `libs`, `frameworks`, y más archivos C++ en `sources`.
Las capacidades que el plugin necesita (`net`, `fs`, `process`...) van en `"permissions"`: `zinc add` las muestra y las fija en el bloqueo del proyecto.

## Usarlo en un proyecto

```sh
zinc add gh:<you>/<repository>@v0.1.0   # from git, pinned to the tag's commit in zinc.lock
zinc plugins                            # lists zinc:{{id}} and its targets
```

## Publicar una versión firmada

1. **Una clave.** `zinc update-keygen` muestra `seed=...` y `public=...`. La semilla es el secreto que firma: guárdala en los
   ajustes del repositorio, Secrets and variables, Actions, con el nombre `ZINC_PUBLISHER_SEED`, y en ningún otro sitio. La clave pública va en `plugin.json`, para que los usuarios
   comprueben cada versión con ella:

   ```json
   "publisher": { "name": "<your name>", "publicKey": "<public>" }
   ```

2. **La integración continua.** `.github/workflows/ci.yml` ejecuta el workflow reutilizable de Zinc en cada push y en cada pull request: `zinc test`, y luego la parte nativa
   compilada para `macos-arm64`, `linux-x86_64`, `linux-aarch64` y `linux-armhf` (Raspberry Pi OS de 32 bits), subida como los artefactos `index-<target>`
   con la estructura del índice de plugins: `binaries/<target>/{{id}}-<key>.tar`, con el nombre de la clave de caché que zinc calcula para las mismas fuentes y el mismo
   motor, y el descriptor `plugins/{{id}}/<version>.json`. Su entrada `zinc-ref` (por defecto `main`) elige el motor; los binarios solo sirven para
   el motor con el que se compilaron.

3. **La versión.** Fija `"version"` en `plugin.json`, haz commit y sube una etiqueta con la misma versión:

   ```sh
   git tag v0.1.0 && git push origin main v0.1.0
   ```

   La ejecución que dispara la etiqueta publica una versión de GitHub: `{{id}}-0.1.0.tar.gz` (las fuentes), su firma `{{id}}-0.1.0.tar.gz.sig` y
   `index-v0.1.0.tar` (los binarios y el descriptor, cada uno firmado). Una etiqueta que no sea `v` + la versión, o un repositorio sin el secreto
   `ZINC_PUBLISHER_SEED`, se detiene antes de publicar nada y dice por qué.

   La misma versión a mano, para probarla antes de la primera etiqueta:

   ```sh
   git archive --prefix={{id}}/ -o {{id}}-0.1.0.tar.gz HEAD
   zinc sign {{id}}-0.1.0.tar.gz <seed>                      # writes {{id}}-0.1.0.tar.gz.sig
   zinc verify {{id}}-0.1.0.tar.gz --key <public>            # checks it
   zinc add file://$PWD/{{id}}-0.1.0.tar.gz ../some-project   # what users get from the release's URL
   ```

4. **Los usuarios** añaden la versión con su URL:

   ```sh
   zinc add https://github.com/<you>/<repository>/releases/download/v0.1.0/{{id}}-0.1.0.tar.gz
   ```

   zinc descarga el `.sig` junto al archivo, lo comprueba con la clave del editor de `plugin.json`, muestra el nivel (`community`) y el
   editor antes de instalar, y fija el SHA-256 del archivo y la clave en `zinc.lock`. Una versión posterior firmada con otra clave se
   rechaza hasta que el usuario ejecute `zinc trust {{id}}`. Los plugins de la comunidad se compilan desde las fuentes en la máquina del usuario.

5. **Verificado.** Para figurar en el índice de Zinc como editor verificado (`zinc add {{id}}` por su nombre, con binarios usados en cuanto reconstrucciones independientes
   coincidan), pide una delegación para tu clave pública; lo que garantiza cada nivel está en la
   [guía de seguridad](https://github.com/zinc-engine/zinc/blob/main/docs/guide/08-security.md) de Zinc, "Plugin distribution".

## Licencia

Añade un archivo `LICENSE` y una clave `"license"` en `plugin.json` antes de la primera versión.
