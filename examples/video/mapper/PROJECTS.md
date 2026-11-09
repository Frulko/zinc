# Projects and delivery

A project folder contains `mapping.json`, `show.json`, `scenes/` and `media/`.
The native editor's Project view can create or select a folder, then open it on a
player connected through `localhost`, `127.0.0.1` or `::1`. Selecting a folder alone
does not switch the player. The current player's project is shown separately;
**Save now** waits for this editor's pending commands and show changes before saving.

Opening first checks the saved mapping, show, scenes and referenced media. It saves
the previous project, switches the content and remembers the new folder in
`active-project.json`. A failed switch restores the previous project, including
local video time, speed and pause. Undo starts fresh for the new project. Uploads
must finish before switching. Pairing tokens, fleet configuration and volume stay
in the device's startup folder. That folder is locked for the player's lifetime,
using the system plugin's native instance lock; a second player needs its own
device folder (`--device-root PATH`). `--project PATH` overrides the remembered project at startup.

In Delivery, the selected local folder is reused for assembly and rendering.
Assembly copies to a new folder and keeps the originals. Stop the source player
before assembly so that independently saved mapping and show files form one
consistent snapshot. Rendering accepts column **0** for the saved mapping or
**1 and up** for a show column. Animated rendering allows up to four videos,
120 frames and 1920×1080, without sound or transitions. The default 4 seconds at
30 fps fits that limit. Existing output files are not overwritten.

## Boundaries

- The folder picker belongs to the editor's computer. It does not browse a remote
  player's disk. Browsers can inspect and save the connected player's project,
  but assembling and rendering require the native editor.
- Android's native compositor currently resolves media from its startup folder;
  changing that folder is rejected explicitly until its media-root API exists.
- Each HTTP edit carries the `projectEpoch` obtained from `/state` in an
  `x-mapper-project` header, alongside the pairing token. Opening a project or
  restarting the player changes this epoch. A stale or missing header returns
  HTTP 409 with `code: "project_changed"`; the editor drops pending commands and
  asks to reconnect, never replaying them into the new project. Pairing and GET
  requests do not need the epoch. Scripts must read `/state` before editing and
  must not blindly retry a rejected mutation with a new epoch.
- Two different device folders must not edit the same project folder concurrently.
- File collection does not include device credentials or fleet configuration.

## Evidence and proposed checks

The development Mac ran the real native player against authenticated HTTP calls:
open A, force a pointer write failure, verify rollback to A, open/save B, restart
without `--project`, verify B and unchanged pairing token. The Delivery handler
ran its real Python/Zinc/FFmpeg pipeline with native simulated file dialogs: a
selected show column containing two videos produced a 320×180, 3 fps, three-frame
MP4. `zinc check` passed for the editor and mapper with a clean standard library.

A real paused video retained its displayed time (0.333 s), speed (1.5) and pause
after a forced pointer-write failure. Authenticated HTTP requests with delayed
OSC, show and scene bodies were rejected after a switch; an unfinished media
upload blocked switching. A focused client fixture checks stale queue removal,
header propagation, own-open adoption and delayed read/upload responses. Web
export completes with the active project controls included.

Proposed milestone checks: concurrent editors during project switch; interrupted
copy and disk-full assembly; native/browser UI keyboard walkthrough; Android media
root support; two device folders opening the same project; long video rollback.

The copy-only assembly workflow follows [Resolume's Media Manager](https://resolume.com/support/en/media-manager):
collect the composition and media together without removing the source files.
