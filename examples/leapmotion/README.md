# Air Arcade — Leap Motion

Three native Zinc experiences in one window: Fruit slice, Hand lab, and Air ink.
The reusable sensor API is the `zinc:leapmotion` plugin in `plugins/leapmotion`.

From the repository root:

```sh
next/build/zinc run examples/leapmotion
```

Install **Ultraleap Hand Tracking** in `/Applications`, start its service, and plug in the sensor.
The local `/Users/mowmow/Lab/Leap-Motion-for-Mac/build/leap_clion` executable is an SDK example;
this demo uses the same installed LeapC SDK directly, without launching or parsing that executable.
Place the sensor flat on the desk and hold a hand roughly 15–40 cm above it, fingers facing the screen.

| Mode | Interaction |
|---|---|
| Fruit slice | Press Space or **Jouer**. Sweep your index through fruit. A round lasts 60 seconds; fruit gives 10 points, chained cuts multiply points up to ×5, bombs remove 30. Misses are counted. |
| Hand lab | Shows both hands, all 25 joints per hand, wrists/forearms, pinch/grab strengths and sensor frame rate. |
| Air ink | Pinch thumb and index to draw; release to lift the pen. Select a colour and width; undo or clear the page. This is freehand drawing, not handwriting recognition. |

**Navigation:** 1/2/3 or Left/Right changes mode; point and pinch on a control, or dwell on it for 0.7 seconds.
Space starts/restarts a game, resets the amplitude in Hand lab, or clears the ink page. U undoes ink; S toggles simulation.
The **Amplitude** buttons set the horizontal range of motion (260–660 mm); a smaller range moves the cursor farther.
The index maps 100–450 mm of height to the window. The window scales its interface when resized.

**Without a sensor:** drag with the mouse to cut/write, and click the buttons. **Essayer la simulation** shows two animated
hands, clearly labelled as simulated. Simulated pinching also draws in Air ink. It never silently replaces a disconnected sensor.
Changing mode pauses the game and keeps the ink page. Closing the app discards the session and drawing.

```sh
# Start with two simulated hands, without contacting the device:
ZINC_NATIVE=sim ZINC_LEAP_SIM=1 next/build/zinc run examples/leapmotion
# Open a particular mode (hands or ink), or start the fruit round immediately:
ZINC_LEAP_MODE=hands next/build/zinc run examples/leapmotion
ZINC_LEAP_AUTOPLAY=1 next/build/zinc run examples/leapmotion
# Other engines:
next/build/zinc run examples/leapmotion --engine quickjs
next/build/zinc build examples/leapmotion -o /tmp/air-arcade
/tmp/air-arcade
```

The plugin clears stale tracking after 250 ms and breaks drawing/cutting on lost or changed hands. Pinching uses hysteresis
(start at 0.8, release below 0.55); the pen uses time-based smoothing. Drawing history and particles have fixed upper bounds.

Checks: `next/tests/run --only leapmotion` and `next/tests/run --tier t1 --only leapmotion_demo`.
The latter scripts the three modes and writing, verifies a visual golden, and compares short frames across all three engines.
