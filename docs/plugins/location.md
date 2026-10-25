# location plugin (`zinc:location`)

Where the device is: the permission (while the app is in use), the current position, a watch that calls back with each new fix. Errors
are values, never exceptions: every answer is a `PositionResult` holding a position or an error with a code and a message to show. Core
Location on iOS and macOS; Linux and Windows have no provider yet (`unavailable`). Sources: `plugins/location/`; the demo is
[examples/geo](../../examples/geo).

```ts
import { requestPermission, getCurrentPosition, watchPosition, distance } from 'zinc:location';

const r = await getCurrentPosition({ timeout: 10000 });           // asks for access first when it was never asked
if (r.error !== null) console.log(r.error.message);               // code: denied, restricted, services-off, unavailable, timeout
else console.log(r.position.latitude, r.position.longitude, r.position.accuracy);

const w = watchPosition((r) => { /* each new fix, or the error that ended the watch */ }, { distanceFilter: 5 });
w.stop();
```

| API | |
|---|---|
| `permissionStatus()` | `'granted'`, `'denied'`, `'restricted'`, `'undetermined'`, `'services-off'` or `'unavailable'` (no provider), without asking. `denied` too when zinc.json "permissions" lack `location` (enforced in an exported app) |
| `requestPermission(): Promise<PermissionStatus>` | the system's question (when in use), once per app; resolves with the answer, `undetermined` after a minute without one. A background run (`ZINC_BACKGROUND=1`, every test) never asks |
| `getCurrentPosition({ accuracy?, timeout? })` | `Promise<PositionResult>`: a fix of the last 10 s at once, else the next one; `timeout` (default 15000 ms) gives the `timeout` error. Never rejects |
| `watchPosition(cb, { accuracy?, distanceFilter? }): Watch` | `cb(PositionResult)` for each new fix (`distanceFilter`: metres moved between two calls); an error other than a timeout ends the watch. `watch.stop()` |
| `Position` | `latitude`, `longitude`, `accuracy` (metres), `altitude`, `altitudeAccuracy`, `speed` (m/s), `heading` (degrees from north): `null` when the provider does not know; `timestamp` (ms since 1970) |
| `distance(a, b)` | metres between two positions (haversine) |

The provider runs on its own callbacks (Core Location on the main thread's run loop); the plugin polls the newest fix four times a second,
so the program's callbacks run on its own thread. The updates stop when nothing listens.

## Permissions

| Platform | What happens | What the app needs |
|---|---|---|
| iOS | the system's question, with the text of `"permissionStrings": {"location": "..."}` | `NSLocationWhenInUseUsageDescription` in the Info.plist: `"permissions": ["location"]` writes the app's text; the plugin writes a default one otherwise (a player such as Zinc Go). Without it the plugin answers `denied` instead of asking |
| macOS | the system's question the first time (under `zinc run`: for the terminal app) | `zinc export --target macos`: `NSLocationWhenInUseUsageDescription`, `NSLocationUsageDescription` and the entitlement `com.apple.security.personal-information.location` |

## The fake provider

`ZINC_FAKE_LOCATION="lat,lon[,accuracy];lat,lon..."` replaces the device's provider: it walks the path one point a second while something
listens, then stays on the last point (accuracy 5 m unless given; no altitude, speed or heading). It starts `undetermined` and
`requestPermission()` grants it. The words `denied`, `restricted`, `off` (services off) and `silent` (granted, never a fix) stand for the
system's other answers. A deterministic run (`ZINC_DETERMINISTIC`) uses it at the Eiffel Tower unless `ZINC_FAKE_LOCATION=0`. It is Zinc
code, so it is the same on the interpreter, QuickJS, compiled programs and without native code (`ZINC_NATIVE=sim`).
