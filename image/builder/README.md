# Zinc Pi Image

A window for `tools/pi-image`: the settings of Raspberry Pi Imager (board, screen, user, SSH, Wi-Fi, region) and what Zinc adds
(libraries, the app to start, the agent) on the left; the build, its progress and its log on the right.

```sh
zinc run image/builder
```

Every change is saved at once to `~/.zinc/pi-image/profile.json` (readable by its owner only: it holds a password and a Wi-Fi key),
the profile `tools/pi-image build` reads; keys the builder does not show (`base`, `zinc`) are kept. "Build the image" runs the tool
and follows the lines it prints for apps (`::step`, `::error`, `::done`); "Stop" stops its container. The environment can move
things (the test does): `ZINC_PI_IMAGE_ROOT`, `ZINC_PI_IMAGE_TOOL`, `ZINC_PI_IMAGE_PROFILE`.

## Layout of `src/`

```text
src/
├── main.tsx            # mounts the two pages
├── constants.ts        # the build protocol, limits, paths of the Mac
├── state.ts            # the profile being edited, the build, their actions
├── services/           # paths, catalog (image/catalog.json), profile (load, save), build (runs tools/pi-image)
├── components/         # field, progress bar, log view
└── pages/              # settings (the form), build (progress, result, log)
```

Proof: `tests/t1/pi_image_builder.sh` (a scripted session against a fake `tools/pi-image`).
