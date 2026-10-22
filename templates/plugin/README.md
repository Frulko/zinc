# {{name}}

## Next steps

- `zinc dev`: runs it; every save shows at once.
- Change `example/main.ts` and save.
- Learn to draw and react to the keyboard and mouse: https://frulko.github.io/zinc/docs/learn/
- The guide: https://frulko.github.io/zinc/docs/guide/01-getting-started/

A Zinc plugin made from the `plugin` starter: a program imports it as `zinc:{{id}}`.

```ts
import { greet, checksum } from 'zinc:{{id}}';
greet('Ada');        // 'Hello, Ada!', in Zinc (index.ts)
checksum('hello');   // 1335831723, in C++ (native/{{id}}.host.cpp)
```

| Path | What it is |
|---|---|
| `plugin.json` | the manifest: name, module, version, targets, permissions, publisher ([docs/plugins.md](https://github.com/zinc-engine/zinc/blob/main/docs/plugins.md)) |
| `index.ts` | the API, compiled into every program that imports the plugin |
| `native/{{id}}.spec.ts` | the native part's interface; zinc generates the C++ class `Native{{ident}}` from it |
| `native/{{id}}.host.cpp` | its C++ for macOS and Linux, built with the pinned zig on first use |
| `native/{{id}}.sim.ts` | the same behaviour in Zinc, where no native code runs |
| `tests/` | `zinc test` runs every `*.test.ts` |
| `example/main.ts` | a program that uses the plugin (`zinc run`); `zinc.json` finds the plugin with `"pluginDirs": [".."]` |
| `.github/workflows/ci.yml` | CI: tests, binaries for four targets, signed releases |

## Develop

```sh
zinc run                      # example/main.ts with the plugin
zinc test                     # tests/*.test.ts on the native part
ZINC_NATIVE=sim zinc test     # the same tests on native/{{id}}.sim.ts: both must pass
zinc plugin-build {{id}}      # the native part alone, into ~/.zinc/cache
```

No C++ needed? Delete `native/`, and the import and `checksum` of `index.ts`: the plugin is then pure Zinc and nothing is compiled.
A system library goes in `plugin.json` under `targets.<target>`: `pkg` (pkg-config), `libs`, `frameworks`, and more C++ files in `sources`.
Capabilities the plugin needs (`net`, `fs`, `process`...) go in `"permissions"`: `zinc add` shows them and pins them in the project's lock.

## Use it from a project

```sh
zinc add gh:<you>/<repository>@v0.1.0   # from git, pinned to the tag's commit in zinc.lock
zinc plugins                            # lists zinc:{{id}} and its targets
```

## Publish a signed release

1. **A key.** `zinc update-keygen` prints `seed=...` and `public=...`. The seed is the secret that signs: store it in the repository's
   Settings, Secrets and variables, Actions, as `ZINC_PUBLISHER_SEED`, and nowhere else. The public key goes in `plugin.json`, so users
   check every release against it:

   ```json
   "publisher": { "name": "<your name>", "publicKey": "<public>" }
   ```

2. **CI.** `.github/workflows/ci.yml` runs Zinc's reusable workflow on every push and pull request: `zinc test`, then the native part
   built for `macos-arm64`, `linux-x86_64`, `linux-aarch64` and `linux-armhf` (32-bit Raspberry Pi OS), uploaded as the artifacts `index-<target>`
   in the plugin index's layout: `binaries/<target>/{{id}}-<key>.tar`, named by the cache key zinc computes for the same sources and
   engine, and the descriptor `plugins/{{id}}/<version>.json`. Its `zinc-ref` input (default `main`) picks the engine; binaries match only
   the engine they were built with.

3. **Release.** Set `"version"` in `plugin.json`, commit, and push a tag of the same version:

   ```sh
   git tag v0.1.0 && git push origin main v0.1.0
   ```

   The tag's run publishes a GitHub release: `{{id}}-0.1.0.tar.gz` (the sources), its signature `{{id}}-0.1.0.tar.gz.sig`, and
   `index-v0.1.0.tar` (the binaries and the descriptor, each signed). A tag that is not `v` + the version, or a repository without the
   `ZINC_PUBLISHER_SEED` secret, stops before anything is published and says why.

   The same release by hand, to try it before the first tag:

   ```sh
   git archive --prefix={{id}}/ -o {{id}}-0.1.0.tar.gz HEAD
   zinc sign {{id}}-0.1.0.tar.gz <seed>                      # writes {{id}}-0.1.0.tar.gz.sig
   zinc verify {{id}}-0.1.0.tar.gz --key <public>            # checks it
   zinc add file://$PWD/{{id}}-0.1.0.tar.gz ../some-project   # what users get from the release's URL
   ```

4. **Users** add the release by its URL:

   ```sh
   zinc add https://github.com/<you>/<repository>/releases/download/v0.1.0/{{id}}-0.1.0.tar.gz
   ```

   zinc fetches the `.sig` beside the archive, checks it with the publisher key of `plugin.json`, prints the tier (`community`) and the
   publisher before installing, and pins the archive's SHA-256 and the key in `zinc.lock`. A later release signed with another key is
   refused until the user runs `zinc trust {{id}}`. Community plugins are built from source on the user's machine.

5. **Verified.** To be listed in Zinc's index as a verified publisher (`zinc add {{id}}` by name, binaries used once independent rebuilds
   match), ask for a delegation of your public key; what each tier guarantees is in Zinc's
   [security guide](https://github.com/zinc-engine/zinc/blob/main/docs/guide/08-security.md), "Plugin distribution".

## Licence

Add a `LICENSE` file and a `"license"` in `plugin.json` before the first release.
