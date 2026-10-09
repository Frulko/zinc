# bouncing-ball

The smallest graphical Zinc program worth reading: immediate-mode 2D with `zinc:gfx` only (no UI tree). Each frame
reads the input, moves the balls under gravity and redraws everything. Once the balls exist a frame allocates
nothing: the HUD text is rebuilt only when it changes.

## Run it

```sh
zinc run examples/bouncing-ball                  # macOS window (SDL3)
zinc run examples/bouncing-ball --target wasm    # browser: http://localhost:8080
zinc run examples/bouncing-ball --target sim     # Node, headless (stop it with ZINC_FRAMES=n)
```

Controls: hold **Up** or **Space** to add 100 balls per frame, **Down** resets to one ball, hold the **mouse button** to spray balls
under the pointer. The HUD shows the ball count and the frame rate: a good first stress test on a new board.

## Stress test

On macOS/Linux, `targets.<id>.growDrawCommands` enables growing command buffers: every ball submits a rectangle,
even above 8,192 commands. Buffers double when full and retain their capacity; allocation failure stops the app
instead of silently dropping balls. Other projects and small-device targets keep fixed pools by default.
With growth enabled, `-DZRT_MAX_DRAW_CMDS=100000` sets the initial capacity, not a maximum.

Hold Up/Space to increase the load, then release and let the FPS settle at that ball count. The HUD measures
elapsed monotonic time, independently of the physics timestep clamp. Compare runs at the same window size,
pixel scale and renderer. This measures physics + command generation + rendering + presentation together;
VSync can cap the displayed FPS. Do not use deterministic mode or a headless run to measure interactive FPS.
Growth/spawn allocations can cause transient slow frames: measure after releasing the key.

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the frame loop: input, physics step, drawing |
| `src/ball.ts` | the `Ball` class: random launch, gravity, wall / floor bounces with damping |
| `src/hud.ts` | frame-rate sampling and the cached HUD label |
