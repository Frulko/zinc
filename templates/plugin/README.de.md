# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `example/main.ts` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/

Ein Zinc-Plugin aus dem Starter `plugin`: Ein Programm importiert es als `zinc:{{id}}`.

```ts
import { greet, checksum } from 'zinc:{{id}}';
greet('Ada');        // 'Hello, Ada!', in Zinc (index.ts)
checksum('hello');   // 1335831723, in C++ (native/{{id}}.host.cpp)
```

| Pfad | Was es ist |
|---|---|
| `plugin.json` | das Manifest: Name, Modul, Version, Ziele, Berechtigungen, Herausgeber ([docs/plugins.md](https://github.com/zinc-engine/zinc/blob/main/docs/plugins.md)) |
| `index.ts` | die API, in jedes Programm einkompiliert, das das Plugin importiert |
| `native/{{id}}.spec.ts` | die Schnittstelle des nativen Teils; zinc erzeugt daraus die C++-Klasse `Native{{ident}}` |
| `native/{{id}}.host.cpp` | sein C++ für macOS und Linux, beim ersten Gebrauch mit dem festgelegten zig gebaut |
| `native/{{id}}.sim.ts` | dasselbe Verhalten in Zinc, wo kein nativer Code läuft |
| `tests/` | `zinc test` führt jede `*.test.ts` aus |
| `example/main.ts` | ein Programm, das das Plugin benutzt (`zinc run`); `zinc.json` findet das Plugin mit `"pluginDirs": [".."]` |
| `.github/workflows/ci.yml` | CI: Tests, Binärdateien für vier Ziele, signierte Releases |

## Entwickeln

```sh
zinc run                      # example/main.ts with the plugin
zinc test                     # tests/*.test.ts on the native part
ZINC_NATIVE=sim zinc test     # the same tests on native/{{id}}.sim.ts: both must pass
zinc plugin-build {{id}}      # the native part alone, into ~/.zinc/cache
```

Kein C++ nötig? Lösche `native/` sowie den Import und `checksum` in `index.ts`: Das Plugin ist dann reines Zinc, und nichts wird kompiliert.
Eine Systembibliothek kommt in `plugin.json` unter `targets.<target>`: `pkg` (pkg-config), `libs`, `frameworks`, und weitere C++-Dateien in `sources`.
Fähigkeiten, die das Plugin braucht (`net`, `fs`, `process` ...), kommen in `"permissions"`: `zinc add` zeigt sie an und hält sie in der Lock-Datei des Projekts fest.

## Aus einem Projekt benutzen

```sh
zinc add gh:<you>/<repository>@v0.1.0   # from git, pinned to the tag's commit in zinc.lock
zinc plugins                            # lists zinc:{{id}} and its targets
```

## Ein signiertes Release veröffentlichen

1. **Ein Schlüssel.** `zinc update-keygen` gibt `seed=...` und `public=...` aus. Der Seed ist das Geheimnis, das signiert: Speichere ihn in den
   Settings des Repositorys, Secrets and variables, Actions, als `ZINC_PUBLISHER_SEED`, und sonst nirgends. Der öffentliche Schlüssel kommt in `plugin.json`, damit Nutzer
   jedes Release dagegen prüfen:

   ```json
   "publisher": { "name": "<your name>", "publicKey": "<public>" }
   ```

2. **CI.** `.github/workflows/ci.yml` führt bei jedem Push und Pull Request den wiederverwendbaren Workflow von Zinc aus: `zinc test`, dann den nativen Teil,
   gebaut für `macos-arm64`, `linux-x86_64`, `linux-aarch64` und `linux-armhf` (32-Bit-Raspberry-Pi-OS), hochgeladen als die Artefakte `index-<target>`
   im Layout des Plugin-Index: `binaries/<target>/{{id}}-<key>.tar`, benannt nach dem Cache-Schlüssel, den zinc für dieselben Quellen und
   dieselbe Engine berechnet, und dem Descriptor `plugins/{{id}}/<version>.json`. Seine Eingabe `zinc-ref` (Standard `main`) wählt die Engine; Binärdateien passen nur zu
   der Engine, mit der sie gebaut wurden.

3. **Release.** Setze `"version"` in `plugin.json`, committe und pushe ein Tag derselben Version:

   ```sh
   git tag v0.1.0 && git push origin main v0.1.0
   ```

   Der Lauf des Tags veröffentlicht ein GitHub-Release: `{{id}}-0.1.0.tar.gz` (die Quellen), seine Signatur `{{id}}-0.1.0.tar.gz.sig` und
   `index-v0.1.0.tar` (die Binärdateien und den Descriptor, jeweils signiert). Ein Tag, das nicht `v` + die Version ist, oder ein Repository ohne das
   Secret `ZINC_PUBLISHER_SEED` hält an, bevor etwas veröffentlicht wird, und sagt, warum.

   Dasselbe Release von Hand, um es vor dem ersten Tag auszuprobieren:

   ```sh
   git archive --prefix={{id}}/ -o {{id}}-0.1.0.tar.gz HEAD
   zinc sign {{id}}-0.1.0.tar.gz <seed>                      # writes {{id}}-0.1.0.tar.gz.sig
   zinc verify {{id}}-0.1.0.tar.gz --key <public>            # checks it
   zinc add file://$PWD/{{id}}-0.1.0.tar.gz ../some-project   # what users get from the release's URL
   ```

4. **Nutzer** fügen das Release über seine URL hinzu:

   ```sh
   zinc add https://github.com/<you>/<repository>/releases/download/v0.1.0/{{id}}-0.1.0.tar.gz
   ```

   zinc holt die `.sig` neben dem Archiv, prüft sie mit dem Herausgeber-Schlüssel aus `plugin.json`, gibt die Stufe (`community`) und den
   Herausgeber aus, bevor es installiert, und hält die SHA-256-Summe des Archivs und den Schlüssel in `zinc.lock` fest. Ein späteres Release, das mit einem anderen Schlüssel signiert ist, wird
   abgelehnt, bis der Nutzer `zinc trust {{id}}` ausführt. Community-Plugins werden auf dem Rechner des Nutzers aus den Quellen gebaut.

5. **Verifiziert.** Um im Index von Zinc als verifizierter Herausgeber aufgeführt zu werden (`zinc add {{id}}` mit dem Namen, Binärdateien werden benutzt, sobald unabhängige Neubauten
   übereinstimmen), bitte um eine Delegation deines öffentlichen Schlüssels; was jede Stufe garantiert, steht im
   [Sicherheitsleitfaden](https://github.com/zinc-engine/zinc/blob/main/docs/guide/08-security.md) von Zinc unter "Plugin distribution".

## Lizenz

Füge vor dem ersten Release eine Datei `LICENSE` und eine `"license"` in `plugin.json` hinzu.
