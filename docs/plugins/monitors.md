# zinc:monitors

Control the Mac's displays. `app/lumen` is the app built on it.

```ts
import * as monitors from 'zinc:monitors';

const main = monitors.displays().filter((d) => d.main)[0];
const brightness = await monitors.ddcRead(main.id, monitors.DDC_BRIGHTNESS);
if (brightness !== null) monitors.ddcWrite(main.id, monitors.DDC_BRIGHTNESS, brightness.maximum / 2);
```

Each setter returns `false` when the change failed, and `lastError()` says why.

| API | What it does |
|---|---|
| `displays()`, `revision()` | the displays; a number that goes up when the system reconfigures them |
| `modes(id)`, `setMode(id, modeId)` | the modes, the scaled and low resolution ones included; choose one |
| `nativeBrightness(id)`, `setNativeBrightness(id, v)` | built-in and Apple displays, 0..1; -1 when the display has none |
| `ddcRead(id, code)`, `ddcWrite(id, code, value)` | a monitor's DDC/CI values (`DDC_BRIGHTNESS`, `DDC_CONTRAST`, `DDC_VOLUME`, `DDC_MUTE`, `DDC_INPUT`); Apple Silicon only. A read answers through a promise, in about 50 ms or seconds from a monitor that hangs, and never holds the program; writes are queued and the newest value wins |
| `setGamma(id, dim, warmth)` | software dimming and warmth, both 0..1 |
| `boostMax(id)`, `setBoost(id, level)` | brightness above SDR white on an XDR or HDR screen; 1 removes it |
| `setOrigin(id, x, y)`, `setMain(id)` | arrangement and main display |
| `setMirror(id, masterId)` | makes `id` show `masterId`; 0 stops |
| `setRotation(id, degrees)` | 0, 90, 180 or 270, on displays that can rotate |
| `setConnected(id, on)` | connects or disconnects; refuses to disconnect the last display |
| `createVirtual(name, w, h, refresh, hidpi)`, `destroyVirtual(id)` | a display with no screen behind it |

Dimming, boost and virtual displays last as long as the process. Modes, arrangement, mirroring and rotation stay after it.

A wrong mode can leave a screen black: an app should go back by itself unless the person keeps the mode, as Lumen does.

Virtual displays, native brightness, DDC, rotation and connection use private macOS APIs, looked up at run time: on a macOS without them the call fails with a message. They keep an app out of the Mac App Store.

In a deterministic run, or with `ZINC_FAKE_DISPLAYS=1`, the module sees two fake displays kept in memory, so a test never touches the real screens.
