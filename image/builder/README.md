# Zinc Pi Image

A window for `tools/pi-image`: the settings of Raspberry Pi Imager (board, screen, user, SSH, Wi-Fi, region) and what Zinc adds
(libraries, the app to start, the agent) on the left; the build, its progress and its log on the right. The light workspace groups
settings into numbered sections, with a vector hardware illustration and Lucide icons. The green build panel summarizes the board,
screen, network and login without displaying passwords. Narrower windows stack each field's label above its control.

```sh
zinc run image/builder
```

Every change is saved at once to `~/.zinc/pi-image/profile.json` (readable by its owner only: it holds a password and a Wi-Fi key),
the profile the builder passes to `tools/pi-image build`; keys the builder does not show (`base`, `zinc`) are kept. Reopening the
app restores these last settings. Saving replaces the complete file atomically; a failure is shown above the settings and blocks
the build until the profile can be saved.

**Save as…** stores a named snapshot of all current settings in `presets.json` beside the profile (also readable by its owner
only). This includes Wi-Fi/login passwords, SSH keys, the app and any pinned base/engine settings. Selecting a saved preset restores
the whole snapshot and makes it the automatically saved last settings. Names must be nonempty and unique; an existing preset is
never overwritten. The name dialog supports Enter, Escape and Cancel. Select lists float above cards and neighbouring fields,
and close on selection, Escape or a press outside.

"Build the image" runs the tool
and follows the lines it prints for apps (`::step`, `::error`, `::done`); "Stop" stops its container. The environment can move
things (the test does): `ZINC_PI_IMAGE_ROOT`, `ZINC_PI_IMAGE_TOOL`, `ZINC_PI_IMAGE_PROFILE`.

The output follows new lines while its bottom is visible. Scroll up to read earlier lines without being pulled back; **Latest output**
returns to the bottom and resumes following. Up to 400 lines are shown. Steps and errors stand out; the current step, percentage and
finished image actions stay above the output. **Show file** reveals the image; **Open Imager** launches Raspberry Pi Imager or its download page.

## Layout of `src/`

```text
src/
├── main.tsx            # sets the theme and mounts the workspace
├── constants.ts        # the build protocol, limits, paths of the Mac
├── state.ts            # the profile being edited, the build, their actions
├── services/           # paths, catalog (image/catalog.json), profile (load, save), build (runs tools/pi-image)
├── components/         # field, progress bar, log view
└── pages/              # workspace, settings (the form), build (progress, result, log)
```

Proof: `tests/t1/pi_image_builder.sh` (a scripted session against a fake `tools/pi-image`), `tests/t0/pi_image_presets.sh`
(private snapshots, unknown keys and failed writes), `tests/t1/pi_image_builder_log.sh` (follow, reading older lines and pointer resume),
`tests/t1/pi_image_builder_presets.sh` (real dropdown pointer hits beyond
the card, preset save/load, errors and a cold app restart), and `tests/t1/nuxt_ui.sh` for the shared select component.
