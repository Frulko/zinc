# Animation, robot personality, events and telemetry for ZincStudio

Date 2026-09-30. Research and design study, nothing implemented. Goal stated by the owner: build a small robot (screen +
motors of any kind: servo, stepper, DC) and give it personality. ZincStudio should be a sandbox mixing Arduino
(hardware), Processing (creative coding) and Choregraphe (behavior + timeline), and must not lock the user in: animations
and control can come from other software.

Legend: **[V]** verified in the repo, **[W]** from a web source (linked), **[I]** inference / proposal.

---------------------------------------------------------------------------------------------------------------------

## 1. What exists in Zinc today [V]

| Piece | State |
|---|---|
| Studio (`apps/studio`) | Choregraphe-style flat diagram (boxes + links), generates TS, builds, runs on sim / window / Preview (remote display) / Pi QEMU / ssh device. 30 boxes. No scene, no timeline, no container box (`apps/studio/README.md` "Limits"). Box = data in `library.ts`. |
| UI tween | `lib/std/ui.ts` `animate(node,key,to,dur,easing,delay)`: x/y/scale/opacity/size, 5 easings, no keyframes/sequence/stagger. |
| Lottie | `plugins/lottie` (`zinc:lottie`): C++ parser, `Player` (play/seek/segment/speed/loop), `<Lottie/>` node, runs on host, rpi1, wasm, rmpp, ps2, esp32. |
| Procedural eyes | `examples/robot-eyes`, `robot-eyes-oled`: targets + easing with `rrect`/`polygon`, "not a timeline". |
| 2D / 3D | `gfx.path`, `zinc:canvas2d`, `zinc:svg`; `plugins/three`, `3d`, `display-gl`. `GLTFLoader` returns no animations, no skins, no morphs. |
| Hardware | `zinc:gpio` only (sim, libgpiod, ESP32). **No PWM, servo, stepper, DC, generic I2C/SPI.** I2C only inside drivers (imu-qmi8658, scrollphat, st7789 touch). |
| Remote | `display-remote` (app side) + `zinc:remote` (viewer): TCP, `[u8 type][u32 len][payload]`, frames + pointer/wheel/buttons input, PING/PONG, UDP multicast beacon, optional token, **one viewer at a time**, no data channel (`docs/plugins/remote.md`). |
| Logs | Studio sets `ZINC_LOG_FORMAT=json`; the Log panel colours by level (`docs/studio.md`). |
| Sockets | `zinc:socket`: TCP, Unix, UDP, WebSocket client + server (`plugins/socket/index.ts`). |
| Importer hook | None. Plugins are `module` or `display` only; heavy conversion is ad hoc offline scripts. |

## 2. How other systems model animation

### 2.1 File-level formats

- **Lottie / dotLottie** (After Effects via Bodymovin / LottieFiles): vector shape layers, transforms, trims. No expressions,
  no effects, no blend modes, no luma mattes. [W] [supported AE features](https://help.lottiefiles.com/supported-after-effects-features),
  [dotLottie](https://lottiefiles.com/dotlottie). Reference engine ThorVG (~150 KB C++) [W]
  ([docs](https://docs.lottiefiles.com/en/runtimes/overview/thorvg)); Zinc has its own parser, no dependency needed.
- **glTF 2.0** (Blender): per-bone TRS channels, morph targets, NLA tracks exported as animations, skins with vertex groups
  [W] ([Blender manual](https://docs.blender.org/manual/en/2.91/addons/import_export/scene_gltf2.html)).
  [ozz-animation](https://github.com/guillaumeblanc/ozz-animation) is the light C++ runtime (sampling, blending) with `gltf2ozz` [W].
- **Rive `.riv`**: binary, C++ runtime, its differentiator is the state machine [W] ([format](https://rive.app/docs/runtimes/advanced-topic/format)).
  Spine is a commercial skeleton format. Both rejected for now (studio boxes already are state graphs).
- **Blender Servo Animation add-on**: one armature bone = one servo, min/max per bone, IK, exports a JSON list of sampled
  positions, has a live mode over serial or TCP [W] ([repo](https://github.com/timhendriks93/blender-servo-animation)).
  Simplest importer for motor motion.

### 2.2 Robot-behavior systems (closest to the goal)

**Cozmo / Vector (Anki)** [W]
- A clip is a set of typed keyframe tracks, each with `trigger_time_ms` + `duration_ms`, stored as FlatBuffers `.bin`
  (convertible to JSON). Tracks: head angle, lift height, body motion (radius, speed), backpack lights (5 RGBA LEDs),
  procedural face, audio events, face animation (image sequence), events
  ([pycozmo](https://pycozmo.readthedocs.io/en/stable/generated/pycozmo.anim_encoder.html)).
- `variability_deg` / `variability_mm` on keyframes: each playback differs slightly. This is a big part of "alive".
- Authored in Maya with a plugin that exports JSON; the animation resources are public
  ([vector-animations-raw](https://github.com/digital-dream-labs/vector-animations-raw)).
- Eyes are **parametric** (shape parameters interpolated between slider poses,
  [eye animation tools](https://randym32.github.io/Anki.Vector.Documentation/tools/Eye%20animation.html)), not sprites.
  Same idea as `examples/robot-eyes`. Cozmo `.bin` clips mostly play on Vector; audio ids differ.

**NAO / Pepper (Aldebaran) + Choregraphe** [W]
- A box may contain a **timeline** with two layers: Motion keyframes (joint angles + interpolation from the previous
  keyframe) and Behavior keyframes (a flow diagram that runs until the next behavior keyframe). Worksheet mode and
  Curves mode; ALMotion warnings preview automatic corrections such as self-collision
  ([Timeline Editor](http://doc.aldebaran.com/2-8/software/choregraphe/panels/timeline_editor.html)).
- **ALMemory**: the robot's shared key/value store. `insertData` / `getData`, `raiseEvent` (stores value, notifies
  subscribers, keeps history and timestamp), `subscribeToEvent`, `declareEvent`. Sensors, perception (touch, people,
  sound, battery, diagnosis) publish into it; boxes receive them as events
  ([ALMemory API](http://doc.aldebaran.com/2-5/naoqi/core/almemory-api.html)).

### 2.3 Lessons for a small personality robot [I]

1. Screen and motors in **one clip** so a glance and a head turn are synchronized.
2. **Parametric eyes** (gaze, openness, lids, shape, mood), not Lottie or sprites; Lottie stays a bonus for icons.
3. **Variability** on keyframes, seeded (so it can be replayed exactly, see §5).
4. **Background life layer** (blink, breathe, idle glances) at low priority under any clip.
5. **Emotion groups**: name -> several clips, one picked at random.
6. **Natural motion**: ease in/out, anticipation, small overshoot; per-actuator speed and accel limits.
7. **Timeline inside a box** (Choregraphe), with a behavior track that can start a sub-graph.

## 3. Proposed architecture: channels, clips, drivers

Hardware is variable (servo, stepper, DC, mixed), so the clip must never say "servo". Three layers:

```
 SOURCES                  COMMON MODEL                 SINKS (drivers)
 studio timeline    ─┐                              ┌─ servo    (PWM / PCA9685)
 Blender JSON/glTF   │                              ├─ stepper  (step/dir, speed+accel profile)
 Lottie / AE         ├─►  Channels + Clips  ───────►├─ DC motor (PWM+dir, or position with encoder)
 OSC / MIDI / WS     │    (normalized values        ├─ screen   (eyes, Lottie, canvas, UI nodes)
 TS code             ┘     over time)               ├─ LED, sound
                                                    └─ external out (OSC, serial, WebSocket)
```

- **Channel** = named normalized value (`head.pan`, `eye.left.open`, `wheel.speed`). Driven by a clip, an external source or code.
- **Clip** = duration, loop, layers of `Track{channel, keys:[{t, dur?, value, ease, variability?}]}` plus
  `EventTrack{keys:[{t, event | subgraph}]}`. Talks only in channels.
- **Driver** binds a channel to hardware with its calibration: servo (min/max, offset, invert, max speed, rest), stepper
  (steps per unit, speed, accel, homing; target is a position with a velocity profile), DC (speed with ramp, or position
  with encoder), screen (parameter of the eyes / Lottie / UI node; existing `animate()` and `<Lottie/>`).
  Swapping servo for stepper changes the driver only.
- Limits and calibration are enforced **device side** and shown in the editor (Choregraphe warnings), never only in the UI.

Studio boxes: **Channel** (driver + calibration), **Clip** (timeline with curves, Choregraphe style), **Eyes**, **Emotion**
(name -> clip group), **Source** (OSC, MIDI, WebSocket, imported file), **Life** (background layer).

### Interop with other software

- **Import** (offline): Blender servo JSON, glTF (bone -> channel), Lottie (animated property -> channel), later Cozmo/Vector
  `.bin`/JSON. Needs an `importer` plugin kind (file in -> clip + compatibility report out); none exists today.
- **Live** (bidirectional): OSC first (TouchDesigner, Max, Processing, Ableton, Unreal), MIDI, WebSocket (Blender live mode),
  serial (Arduino). A channel can also be *output* to another program. [I]

## 4. Events and environment ("à la Pepper"): one data bus

Make ALMemory's idea the spine of the runtime: a single **signal bus** of timestamped key/value messages. [I]

```
Msg { t, key, value }            keys are hierarchical, e.g.
  sensor/touch/head              (event: touched / released)
  sensor/distance/front          (value)
  sensor/imu/accel               (vector)
  channel/head.pan/target        (what the clip asked)
  channel/head.pan/actual        (measured / estimated)
  system/battery, system/cpu, system/temp
  clip/wave/started, clip/wave/done, emotion/happy
  ui/pointer, log/warn
```

- Operations (from ALMemory): `set(key, v)`, `get(key)`, `subscribe(pattern, cb)`, `raise(event, v)`; the bus keeps
  the last value and a short history per key. Two flavours: **values** (latest wins, polled or on-change) and **events**
  (never dropped, ordered).
- **Producers**: drivers (actual position), sensor modules (GPIO edge already exists via `gpio.watch`, IMU, later
  I2C/analog), system, the clip player, the UI, `console` (already JSON).
- **Consumers**: boxes (new "On event" / "On value" input boxes, i.e. Choregraphe's sensor boxes), scripts, the recorder,
  the remote link.
- Rule that makes everything below work: **an app reads the world only through the bus and time only through the bus
  clock** (no direct sensor or `Date.now` reads in box code). This is what allows simulation and replay.

### 4.1 Existing protocols instead of a home-made ALMemory [W]

ALMemory (2010s, NAOqi-only) is the *model* to copy, not the wire format. Modern options:

| Option | What it is | Fit |
|---|---|---|
| **Zenoh** (+ zenoh-pico) | pub/sub + query + storage, key expressions with wildcards (`robot/*/sensor/**`), peer-to-peer or routed, UDP/TCP/serial/BLE. zenoh-pico fits in ~50 KB (~15 KB tailored) and reports ~10x XRCE-DDS and ~40x MQTT throughput on microcontrollers; better than DDS on Wi-Fi/4G; Zenoh is a ROS 2 middleware option ([zenoh-pico](https://zenoh.io/blog/2022-06-09-zenoh-pico-above-and-beyond/), [paper](https://arxiv.org/pdf/2309.07496)). | Closest semantic match to ALMemory (keys + subscribe + get + last value via storages). Needs a C client in the runtime (zenoh-pico is C, Apache-2/EPL). Heaviest to integrate. |
| **MQTT** | broker-based pub/sub, retained messages = last value | Ubiquitous, trivial on ESP32, every tool speaks it. Needs a broker; slower; no native request/reply (v5 has it). |
| **Foxglove WebSocket protocol + SDK** | open WebSocket protocol for live channels with schemas; the SDK (Rust, C++, Python) also writes MCAP ([WS protocol](https://foxglove.dev/blog/announcing-the-foxglove-websocket-protocol), [SDK](https://foxglove.dev/blog/announcing-the-foxglove-sdk)) | Gives live visualization **and** record/replay (MCAP) in a ready-made third-party UI, on top of `zinc:socket` WebSocket. Not a control bus. |
| **Rerun** | SDK (C++/Python/Rust) + viewer, entity paths + multiple timelines, `.rrd` recordings ([rerun](https://github.com/rerun-io/rerun)) | Excellent scrubbing/plots for debugging; a viewer, not a bus. |
| **DDS / ROS 2, micro-ROS (XRCE-DDS)** | robotics standard | Heavy; XRCE-DDS limited to small payloads; only if ROS 2 interop is a goal. |
| **OSC** | UDP messages with address patterns | Creative-tool interop (see §3), no history/QoS. |

**Recommendation [I]:** keep the ALMemory *semantics* (hierarchical keys, value vs event, last value + short history,
wildcard subscribe) as the in-process bus, and do **not** invent a wire protocol:
1. **Wire = key/value messages over WebSocket** first, shaped like Foxglove's (channels with a schema announced at
   connect, timestamped messages), so Foxglove Studio can watch a Zinc robot with no extra work; recordings are JSON
   Lines by default with **MCAP** as an optional export (see §5.2). Reuses `zinc:socket`; nothing new to compile.
2. **Zenoh as the pluggable transport later**, because its key expressions map 1:1 onto the bus keys and zenoh-pico
   covers ESP32/MCU nodes (a bare-metal motor board joining the bus). Keep the bus API transport-agnostic so
   WebSocket, Zenoh, MQTT and OSC are adapters, not redesigns.
3. Do not adopt DDS/ROS 2 unless ROS interop becomes a requirement (a Zenoh bridge exists for that).

**About Zenoh** [W]: Eclipse Foundation project (created by ZettaScale), 1.0 released with a stabilised API
([announcement](https://newsroom.eclipse.org/news/announcements/eclipse-zenoh-100-debuts-redefining-connectivity-robotics-and-automotive)).
Publish/subscribe + query + storage with wildcard key expressions, peer-to-peer (no broker needed). zenoh-pico (C) runs
on Arduino/ESP32 and Zephyr at ~1 % of ESP32 memory ([repo](https://github.com/eclipse-zenoh/zenoh-pico)).
Strengths: light, fast on MCUs and Wi-Fi, key model matches the bus keys 1:1. Weaknesses: little known among makers,
C/Rust client to integrate per target, more concepts than MQTT, no ready-made viewer, exact licence not checked.
Verdict: not first. Worth it for several boards or several robots; plug it in later as a transport adapter.

**Maker / hacker / DIY refinement [I, ecosystem facts from search]:** the target user has a USB cable, an ESP32 or Pi,
and a laptop, not a broker or a router. So the first-class experience must be:
1. **USB serial, zero config, human readable**: one JSON line (or `key=value`) per message, watchable with any
   terminal and the existing `zinc monitor`; same message shape as the WebSocket one. This is the Arduino
   serial-monitor / serial-plotter culture.
2. **WebSocket JSON on the LAN** (curl/websocat/browser friendly, discovered by the existing UDP beacon), Foxglove-shaped.
3. **MQTT adapter** because that is where makers already live: Home Assistant, Node-RED dashboards, ESPHome
   ([ESP32 + Node-RED + MQTT](https://flowfuse.com/blog/2024/11/esp32-with-node-red/), [ESPHome MQTT](https://soldered.com/blogs/learn/esphome-mqtt-integration-explained)).
4. **OSC adapter** for creative tools (Processing, TouchDesigner, Max).
5. **Firmata** ([firmata.org](https://firmata.org/), protocol 2.8.0) is a different level: it makes an Arduino a dumb
   remote I/O board driven from the host. Useful as a *driver* ("Arduino as servo/stepper expander"), not as the bus;
   its JS client (`firmata` npm) was last published ~6 years ago.
6. Zenoh and MCAP stay the "advanced / multi-board / archival" tier, never required.
Principles: readable on the wire, works offline over USB, discoverable, one-line to watch, no account, no cloud.

## 5. Three run modes on the same bus [I]

| Mode | Where the app runs | Bus source | Actuators |
|---|---|---|---|
| **Local simulation** | on the dev machine (sim / window / Preview) | virtual sensors: sliders and scripts in the studio, or a replayed recording | virtual: drawn in the Robot view (joint angles, wheel speed) |
| **Remote** | on the device (Pi, ESP32) | real sensors | real drivers; the studio only observes and, if allowed, controls |
| **Replay** | either | a recording | either (see 5.3) |

### 5.1 Remote telemetry and control

- Today the remote link carries **video + input only** and serves one viewer (`docs/plugins/remote.md`). Add a **data
  channel** next to it rather than inside the frame protocol. [I]
  - Transport: WebSocket (already in `zinc:socket`; also what browsers and other tools speak). Same host, own port,
    same beacon for discovery (add its port), same token.
  - Messages: `subscribe(pattern, rate | on-change)`, `unsubscribe`, `msg{t,key,value}` batches, `set`, `raise`, `call`
    (play clip, stop, jog channel), `hello{schema of keys, channels, limits}`.
  - Downsampling on the device (per subscription rate, on-change, coalescing) so a slow Wi-Fi link or an ESP32 is not
    flooded; the existing `inflight` pacing idea applies.
  - Several read-only observers may connect; **one controller** at a time.
- **Studio panels** (all bound to the bus): Memory watcher (Choregraphe-style live key list), plots per key/channel with
  target vs actual, event log, a Channel jog panel (manual override of a servo), battery/CPU/temp, the existing Robot view.
- **Safety** (this drives motors): device-side limits and speed caps always on; a **watchdog** (control link lost or
  silent for N ms -> drivers go to a configured safe state: hold, rest pose or power off); an emergency stop
  message and a physical/GPIO stop input; control disabled unless a token is set; observe-only by default. The current
  remote display has no authentication by default and says "trusted networks only": the data channel must require a token.

### 5.2 Recording

- Recorder = a bus subscriber writing an **append-only, timestamped log** of chosen keys (default: all inputs +
  channel targets/actuals + events + the RNG seed and program build id).
- Format: **JSON Lines by default** `{t,key,v}` plus a header line with the key schema (trivial, greppable, no
  dependency, easy on an ESP32), **MCAP as an optional export** (see below). Same message shape in both, so a small
  converter goes either way and the bus does not change. [I]

**What MCAP is** [W]: an open, append-only container for timestamped messages, made by Foxglove; the default ROS 2 bag
format since Iron ([source](https://foxglove.dev/blog/mcap-as-the-ros2-default-bag-format)). One file holds several
named channels, their messages, the embedded schemas (readable years later without the original program) and an index
(jump to a time or channel without reading everything). Payloads may be JSON, Protobuf, FlatBuffers, ROS.
Append-only writing keeps what was already recorded after a crash or power loss
([mcap.dev](https://mcap.dev/), [repo](https://github.com/foxglove/mcap)).
- Pros: opens as is in Foxglove (plots, timeline, replay); robust after power loss; fast seek.
- Cons for makers: binary (no `cat`/`grep`), needs a library, heavier than a text file on a small MCU. The C++ library
  size and ESP32 cost were **not measured**: check before writing MCAP directly on the robot (export on the host instead).
- Recording can run **on the device** (survives a link loss, flushed periodically, ring buffer on ESP32) or in the
  studio from the remote stream (may drop under a slow link; mark gaps).
- Local sim recordings are exact.

### 5.3 Replay (three distinct uses)

1. **Replay inputs into the program** (sim or device): the recorded sensor/UI stream feeds the bus in place of real
   sensors; with the recorded bus clock and RNG seed the program reproduces its behavior. Use: debug a bug seen on the
   robot at your desk, regression tests ("same inputs -> same outputs", diff the output channels).
2. **Replay outputs to actuators**: play recorded channel targets back to the drivers. Same as running a clip.
3. **Scrub / inspect**: open a recording in the timeline and plots, no program running.

- **Recording -> clip (puppeteering)**: move the robot by hand (or drive it live from Blender/OSC/a controller), record
  the channels, keep the take as a Clip, then edit keyframes. This is how Choregraphe users capture poses; it makes
  authoring for a small robot far faster than typing keyframes. Needs a simplification step (curve fitting) so a
  dense recording becomes editable keys.
- **Determinism checklist**: bus clock (real, virtual or replayed), seeded variability, no wall-clock or direct
  hardware reads in box code, actuator side effects behind drivers (so replay can run with drivers muted or simulated).

## 6. What is missing in Zinc (gap list) [V]

| Need | Gap |
|---|---|
| Clip / channel model, player, timeline UI | not present |
| PWM, generic I2C, stepper, DC + encoder | not present (only GPIO) |
| Signal bus (ALMemory-like) | not present (only `console` JSON logs, `gpio.watch`) |
| Data channel next to remote display | not present; remote is video+input, single viewer |
| Recorder / replayer | not present |
| Importer plugin kind | not present |
| Virtual sensors and virtual actuator view | Robot view shows the screen only (to be confirmed in `ui/robot.tsx`) |
| OSC / MIDI / serial | not present (socket UDP/WS exist) |
| glTF animation in `GLTFLoader` | returns empty animations |

## 7. Suggested order

1. **Bus + clip core** in a runtime module, running in the simulator, driving screen channels (eyes). No hardware needed.
   Includes bus clock, seeded variability, in-memory recorder.
2. **Studio: Channel + Clip + Eyes boxes**, virtual sensors panel, Robot view showing joints (local simulation mode).
3. **Recorder/replayer to file (JSONL)**, replay inputs into the sim; record -> clip.
4. **Hardware drivers**: PWM + I2C (servo, PCA9685), then stepper, DC. One at a time on the Pi test rig; calibration UI; watchdog.
5. **Remote data channel** (WebSocket, token, subscriptions, control, safety) and the Memory watcher / plots / jog panels.
6. **Live interop**: OSC first, then WebSocket for Blender, MIDI, serial. Importers: Blender servo JSON, glTF, Lottie, then Cozmo.
7. Only if useful: MCAP writer, glTF skinning/morph playback, ozz.

## 8. Open questions

1. Exact hardware (motor types, count, board, screen type): decides PWM vs PCA9685 and eyes on OLED/TFT vs e-ink (e-ink cannot animate eyes).
2. Does the robot have sensors (touch, sound, distance, IMU, camera)? Without them personality is scripted or random.
3. Which board runs the app: Pi (Linux, comfortable) or MCU (ESP32: ring buffers, small bus, no JSONL on flash)?
4. Author clips in the studio timeline only, or also import? (Import-only is much cheaper.)
5. Reuse `display-remote` server for the data channel (one port, one process) or a separate module (`zinc:telemetry`)?
   Separate is cleaner: it must work on devices with no remote display.
6. Verify what `apps/studio/src/ui/robot.tsx` and `docs/reports/research-2026-09-30/toolbelt-build-pipeline.md` already plan,
   to avoid duplicating a pipeline or importer design.

## Sources

- [LottieFiles supported After Effects features](https://help.lottiefiles.com/supported-after-effects-features), [dotLottie](https://lottiefiles.com/dotlottie), [ThorVG](https://docs.lottiefiles.com/en/runtimes/overview/thorvg)
- [Blender glTF 2.0](https://docs.blender.org/manual/en/2.91/addons/import_export/scene_gltf2.html), [ozz-animation](https://github.com/guillaumeblanc/ozz-animation)
- [Rive .riv format](https://rive.app/docs/runtimes/advanced-topic/format)
- [Blender Servo Animation](https://github.com/timhendriks93/blender-servo-animation)
- [PyCozmo anim_encoder](https://pycozmo.readthedocs.io/en/stable/generated/pycozmo.anim_encoder.html), [Vector docs: bin to JSON](https://randym32.github.io/Anki.Vector.Documentation/how-to/How%20to%20convert%20animation%20bin%20files%20to%20JSON.html), [eye animation](https://randym32.github.io/Anki.Vector.Documentation/tools/Eye%20animation.html), [vector-animations-raw](https://github.com/digital-dream-labs/vector-animations-raw), [Procedural-Expression-Library](https://github.com/ggldnl/Procedural-Expression-Library)
- [Choregraphe Timeline Editor](http://doc.aldebaran.com/2-8/software/choregraphe/panels/timeline_editor.html), [Timeline panel](http://doc.aldebaran.com/2-5/software/choregraphe/panels/timeline_panel.html), [ALMemory API](http://doc.aldebaran.com/2-5/naoqi/core/almemory-api.html)
- [MCAP](https://mcap.dev/), [foxglove/mcap](https://github.com/foxglove/mcap)
- [Zenoh-Pico](https://zenoh.io/blog/2022-06-09-zenoh-pico-above-and-beyond/), [DDS vs MQTT vs Zenoh (paper)](https://arxiv.org/pdf/2309.07496), [ROS 2 + MCUs via zenoh-pico](https://zenoh.io/blog/2021-11-09-ros2-zenoh-pico/)
- [Foxglove WebSocket protocol](https://foxglove.dev/blog/announcing-the-foxglove-websocket-protocol), [Foxglove SDK](https://foxglove.dev/blog/announcing-the-foxglove-sdk), [Rerun](https://github.com/rerun-io/rerun)

Limits: the Aldebaran timeline pages were only partly readable (network error), so §2.2 relies on search excerpts; the
Choregraphe "Memory watcher" panel name was not confirmed by a source; OSC/MIDI/Firmata statements are from general
knowledge, not searched.
