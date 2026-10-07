# Desktop integration demo

`zinc run examples/system/desktop` opens a window and sets up a native menu bar (Demo, Edit, View, Window), a dock badge and progress, a dock menu, bounce, system notifications and a context menu (`zinc:system`, docs/plugins/system.md).

On macOS the program runs from a dev bundle (`~/.zinc/cache/macos/devapp/dev.zinc.desktop-demo.app`), so the menu bar and the dock show *Desktop Demo*. Notifications use the system's centre once permitted (the first `Notify` asks); without permission the status line says why.

Headless (`ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1`) the recording simulator prints every system call.
