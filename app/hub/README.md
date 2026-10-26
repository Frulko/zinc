# Zinc Hub

The app store of the reMarkable Paper Pro: it pairs with a hub server (`app/hub-server`), lists its apps, installs, updates and rolls them
back, and gives each installed app its own AppLoad tile (`zinc-tile` of the engine on the tablet). Black on white, large targets, no
animation; the on-screen keyboard types the server address and the pairing code.

## Run it

```sh
zinc run app/hub-server -- --data hub-data          # on the Mac: prints the server key and a pairing code
zinc publish <app> --key <seed> --hub http://127.0.0.1:8787 --token "$(cat hub-data/publisher.token)"
zinc run app/hub                                    # the e-ink emulator at 1620x2160 (or the tablet, below)
```

On the tablet (the engine of ZN-841 in `/home/root/zinc`): `zinc pack app/hub`, copy `hub.zapp` to `/home/root/zinc-apps`, then
`/home/root/zinc/bin/zinc-tile /home/root/zinc-apps/hub.zapp` and reload AppLoad. In **Settings**, set the server (the Mac is
`http://10.11.99.2:8787` over USB), type the pairing code and check that the server key shown starts like the one the server printed.

## What it checks

- The catalog is signed by the server key pinned at pairing; the app's manifest by the app's key the catalog lists; the `.zapp` has the
  manifest's SHA-256; the manifest is the version the catalog offers. Any mismatch is refused with a message, and nothing is replaced.
- An update never goes to an older or equal version (a server cannot downgrade an app). **Rollback** puts back the package the last update
  replaced (its SHA-256 checked again); **Update** brings the newer one back.
- A package the tablet's engine cannot run is not downloaded: the signed catalog lists what each one needs (`zbc`, `rt`: the `needs` of
  its manifest, `docs/zapp.md`), the hub compares them with its engine (`ZINC_ENGINE_ZBC`, `ZINC_ENGINE_RT`) and says "Needs a newer engine:
  update the engine on the tablet". `ZINC_HUB_ENGINE_RT` plays an older engine in the tests.
- **The engine itself** comes from the hub too. The publisher sends the bundle of `tools/rmpp-engine` to the server
  (`tools/rmpp-engine --publish <hub> --token <t>`); the signed catalog lists its version, `zbc`, `rt`, SHA-256 and size. When it runs more
  than the tablet's engine (more runtime calls, or a newer version for the same ones; another ZBC version is never offered, since every app
  would have to be packed again), the list starts with **Update the engine**, and "Needs a newer engine" says to tap it. The hub downloads
  the bundle beside the engine directory (`ZINC_RMPP_ENGINE`, which `zinc-app` sets: `/home/root/zinc`), checks the SHA-256 and the size,
  unpacks it into `zinc.new` (BusyBox `tar`), runs the new `bin/zinc --engine-info`, which must answer the catalog's version, `zbc` and
  `rt`, then swaps `zinc` -> `zinc.old`, the new one -> `zinc` and removes `zinc.old`. Any failure keeps the old engine and says why. The hub
  keeps running on the engine it started with: close it and open it again. The engine is trusted by the server key pinned at pairing (there
  is no publisher key for it); xochitl is never touched.
- Each app follows **stable** or **beta** (the Channel button when the server has both). Updates are checked at start.
- Each row shows the app's icon (the `icon.png` that `zinc pack` puts in the package from zinc.json `app.icon`): the server lists it with its
  SHA-256 in the signed catalog, the hub caches it and checks it against that hash; an app without one, or whose icon does not match, shows
  a framed initial.

## Files

| Path | What |
| --- | --- |
| `~/.zinc/hub/hub.conf` (`ZINC_HUB_DIR`) | server, server key, device token (mode 600), the channel of each app |
| `~/.zinc/hub/apps/<id>/` | `installed`, `previous` and `previous.zapp` (what Rollback brings back), `icon.png` (the list's icon) |
| `~/zinc-apps/<name>.zapp` (`ZINC_HUB_APPS`) | the installed package, the one its tile `zinc-<name>` runs |
| `~/zinc/bin/zinc-tile` (`ZINC_HUB_TILE`) | makes the tile; absent on a desktop, where installing makes no tile |
| `~/zinc` (`ZINC_RMPP_ENGINE`) | the engine an update replaces (`zinc.download.tar.gz`, `zinc.new`, `zinc.old` only during one); unset on a desktop: no engine updates |

`src/`: `main.tsx` (the shell), `state.ts` (the actions), `services/server.ts` (pairing, catalog, download and their checks),
`services/installs.ts` (install, rollback, tiles), `services/config.ts`, `pages/`, `components/`, `script.ts` (`ZINC_HUB_SCRIPT`, the test
mode of `tests/t1/hub_app.sh`). The signature, SHA-256 and version code is `app/hub-server/src/protocol.ts`, shared with the server.
`icon.svg` (zinc.json `app.icon`) is Lucide's `layout-grid` (lucide-static 0.462.0, ISC licence, https://lucide.dev/license), drawn black at stroke width 2.5.
