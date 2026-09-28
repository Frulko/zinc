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

Controls: **Up** or **Space** adds 100 balls, **Down** resets to one ball, hold the **mouse button** to spray balls
under the pointer. The HUD shows the ball count and the frame rate: a good first stress test on a new board.

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the frame loop: input, physics step, drawing |
| `src/ball.ts` | the `Ball` class: random launch, gravity, wall / floor bounces with damping |
| `src/hud.ts` | frame-rate sampling and the cached HUD label |
