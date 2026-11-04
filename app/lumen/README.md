# Lumen

Display control in the menu bar, in the spirit of BetterDisplay, as a translucent macOS menu with SF Symbols that follows the system's light or dark look. Lumen has no Dock icon: click the sun in the menu bar and the panel opens under it. A click elsewhere hides it.

```sh
build/zinc run app/lumen
```

## What it does

- Sliders for brightness (the display's own, DDC, or software when neither answers), volume and resolution.
- Display modes with HiDPI and refresh rates. A new mode goes back by itself after 15 seconds unless you keep it.
- Warmth and XDR boost; contrast, mute and input source over DDC.
- Virtual displays, restored at each launch.
- High Resolution (HiDPI) on a monitor without sharp modes: the monitor mirrors a virtual display drawn at twice its pixels.
- Picture in picture of any display (asks for Screen Recording).
- Rotation, mirroring, connecting and disconnecting, main display, arrangement by dragging.
- Control + Option + Up / Down changes the brightness of the selected display from any app. Start at login.

Virtual displays and software dimming end with the process, so Lumen stays running with its panel hidden until Quit Lumen.

## Layout of `src/`

- `main.tsx`: the menu bar icon and the window that follows it.
- `state.ts`: the state and the actions.
- `services/config.ts`: what is restored at launch.
- `panel/`: the panel and what its rows open.
- `components/`: the macOS controls. `theme.ts`: the colours of the light and dark looks.

The platform work is in `plugins/monitors` ([docs](../../docs/plugins/monitors.md)) and `plugins/sf-symbols`.

`LUMEN_OPEN=1` opens the panel at launch and `LUMEN_OPEN_ROW=<label>` one of its rows, for captures and tests. A deterministic run sees two fake displays.
