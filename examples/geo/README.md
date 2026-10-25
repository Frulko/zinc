# Geo

"Where am I?" on one screen, on `zinc:location` ([docs/plugins/location.md](../../docs/plugins/location.md)): the permission and a button
to ask for it, the current coordinates and their accuracy, a live watch and the distance travelled while it runs.

```sh
build/zinc run examples/geo                                              # Core Location on macOS (a bundled app asks; zinc run: the terminal's)
ZINC_FAKE_LOCATION="48.8584,2.2945;48.8590,2.2950" build/zinc run examples/geo   # a fake path, one point a second
build/zinc export examples/geo --target ios                              # an iPhone app; or run it in Zinc Go with zinc dev --lan
```

`src/main.tsx` draws the screen, `src/state.ts` holds the state and the actions (ask, locate, watch). `zinc.json` declares the `location`
permission with its text, which becomes `NSLocationWhenInUseUsageDescription` in the iOS app.
