# AppLoad window-state patch

`0001-window-state.patch` adds to [AppLoad](https://github.com/asivery/rm-appload) v0.6.0 a way for a qtfb client to
minimize and restore its own window and to know when it is hidden. A Zinc app on the reMarkable Paper Pro uses it for
its "Home" button: the app minimizes itself, xochitl is usable again, and the app keeps running.
The patch also applies cleanly on AppLoad master (df974a6, 2026-10).

## Protocol

Added to `src/qtfb/common.h`; every existing message is unchanged.

| Name | Value | Direction | Payload |
|---|---|---|---|
| `MESSAGE_SET_WINDOW_STATE` | 9 | client to server | `int windowState` in `ClientMessage`'s union (same slot as `refreshMode`): `WINDOW_STATE_MINIMIZE` 0, `WINDOW_STATE_RESTORE` 1 |
| `STATE_CHANGED_REASON_VISIBILITY` | 1 | server to client | `DeviceStateChangedContents.visibility.visible`: 1 shown, 0 minimized |

- Minimize does what the window's "_" button does: it leaves fullscreen first, then minimizes. Restore un-minimizes and,
  for an app with `disablesWindowedMode` that was fullscreen when it minimized itself, goes back to fullscreen.
- The server sends the visibility state in the initial state packets (`MESSAGE_DEVICE_STATE_INIT`, after the rotation
  one) and with `MESSAGE_DEVICE_STATE_CHANGED` each time the window is minimized or restored, by the client or by the user.
- An unmodified AppLoad drops a client that sends an unknown message type. A client therefore sends
  `MESSAGE_SET_WINDOW_STATE` only after it received a `MESSAGE_DEVICE_STATE_INIT` with reason 1.
- A value other than 0 or 1 is refused like an invalid refresh mode (the client is disconnected).
- The "_" button now also shows while a window is minimized, so a fullscreen-only app (whose topbar has no "_" button)
  that minimized itself can be brought back by the user.

## Build

```sh
integrations/remarkable-engine/appload/build.sh    # writes dist/rmpp/appload-window.so
```

It follows AppLoad's own CI (`.github/workflows/build-release.yml`): AppLoad `v0.6.0` plus the patch, xovi at a pinned
commit, `xovi/make.sh` inside `eeems/remarkable-toolchain:latest-rmpp` pinned by digest. Needs Docker and git; a few
minutes on an M1. First build (2026-10-25): sha256 `46ec75d1b65a6fd54ec2ec98d2918db524976140ac87fd6bde3995f5cb8580e1`.
The result is an aarch64 ELF with the same xovi entry points (`_xovi_construct`, `_xovi_depconstruct`,
`LINKTABLENAMES`, `LINKTABLEVALUES`), the same imports and the same `NEEDED` libraries as the 0.6.0 release asset, plus
three new `FBController` symbols.

## Install on the Paper Pro

```sh
scp dist/rmpp/appload-window.so root@10.11.99.1:/home/root/xovi/extensions.d/appload.so.new
ssh root@10.11.99.1 '
  cd /home/root/xovi/extensions.d &&
  [ -f appload.so.0.6.0 ] || cp appload.so appload.so.0.6.0 &&
  mv appload.so.new appload.so'
ssh root@10.11.99.1 /home/root/xovi/start          # ONCE (it restarts xochitl); then wait for the UI
```

Go back to 0.6.0: `cp appload.so.0.6.0 appload.so` in the same directory, then one `xovi/start`
(see `docs/targets/remarkable-paper-pro.md`, "Safety rules").

## Upstream pull request

Title: `qtfb: let a client minimize/restore its window and learn its visibility`

> This adds a small, backward-compatible extension to the qtfb protocol so a client can send its own window to the
> background and know when it is hidden (for example a "Home" button in a full-screen app that keeps running).
>
> - `MESSAGE_SET_WINDOW_STATE` (9), with an `int windowState` in the `ClientMessage` union: 0 minimizes (leaving
>   fullscreen first, as the "_" button does), 1 restores (back to fullscreen for apps with `disablesWindowedMode`).
> - `STATE_CHANGED_REASON_VISIBILITY` (1) with `visibility.visible`: sent in the initial state packets and on every
>   minimize/restore, so a client learns both its visibility and that the server supports message 9 (older servers
>   drop clients sending unknown types, so clients should wait for reason 1 before sending it).
> - The "_" button stays visible on a minimized window so a fullscreen-only app that minimized itself can be restored.
>
> Tested by building with the release workflow's toolchain image; the exported xovi entry points are unchanged.

The owner opens it from a fork (nothing is pushed by the build):

```sh
gh repo fork asivery/rm-appload --clone && cd rm-appload
git checkout -b qtfb-window-state origin/master
git am ../zinc/integrations/remarkable-engine/appload/0001-window-state.patch
git push -u origin qtfb-window-state
gh pr create -R asivery/rm-appload --base master --head <your-user>:qtfb-window-state \
  --title "qtfb: let a client minimize/restore its window and learn its visibility" --body-file pr.md
```

(`pr.md`: the quoted text above.)
