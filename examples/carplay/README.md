# Zinc CarPlay

Native projection viewer for the separate `zinc:carplay` plugin. Large video
surface, mouse/two-finger touch forwarding, Home and Siri commands, a Day/Night
button and connection state.
Siri's microphone return path is not implemented yet.

Run the receiver and set ZINC_CARPLAY_URL as described in
[the plugin guide](../../plugins/carplay/README.md). Then:

```
ZINC_BACKGROUND=1 build/zinc run examples/carplay
```

Without a receiver URL the application opens its disconnected screen. It does
not simulate a connected iPhone. `src/main.tsx` mounts the view and connects the
plugin; all media and control behavior belongs to the plugin.
