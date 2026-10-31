# Zinc Pi Image

A window for `tools/pi-image`, in the calm style of macOS System Settings: a slim sidebar with the four steps of the flow
(**Device**, **Network and account**, **Apps and options**, **Build**), and a centered column of inset lists on a neutral
palette with system blue as the only accent. Each page ends with Back and Continue; the last settings page leads to **Build**.
Compact corners and flat checkboxes keep the controls suited to a desktop tool, without mobile-style switches. Narrower windows
stack each row's label above its control.

- **Device**: board, screen, Bluetooth, image name, hostname, time zone, keyboard.
- **Network and account**: Wi-Fi, user, password, SSH and public keys (no password is ever displayed).
- **Apps and options**: the **Zinc shell** (boots to a home screen with a top bar, app hub and store: `shell` in the profile,
  which writes `ZINC_SHELL=1` into `/etc/zinc/session.conf`), the **app at boot** (kiosk), the **Zinc agent** (pair, deploy and read
  logs from a Mac); behind **Advanced**: **A/B system updates** (`ab`), boot messages on screen, free space (`growMiB`),
  libraries and more packages.
- **Build** is the center of the experience. Idle, it shows **Your image** (Zinc version, board, screen, network, account,
  options). While it runs, the list of steps (done, running with a spinner, pending, failed), a large percentage with a progress
  bar, and the running step's MiB and time left. At the end, a result card (file, size, **Open Imager**, **Show file**, what to do
  next) or the failed step with the error and **Retry**. The raw output sits in a **Details** drawer.

```sh
zinc run image/builder
```

Every change is saved at once to `~/.zinc/pi-image/profile.json` (readable by its owner only: it holds a password and a Wi-Fi key),
the profile the builder passes to `tools/pi-image build`; keys the builder does not show (`base`, `zinc`) are kept. Reopening the
app restores these last settings. Saving replaces the complete file atomically; a failure is shown above the settings and blocks
the build until the profile can be saved.

**Save as…** stores a named snapshot of all current settings in `presets.json` beside the profile (also readable by its owner
only). This includes Wi-Fi/login passwords, SSH keys, the app and any pinned base/engine settings. Selecting a saved preset restores
the whole snapshot and makes it the automatically saved last settings. A successful save clears a previous save-related build error.
Names must be nonempty and unique; an existing preset is
never overwritten. The name dialog supports Enter, Escape and Cancel. Select lists float above cards and neighbouring fields,
and close on selection, Escape or a press outside.

"Build the image" runs the tool
and follows the lines it prints for apps (`::step`, `::error`, `::done`); "Stop" stops its container. The environment can move
things (the test does): `ZINC_PI_IMAGE_ROOT`, `ZINC_PI_IMAGE_TOOL`, `ZINC_PI_IMAGE_PROFILE`.

The output (the **Details** drawer, closed until opened) follows new lines while its bottom is visible. Scroll up to read earlier lines without being pulled back; **Latest output**
returns to the bottom and resumes following. Up to 400 lines are shown. Steps and errors stand out; the steps, percentage and
finished image actions stay above the output. **Show file** reveals the image; **Open Imager** launches Raspberry Pi Imager or its download page.

During a build, the running step shows a rotating ring, also in the sidebar. The progress bar eases between reported steps over
280 ms; it never advances without a new step. The ring is removed on completion/failure, and reduced motion keeps it still and
applies progress updates immediately. Steps not reached yet are named as the build usually names them.

## Layout of `src/`

```text
src/
├── main.tsx            # mounts the workspace
├── theme.ts            # the palette of the kit's controls (blue accent, slate grays)
├── constants.ts        # the build protocol, limits, paths of the Mac
├── state.ts            # the profile being edited, the build, their actions
├── services/           # paths, catalog (image/catalog.json), profile (load, save), build (runs tools/pi-image)
├── components/         # group (inset lists, rows, checkboxes), presets, progress bar, log view
└── pages/              # workspace (sidebar), settings (the three form pages), build (steps, result, log)
```

Proof: `tests/t1/pi_image_builder.sh` (a scripted session against a fake `tools/pi-image`), `tests/t0/pi_image_presets.sh`
(private snapshots, unknown keys and failed writes), `tests/t1/pi_image_builder_log.sh` (follow, reading older lines and pointer resume),
`tests/t0/pi_builder_motion.sh` (rotation, step easing, completion/failure cleanup and reduced motion),
`tests/t1/pi_image_builder_steps.sh` (the shell and A/B options saved, the live steps view, `ZINC_SHELL=1` in the image's session settings),
`tests/t1/pi_image_builder_presets.sh` (real dropdown pointer hits beyond
the card, preset save/load, errors and a cold app restart), and `tests/t1/nuxt_ui.sh` for the shared select component.
