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
- **What an app is and what it uses.** Each row shows the app's description, author and size, and the permissions its zinc.json declares
  (`"permissions"`, [the security guide](../../docs/guide/08-security.md)) in plain words. Before an install, and before an update that
  asks for permissions not allowed before, a consent screen lists them with **Allow** / **Cancel**; nothing is downloaded before Allow. An
  app that declares no `"permissions"` is shown as one that can do what any program can, and asked for once. The answer is kept in
  `apps/<id>/granted`. The tablet does not enforce the list yet (`zinc run` warns only; `ZINC_PERMISSIONS=enforce` would make it refuse),
  so the screen says to allow only apps you trust.
- **Uninstall** (two taps: the first turns it into **Confirm uninstall**) removes the app's tiles, its package and the hub's record of it;
  what the app saved stays. A running app is refused until it is stopped (Running). Settings › **Clean up AppLoad** removes the `zinc-*`
  tiles whose `.zapp` is gone and leaves every other tile alone.
- **Check for updates** (at start and with its button) runs in the background: its result, or "Server unreachable: …", goes to the
  status band and the Hub stays usable meanwhile.
- **Every other action** (pairing, installing, updating, rolling back, uninstalling, the engine, cleaning AppLoad, stopping, opening an
  app, the Hub's own restart) shows a modal with its title and current step that cannot be closed and takes every tap until it ends; a
  failure stays in it with **OK**. The top bar stays usable.
- **Its widget**: Accueil shows the Hub as an AppLoad card (zinc:remarkable `RemarkableApp`, 700 x 420) with the number of updates
  waiting (apps and engine) and the apps not responding, each with **Stop**; the card's header opens the Hub. As a widget it checks for
  updates every 30 minutes.
- **Info** shows the Hub's and the engine's versions, the server, the tablet (model, system, uptime, kernel), its battery and the Marker's,
  free memory and storage, read again each time the page opens.
- **The Hub itself** (`dev.zinc.hub`, its row says "this app" and has no Open) updates like any app, then hands its new package to its tile's launcher and quits: it opens again on
  the new version.
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

## Running apps

The **Running** tab lists the Zinc apps running on the tablet: one line each with its state, CPU (% of one core over the last 5 s), memory
(RSS), uptime and whether it is hidden or a widget, and **Stop** (SIGTERM, so the app saves as when it quits; SIGKILL after 3 s). It reads
what `zinc-app` and its watcher leave in `$TMPDIR` (`/tmp`): `zinc-app-<path>.pid` (the pid, whose `/proc/<pid>/cmdline` must still be a
zinc, else the stale file is removed) and `zinc-app-<path>.watch`, the line `zinc-watch` writes every 5 s
(`integrations/remarkable-engine/zinc-watch.c`, `docs/targets/remarkable-paper-pro.md` "Stuck apps"). States: **OK**, **Busy** (half a core
or more for 30 s), **Not responding** (no heartbeat from its frame loop for 10 s), **Hidden but using the CPU** (5% or more for 5 minutes
while minimized), **Using a lot of memory** (over 768 MB). An app that is not responding shows at the top of every page with **Stop** and
**Wait** (Wait leaves it alone for this session). The list is read again every 3 s while the hub shows, and redrawn only when it changed.

## Files

| Path | What |
| --- | --- |
| `~/.zinc/hub/hub.conf` (`ZINC_HUB_DIR`) | server, server key, device token (mode 600), the channel of each app |
| `~/.zinc/hub/apps/<id>/` | `installed`, `previous` and `previous.zapp` (what Rollback brings back), `icon.png` (the list's icon), `granted` (the permissions allowed, one per line, `*` for an app that declares none) |
| `~/zinc-apps/<name>.zapp` (`ZINC_HUB_APPS`) | the installed package, the one its tile `zinc-<name>` runs |
| `~/zinc/bin/zinc-tile` (`ZINC_HUB_TILE`) | makes the tile; absent on a desktop, where installing makes no tile |
| `~/zinc` (`ZINC_RMPP_ENGINE`) | the engine an update replaces (`zinc.download.tar.gz`, `zinc.new`, `zinc.old` only during one); unset on a desktop: no engine updates |

`src/`: `main.tsx` (the shell), `state.ts` (the actions), `services/server.ts` (pairing, catalog, download and their checks),
`services/installs.ts` (install, rollback, tiles), `services/permissions.ts` (the consent words and record), `services/running.ts` (the Running page's apps and Stop), `services/config.ts`, `pages/`,
`components/`, `script.ts` (`ZINC_HUB_SCRIPT`, the test mode of `tests/t1/hub_app.sh` and `tests/t1/hub_running.sh`). The signature, SHA-256 and version code is `app/hub-server/src/protocol.ts`, shared with the server.
`icon.svg` (zinc.json `app.icon`) is Lucide's `layout-grid` (lucide-static 0.462.0, ISC licence, https://lucide.dev/license), drawn black at stroke width 2.5.
