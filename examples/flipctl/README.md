# flipctl on Zinc

The [Flipper One](https://github.com/flipperdevices/flipctl) panel UI, ported from
[`flipctl-slint`](https://github.com/flipperdevices/flipctl-slint) (Rust + Slint, MIT) to Zinc. No WebKit, no Slint, no
UI tree: every screen is drawn immediate-mode with `zinc:gfx` into a 256x144 surface, so it costs no heap per widget and
the same program runs in a macOS window, on the Linux panel (`fbdev`) and on an ESP32 LCD (`st7789`).

```sh
zinc run examples/flipctl                      # 4x window; arrows move, Enter opens, Esc goes back
ZINC_SCREEN=idle|menu|network ZINC_FRAMES=2 ZINC_SHOT=out.png zinc run examples/flipctl   # one frame, headless-friendly
zinc flash examples/flipctl --target esp32     # ESP32-2432S022, landscape window (untested on real hardware)
```

Ported so far: status bar, main menu and submenus (chamfered selector, dotted scrollbar, animated icon strips), soft-key
strip, idle screen (readings, hostname, link cards). The menu screen matches flipctl-slint's `tests/golden/list.png`
pixel for pixel outside the status icons. Still on Slint only: Wi-Fi, Ethernet, boot menu, keyboard, app switcher, detail
screens, and the Linux backend (`status.rs` sysfs reader, nl80211, evdev, app bundles): `src/state.ts` is a simulated
machine until a Zinc plugin replaces it.

`tools/icons.py` turns flipctl-slint's alpha-mask icons into black (`-k`) and white (`-w`) copies, because zinc:ui images
have no tint. Layout constants are flipctl-slint's `tokens.toml`, in `src/theme.ts`.

Licenses: the source follows flipctl-slint (MIT); the fonts keep their own terms (HaxrCorp 4090 is CC BY-SA 3.0,
Born2bSporty is Unlicense), see `licenses/`.
