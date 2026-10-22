# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `example/main.ts` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/

Un plugin Zinc fait avec le point de départ `plugin` : un programme l'importe sous le nom `zinc:{{id}}`.

```ts
import { greet, checksum } from 'zinc:{{id}}';
greet('Ada');        // 'Hello, Ada!', in Zinc (index.ts)
checksum('hello');   // 1335831723, in C++ (native/{{id}}.host.cpp)
```

| Chemin | Ce que c'est |
|---|---|
| `plugin.json` | le manifeste : nom, module, version, cibles, permissions, éditeur ([docs/plugins.md](https://github.com/zinc-engine/zinc/blob/main/docs/plugins.md)) |
| `index.ts` | l'API, compilée dans chaque programme qui importe le plugin |
| `native/{{id}}.spec.ts` | l'interface de la partie native ; zinc en génère la classe C++ `Native{{ident}}` |
| `native/{{id}}.host.cpp` | son C++ pour macOS et Linux, compilé avec zig (version fixée) à la première utilisation |
| `native/{{id}}.sim.ts` | le même comportement écrit en Zinc, là où aucun code natif ne s'exécute |
| `tests/` | `zinc test` lance chaque `*.test.ts` |
| `example/main.ts` | un programme qui utilise le plugin (`zinc run`) ; `zinc.json` trouve le plugin avec `"pluginDirs": [".."]` |
| `.github/workflows/ci.yml` | l'intégration continue : tests, binaires pour quatre cibles, versions signées |

## Développer

```sh
zinc run                      # example/main.ts with the plugin
zinc test                     # tests/*.test.ts on the native part
ZINC_NATIVE=sim zinc test     # the same tests on native/{{id}}.sim.ts: both must pass
zinc plugin-build {{id}}      # the native part alone, into ~/.zinc/cache
```

Pas besoin de C++ ? Supprimez `native/`, ainsi que l'import et `checksum` de `index.ts` : le plugin est alors du pur Zinc et rien n'est compilé.
Une bibliothèque système se déclare dans `plugin.json` sous `targets.<target>` : `pkg` (pkg-config), `libs`, `frameworks`, et d'autres fichiers C++ dans `sources`.
Les capacités dont le plugin a besoin (`net`, `fs`, `process`...) vont dans `"permissions"` : `zinc add` les affiche et les fixe dans le verrou du projet.

## L'utiliser dans un projet

```sh
zinc add gh:<you>/<repository>@v0.1.0   # from git, pinned to the tag's commit in zinc.lock
zinc plugins                            # lists zinc:{{id}} and its targets
```

## Publier une version signée

1. **Une clé.** `zinc update-keygen` affiche `seed=...` et `public=...`. La graine est le secret qui signe : rangez-la dans les
   réglages du dépôt, Secrets and variables, Actions, sous le nom `ZINC_PUBLISHER_SEED`, et nulle part ailleurs. La clé publique va dans `plugin.json`, pour que les utilisateurs
   vérifient chaque version avec elle :

   ```json
   "publisher": { "name": "<your name>", "publicKey": "<public>" }
   ```

2. **L'intégration continue.** `.github/workflows/ci.yml` lance le workflow réutilisable de Zinc à chaque push et à chaque pull request : `zinc test`, puis la partie native
   compilée pour `macos-arm64`, `linux-x86_64`, `linux-aarch64` et `linux-armhf` (Raspberry Pi OS 32 bits), publiée comme artefacts `index-<target>`
   dans l'organisation de l'index des plugins : `binaries/<target>/{{id}}-<key>.tar`, nommé par la clé de cache que zinc calcule pour les mêmes sources et le même
   moteur, et le descripteur `plugins/{{id}}/<version>.json`. Son entrée `zinc-ref` (par défaut `main`) choisit le moteur ; les binaires ne conviennent qu'au
   moteur avec lequel ils ont été compilés.

3. **La version.** Réglez `"version"` dans `plugin.json`, validez, et poussez une étiquette de même version :

   ```sh
   git tag v0.1.0 && git push origin main v0.1.0
   ```

   L'exécution déclenchée par l'étiquette publie une version GitHub : `{{id}}-0.1.0.tar.gz` (les sources), sa signature `{{id}}-0.1.0.tar.gz.sig`, et
   `index-v0.1.0.tar` (les binaires et le descripteur, chacun signé). Une étiquette qui n'est pas `v` + la version, ou un dépôt sans le secret
   `ZINC_PUBLISHER_SEED`, s'arrête avant toute publication et dit pourquoi.

   La même version à la main, pour l'essayer avant la première étiquette :

   ```sh
   git archive --prefix={{id}}/ -o {{id}}-0.1.0.tar.gz HEAD
   zinc sign {{id}}-0.1.0.tar.gz <seed>                      # writes {{id}}-0.1.0.tar.gz.sig
   zinc verify {{id}}-0.1.0.tar.gz --key <public>            # checks it
   zinc add file://$PWD/{{id}}-0.1.0.tar.gz ../some-project   # what users get from the release's URL
   ```

4. **Les utilisateurs** ajoutent la version avec son URL :

   ```sh
   zinc add https://github.com/<you>/<repository>/releases/download/v0.1.0/{{id}}-0.1.0.tar.gz
   ```

   zinc récupère le `.sig` à côté de l'archive, le vérifie avec la clé de l'éditeur de `plugin.json`, affiche le niveau (`community`) et
   l'éditeur avant d'installer, puis fixe le SHA-256 de l'archive et la clé dans `zinc.lock`. Une version ultérieure signée avec une autre clé est
   refusée tant que l'utilisateur n'a pas lancé `zinc trust {{id}}`. Les plugins communautaires sont compilés depuis les sources sur la machine de l'utilisateur.

5. **Vérifié.** Pour figurer dans l'index de Zinc comme éditeur vérifié (`zinc add {{id}}` par son nom, binaires utilisés dès que des reconstructions indépendantes
   concordent), demandez une délégation pour votre clé publique ; ce que garantit chaque niveau est expliqué dans le
   [guide de sécurité](https://github.com/zinc-engine/zinc/blob/main/docs/guide/08-security.md) de Zinc, "Plugin distribution".

## Licence

Ajoutez un fichier `LICENSE` et une clé `"license"` dans `plugin.json` avant la première version.
