# async-storage (`@react-native-async-storage/async-storage`, `zinc:async-storage`)

## What it is
React Native's AsyncStorage (v2 API) on `zinc:storage`: a small key/value store that survives restarts, so an RN-style app saves its settings with the code it already has.

## Targets and status
- plugin.json: macos, linux, android, ios, windows, rpi1, rmpp, webos, esp32 (pure Zinc over `zinc:storage`; file on desktops, NVS on ESP32). Registers the npm module name `@react-native-async-storage/async-storage` and `zinc:async-storage`.
- Not verified per target in any doc. backlog/later.md D123 says the manifest lacked android (now listed, so the line may be stale). Web is not listed.
- Test: `tests/t0/async_storage.sh` (`plugins/async-storage/tests/async_storage.ts`, fresh store via `ZINC_STORAGE`).
- Users: examples/music (main.ts, weather.ts), music-tree (state.ts, weather-service.ts).
- Later: shared `~/.zinc/storage.kv` on a desktop for every program (store per project needed).

## What the docs have
- [ ] Overview: there is NO `docs/plugins/async-storage.md`, although tests/affected.json lists that path
- [ ] Install/requirements
- [ ] Quick start
- [ ] API reference
- [ ] Example code (only the header comment of index.ts and the test)
- [~] Runnable example: examples/music and music-tree use it, not as a demo of it
- [ ] Screenshot/GIF
- [ ] Tutorial
- [ ] Commands
- [ ] Notes (prefix `@async/`, empty-string marker, no v1 callbacks, shared file)
- [x] Test
- docs/react-native.md and docs/plugins.md do not mention it (grep finds nothing).

## What is missing
1. Create docs/plugins/async-storage.md: what/why, import line `import AsyncStorage from '@react-native-async-storage/async-storage'`, targets table, storage location per target (`~/.zinc/storage.kv`, `ZINC_STORAGE`, NVS on ESP32).
2. API table: getItem, setItem, removeItem, mergeItem (deep merge for objects, arrays replaced), clear, getAllKeys, multiGet, multiSet, multiRemove, multiMerge, flushGetRequests (no-op). Return shapes.
3. Differences from the npm package: Promises only (v1 callbacks left out), no `useAsyncStorage` hook, no `createAsyncStorage`/multi-store (v3), no size limit enforcement, strings only, a prefix `@async/` and a `=` marker so an empty string is not `null`.
4. Quick start with a settings load/save (take examples/music/src/main.ts lines 72-75), and a "persist a counter" 5-step tutorial.
5. Caveat box: two programs on one desktop share `storage.kv` (clear() only removes the plugin's own keys); sandboxing note from docs/guide/08-security.md (file mode 0600).
6. Add a row in docs/react-native.md and docs/plugins.md index.
7. Screenshot of examples/music saving the last slide then restoring it (two frames, `ZINC_SHOT`), optional.
8. Verify and state web, android, ios behaviour of `zinc:storage` (hardware/owner): the plugin lists android and ios; web is absent.
9. Add the doc path to the test's header comment; the test header says "the plugin's check" only.
10. Performance/size notes: each call rewrites the whole file? (check `zinc:storage` implementation before writing).

## Wrong or stale
- tests/affected.json maps `docs/plugins/async-storage.md`, a file that does not exist.
- backlog/later.md D123 says the manifest lacks android; plugin.json now lists android, ios and others (the later line can be dropped once `zinc lint` is clean).
- index.ts comment says "(v2 API)" but the package's current version is v2.x with `useAsyncStorage`; unsupported and not documented.

## Suggested pages
- API: async-storage (generated; listed under React Native compat)
- Guide: Saving data between runs (zinc:storage and AsyncStorage)
- Steps: Persist app settings in 5 steps
- Examples: music (last slide and lamp), music-tree
- Notes: Where the data lives, shared storage and prefixes, differences from the npm package
