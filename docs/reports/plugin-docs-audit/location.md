# zinc:location audit (score 4/5)

## What it is
Where the device is: permission, current position, a live watch, distance between points. Errors are values, not exceptions. A fake provider makes it testable.

## Targets and status
- plugin.json: macos (Core Location), ios (Core Location, Info.plist text), linux and windows (`unavailable`, no provider).
- Test: `tests/t1/location.sh` plus `tests/golden/host/location_session.ts`. Android, web: not mentioned (the browser has `navigator.geolocation`; status unknown).

## What the docs have
- [x] overview, [x] quick start, [x] API table (permissionStatus, requestPermission, getCurrentPosition, watchPosition, Position, distance)
- [x] permissions per platform, [x] fake provider (`ZINC_FAKE_LOCATION` grammar), [x] test
- [x] runnable example `examples/geo` with README (run, fake path, iOS export)
- [ ] screenshot, [ ] tutorial, [ ] Android/web status

## What is missing
1. Screenshot of examples/geo: `ZINC_FAKE_LOCATION="48.8584,2.2945;48.8590,2.2950" ZINC_SHOT=docs/img/geo.png zinc run examples/geo`.
2. A tutorial "Show the distance walked": watch, `distance`, `distanceFilter`, stop; then run on an iPhone via Zinc Go (`zinc dev --lan`). (owner/hardware for the phone)
3. Document the exported `Watch` class (`stop()`), `PositionOptions` and `LocationError` fields in the table, not only in the code.
4. Android and web lines in the support table (what happens today: `unavailable`?).
5. Troubleshooting: terminal app asked on macOS, "denied" because zinc.json lacks `location`, `undetermined` after a minute.
6. A real-device accuracy note (indoors, Wi-Fi vs GPS). (hardware)

## Wrong or stale
- Nothing found. "Linux and Windows have no provider yet" matches the empty manifest entries.

## Suggested pages
Overview; API reference (generated); Permissions (iOS, macOS, zinc.json); Testing with the fake provider; Tutorial: where am I and how far did I walk; Example: geo; Troubleshooting.
