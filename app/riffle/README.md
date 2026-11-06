# Riffle

A window switcher for macOS: hold Cmd, press Tab, and go to any window, in the order you last used them. A plain list with no previews, a menu bar icon, no Dock icon.

```sh
zinc run app/riffle                                  # asks for Accessibility the first time
zinc build --bundle app/riffle/src/main.tsx -o app/riffle/dist/Riffle.app    # a real app, whose permission survives
```

Quit any other app that uses Cmd+Tab first: the last one to take the shortcut wins, and it can be changed in the settings.

| Key during a hold | What it does |
|---|---|
| Tab, Shift+Tab, arrows | next, previous |
| releasing Cmd, Return | go to the selected window |
| Esc | stay where you are |

## The order of the list

`src/recency.ts`, proven case by case in `tests/recency.test.ts`. Every listed window has a rank; there is no class of windows "never seen" that sorts below all the others.

- A window nobody saw get the focus takes its place in the stacking, so a new window on top comes first.
- A window keeps its rank until the window server says it is gone, read at that moment: missing from one sweep loses nothing, and a sweep older than a focus cannot undo it.
- The order is saved, so restarting Riffle changes nothing; an id comes back only with the same process.

Focus (`plugins/desktop-windows`): macOS says an app is active before the app answers Accessibility, and before it says the app launched. So activation keeps trying to observe and to read the focused window, on a thread of its own, until both work. Only the app in front moves the list: a background app opening a window does not.

## Checking it

`tests/run --only riffle` runs the order logic and both screens against fake windows. `RIFFLE_PROBE_SECONDS=20 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 zinc run app/riffle` prints the real windows and focus changes without taking the shortcut or showing anything, so it is safe next to another switcher.
