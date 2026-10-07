# zinc:system

Desktop integration for macOS and Linux apps: notifications, menus, tray, dialogs, window control, shortcuts, deep links, autostart, dock, power, clipboard, opener. Design and per-platform choices: [docs/reports/system-integration.md](../reports/system-integration.md).

```ts
import * as system from 'zinc:system';
system.call('notification.notify', { title: 'Build done' });   // needs "notification" in zinc.json permissions
system.on('menu-click', (args) => console.log(args[0]));
```

- **Permissions** (deny by default): `zinc.json` `"permissions": ["notification", "tray"]` (`feature` or `feature:operation`; `targets.<name>.permissions` may add or remove with `-id`). Importing `zinc:system/<feature>` without it is error Z5006; the native side refuses an op whose id was not compiled in even when the program got past the compiler.
- **Ops**: `plugins/system/ops.json` is the table (op, permission, argument and result shapes, simulator answer). `tools/system-ops` generates `ops.d.ts` and `native/ops.gen.h`; `tests/t0/system_ops.sh` fails on drift.
- **Recording simulator** (the backend in deterministic and headless runs): every call prints `[system] <op> <json>`; `ZINC_SYSTEM_LOG=-|file` chooses where. `ZINC_SYSTEM_SCRIPT=file` delivers events, one line `<tick> <event> args...` (a tick is one pass of the event loop, a frame in a UI app): `menu-click`, `tray-click`, `notification-click|action|reply|close`, `shortcut`, `drop`, `open-url`, `second-instance`, `power`, `appearance`, `window`, `dialog-answer`. Unknown events are logged as errors.
- The macOS and Linux backends and the feature modules (`zinc:system/tray`, ...) arrive task by task (ZN-235..); until then those modules are stubs whose `isSupported()` is false.
