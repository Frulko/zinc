# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `example/main.ts` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/

Un plugin Zinc fatto con lo starter `plugin`: un programma lo importa come `zinc:{{id}}`.

```ts
import { greet, checksum } from 'zinc:{{id}}';
greet('Ada');        // 'Hello, Ada!', in Zinc (index.ts)
checksum('hello');   // 1335831723, in C++ (native/{{id}}.host.cpp)
```

| Percorso | Cos'è |
|---|---|
| `plugin.json` | il manifesto: nome, modulo, versione, target, permessi, autore ([docs/plugins.md](https://github.com/zinc-engine/zinc/blob/main/docs/plugins.md)) |
| `index.ts` | l'API, compilata in ogni programma che importa il plugin |
| `native/{{id}}.spec.ts` | l'interfaccia della parte nativa; zinc genera da essa la classe C++ `Native{{ident}}` |
| `native/{{id}}.host.cpp` | il suo C++ per macOS e Linux, compilato con zig fissato al primo uso |
| `native/{{id}}.sim.ts` | lo stesso comportamento in Zinc, dove non gira codice nativo |
| `tests/` | `zinc test` esegue ogni `*.test.ts` |
| `example/main.ts` | un programma che usa il plugin (`zinc run`); `zinc.json` trova il plugin con `"pluginDirs": [".."]` |
| `.github/workflows/ci.yml` | CI: test, binari per quattro target, rilasci firmati |

## Sviluppa

```sh
zinc run                      # example/main.ts with the plugin
zinc test                     # tests/*.test.ts on the native part
ZINC_NATIVE=sim zinc test     # the same tests on native/{{id}}.sim.ts: both must pass
zinc plugin-build {{id}}      # the native part alone, into ~/.zinc/cache
```

Non ti serve il C++? Elimina `native/`, e l'import e `checksum` di `index.ts`: il plugin è allora Zinc puro e non si compila nulla.
Una libreria di sistema va in `plugin.json` sotto `targets.<target>`: `pkg` (pkg-config), `libs`, `frameworks`, e altri file C++ in `sources`.
Le capacità di cui il plugin ha bisogno (`net`, `fs`, `process`...) vanno in `"permissions"`: `zinc add` le mostra e le fissa nel lock del progetto.

## Usalo da un progetto

```sh
zinc add gh:<you>/<repository>@v0.1.0   # from git, pinned to the tag's commit in zinc.lock
zinc plugins                            # lists zinc:{{id}} and its targets
```

## Pubblica un rilascio firmato

1. **Una chiave.** `zinc update-keygen` stampa `seed=...` e `public=...`. Il seed è il segreto che firma: conservalo nelle
   Settings del repository, Secrets and variables, Actions, come `ZINC_PUBLISHER_SEED`, e da nessun'altra parte. La chiave pubblica va in `plugin.json`, così gli utenti
   controllano ogni rilascio con essa:

   ```json
   "publisher": { "name": "<your name>", "publicKey": "<public>" }
   ```

2. **CI.** `.github/workflows/ci.yml` esegue il workflow riutilizzabile di Zinc a ogni push e pull request: `zinc test`, poi la parte nativa
   compilata per `macos-arm64`, `linux-x86_64`, `linux-aarch64` e `linux-armhf` (Raspberry Pi OS a 32 bit), caricata come artefatti `index-<target>`
   nella struttura dell'indice dei plugin: `binaries/<target>/{{id}}-<key>.tar`, con il nome della chiave di cache che zinc calcola per gli stessi sorgenti e
   lo stesso motore, e il descrittore `plugins/{{id}}/<version>.json`. Il suo input `zinc-ref` (predefinito `main`) sceglie il motore; i binari corrispondono solo
   al motore con cui sono stati compilati.

3. **Rilascio.** Imposta `"version"` in `plugin.json`, fai il commit e invia un tag con la stessa versione:

   ```sh
   git tag v0.1.0 && git push origin main v0.1.0
   ```

   L'esecuzione del tag pubblica un rilascio GitHub: `{{id}}-0.1.0.tar.gz` (i sorgenti), la sua firma `{{id}}-0.1.0.tar.gz.sig`, e
   `index-v0.1.0.tar` (i binari e il descrittore, ciascuno firmato). Un tag che non è `v` + la versione, o un repository senza il segreto
   `ZINC_PUBLISHER_SEED`, si ferma prima di pubblicare qualsiasi cosa e ne spiega il motivo.

   Lo stesso rilascio a mano, per provarlo prima del primo tag:

   ```sh
   git archive --prefix={{id}}/ -o {{id}}-0.1.0.tar.gz HEAD
   zinc sign {{id}}-0.1.0.tar.gz <seed>                      # writes {{id}}-0.1.0.tar.gz.sig
   zinc verify {{id}}-0.1.0.tar.gz --key <public>            # checks it
   zinc add file://$PWD/{{id}}-0.1.0.tar.gz ../some-project   # what users get from the release's URL
   ```

4. **Gli utenti** aggiungono il rilascio dal suo URL:

   ```sh
   zinc add https://github.com/<you>/<repository>/releases/download/v0.1.0/{{id}}-0.1.0.tar.gz
   ```

   zinc scarica il `.sig` accanto all'archivio, lo controlla con la chiave dell'autore di `plugin.json`, stampa il livello (`community`) e l'
   autore prima di installare, e fissa lo SHA-256 dell'archivio e la chiave in `zinc.lock`. Un rilascio successivo firmato con un'altra chiave viene
   rifiutato finché l'utente non esegue `zinc trust {{id}}`. I plugin della community si compilano dai sorgenti sulla macchina dell'utente.

5. **Verificato.** Per comparire nell'indice di Zinc come autore verificato (`zinc add {{id}}` per nome, binari usati quando ricompilazioni
   indipendenti coincidono), chiedi una delega per la tua chiave pubblica; cosa garantisce ogni livello è nella
   [guida alla sicurezza](https://github.com/zinc-engine/zinc/blob/main/docs/guide/08-security.md) di Zinc, "Plugin distribution".

## Licenza

Aggiungi un file `LICENSE` e una `"license"` in `plugin.json` prima del primo rilascio.
