# Air Arcade — Leap Motion

Four native Zinc experiences in one window: Fruit 3D, Hand lab, Air ink and Shifumi.
The reusable sensor API is the `zinc:leapmotion` plugin in `plugins/leapmotion`.

From the repository root:

```sh
build/zinc run examples/leapmotion
```

Install **Ultraleap Hand Tracking** in `/Applications`, start its service, and plug in the sensor.
The local `/Users/mowmow/Lab/Leap-Motion-for-Mac/build/leap_clion` executable is an SDK example;
this demo uses the same installed LeapC SDK directly, without launching or parsing that executable.
Place the sensor flat on the desk and hold a hand roughly 15–40 cm above it, fingers facing the screen.

| Mode | Interaction |
|---|---|
| Fruit 3D | Press Space or **Jouer**. Sweep your index through textured apples, oranges, watermelons and kiwis; cut halves expose their flesh. A round lasts 60 seconds; fruit gives 10 points, chained cuts multiply points up to ×5, bombs remove 30. Misses are counted. Solo is the default; **M** or **Solo · passer à 2** enables two-player play. |
| Hand lab | Lit 3D bones, joints, palms and forearms above a perspective grid and sensor models. Supports up to four hands from two devices. Drag to orbit, scroll or use the zoom buttons; Space resets the camera. |
| Air ink | Pinch thumb and index to draw; release to lift the pen. Select a colour and width; undo or clear the page. This is freehand drawing, not handwriting recognition. |
| Shifumi | One Leap Motion per player. Hold one hand over each sensor and press Space or **Lancer la manche**. After three seconds, stable rock/paper/scissors poses are frozen and scored. |

**Navigation:** 1/2/3/4 or Left/Right changes mode; point and pinch on a control, or dwell on it for 0.7 seconds.
Space starts/restarts a round, resets the Hand lab camera, or clears the ink page. U undoes ink; S toggles simulation.
The fruit mode's **Amplitude** buttons set the horizontal range of motion (260–660 mm); a smaller range moves the cursor farther.
The index maps 100–450 mm of height to the window. The window scales its interface when resized.

**Without a sensor:** drag with the mouse to cut/write, and click the buttons. **Essayer la simulation** shows two independent
simulated devices, with one animated hand each. They cycle through shifumi poses; simulated pinching also draws in Air ink.
Simulation is labelled and never silently replaces a disconnected sensor. Changing mode pauses the current game and keeps the
ink page. Closing the app discards the session and drawing.

**Fruit multiplayer is optional and local:** one sensor per player, two coloured blades in a shared arena (J1 green, J2 turquoise).
Each has a separate score, combo and bomb penalty. Earliest blade contact awards a fruit exactly once; exact simultaneous ties
alternate priority. Highest score after 60 seconds wins. Changing Solo/2 joueurs resets the round and waits for **Jouer**.
Sensor assignments stay fixed if a stream disappears or you visit another mode; missing hands cannot cut. **Recommencer**
reassigns sensors after replacement. **S** provides two simulated players for a complete match without hardware. Mouse slicing
remains available in solo. This option does not change Shifumi.

Fruit skins and cut faces are bundled CC0 assets from TextureCan, qubodup and nevak, with sources and hashes in
[asset credits](assets/fruits/README.md). They are reusable alternatives, not the original commercial game's assets.

For a real duel, place the two sensors far enough apart that each sees its own player's hand. Their coordinates are independent,
displayed side by side; they are not fused into one calibrated space. Player assignments survive a lost stream; use **Réattribuer**
after replacing/reconnecting a device. A lost hand cancels the countdown. An ambiguous pose or a pose held for less than 180 ms
at the reveal gives no point. A fist is rock, four extended fingers are paper, and index/middle only are scissors; the thumb is ignored.

```sh
# Start with two simulated devices, retaining the real 3D renderer:
ZINC_NATIVE=real ZINC_LEAP_SIM=1 build/zinc run examples/leapmotion
# Open a particular mode (hands, ink or duel), or start the fruit round immediately:
ZINC_LEAP_MODE=hands build/zinc run examples/leapmotion
ZINC_LEAP_AUTOPLAY=1 build/zinc run examples/leapmotion
# Start in two-player Fruit 3D (still waiting for Play):
ZINC_LEAP_MULTIPLAYER=1 build/zinc run examples/leapmotion
# Other engines:
build/zinc run examples/leapmotion --engine quickjs
build/zinc build examples/leapmotion -o /tmp/air-arcade
/tmp/air-arcade
```

The plugin clears stale tracking after 250 ms and breaks drawing/cutting on lost or changed hands. Pinching uses hysteresis
(start at 0.8, release below 0.55); the pen uses time-based smoothing. Drawing history and particles have fixed upper bounds.

Checks: `tests/run --only leapmotion` and `tests/run --tier t1 --only leapmotion_demo`.
The latter scripts all four modes and the optional multiplayer toggle, verifies duel, cut-fruit and multiplayer visual goldens,
and compares short textured multiplayer frames across all three engines.
The two-device route is tested with a fake SDK; the development session detected one physical sensor, so a real two-player duel
still needs a second connected device.
