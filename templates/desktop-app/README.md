# {{name}}

A desktop app made from the `desktop-app` template, on `zinc:ui/nuxt` (components with the look of Nuxt UI).

```sh
zinc run      # the app
zinc test     # the router and the settings (tests/)
zinc build    # a native executable in build/
```

| File | What it does |
|---|---|
| `src/main.tsx` | the shell: a collapsible sidebar, the navbar with the app menu, the current page |
| `src/router.ts` | the pages and the history (back), without UI: tested |
| `src/settings.ts` | the settings (name, dark mode) and how they are saved with `zinc:storage`: tested |
| `src/pages/*.tsx` | Home, Notes (a list kept between runs), Settings |

`src/desktop.ts` sets the application menu (File, Edit, View with shortcuts, Window: the macOS menu bar, drawn by the UI kit elsewhere) and an
icon in the system tray where the platform has one; the Settings page says what this platform offers. The navbar's File menu is the same
actions inside the window.
