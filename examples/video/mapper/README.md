# Mapper

**Anything with an HDMI port becomes a video-mapping player.** Plug a cheap box into a projector, send it your media from a
browser, and pin the picture onto the wall, the stage or the building in front of you. No media server, no laptop left behind:
the show lives on the device and starts again by itself.

Mapper is a demo of Zinc and a real tool. It runs today on a €50 Android 4.4 pico projector (Rockchip RK3128, Mali-400) at its
panel's full 59 images per second, with a 1080p video on a warped, masked layer.

![The editor](../../../docs/img/mapper-editor.png)

## Start

```sh
zinc run examples/video/mapper                  # on this computer
```

It prints the address of its editor, and shows it as a QR code on the output:

```text
mapper: editor at http://192.168.2.172:8080/?token=a121af90afbe48eb
```

Open it in any browser on the same network. The editor is itself a Zinc app, so the same program also runs natively:

```sh
zinc run examples/video/mapper/editor -- --app http://192.168.2.172:8080/?token=a121af90afbe48eb
```

The editor is built once, into the mapper's assets. The mapper explains this if you forget:

```sh
zinc export examples/video/mapper/editor --target web -o examples/video/mapper/assets/editor
```

**No QR code at hand?** The mapper announces itself on the network (DNS-SD, under its own service type, so it never meets another
program's). The native editor lists the mappers it finds: choose one, press **Show a code on it**, type the six digits that appear on
the output. It is paired for good and finds the mapper again when its address changes. A browser cannot look for devices, so open
`http://<the mapper's address>:8080` and enter the same code. A code lasts five minutes and three tries, and the remote's Select opens
one too. `--name` sets the name in the list.

On the device: the left and right arrows of the remote change column, Select shows or hides the status card. On a computer: Tab
is the status card, F fullscreen, Esc quits. Options: `--media <folder>`, `--port <osc port>`, `--web <port>` or `--web off`.

## How you work

1. **Pin the surfaces.** In *Output*, click a zone to select it and drag its corners onto the real object while watching the wall. Click a point: the
   arrows move it by one pixel of the output, with Shift by ten, and Tab goes to the next point. Curved or uneven surface? Open
   *Deformation grid*, pick 3 x 3 up to 9 x 9, and move any point of the grid, as in Resolume.
2. **Cut the shapes.** In *Masks*, add a mask and click around the shape; **Curve** turns a point (or all of them) into a Bézier point with two handles, **feather** softens its edge (0 is sharp), and you can invert it. Crop and edge
   blend are in the same view, for two projectors that overlap.
3. **Measure, then make the media.** In *Calibration*, each layer tells how many pixels it really covers on the output, and the
   size to give a media so that it is neither stretched nor wasted. Download a template (see below), compose over it in your tool,
   and export at that size.
4. **Send the media.** Drop files on the window or use *Send files*. They are copied to the device, with progress, and a broken
   transfer leaves nothing behind.
5. **Build the show.** The grid below the views works like Resolume's and Millumin's: a row per layer, a column per moment of the
   show. Drag a tile of the library onto a cell, or click a tile and then click cells. It holds your media and the mapper's own
   sources (test pattern, gradient, plain colours).
6. **Play it.** A click on a clip plays it on its layer, and the others go on, a second click stops it; a column's title plays the whole column and
   empties the layers it has nothing for, a second click stops it, and an empty column stops everything. A clip's **x**, or Delete on the
   chosen clip, takes it out of the grid. A layer's **x** empties it, **Stop all** empties every layer. The clip that plays has a green
   border; its fit and its looping are in the inspector and follow at once. Drag a clip to another cell to move it. The remote
   steps through the columns that have clips, and what played comes back after a restart.

### Calibration cards

Before the media, set up the light. *Calibration* shows four cards, on the whole output, on every layer or on the selected one:
**grid** (square cells and a circle, so a stretched surface shows at once, and a colour per corner to tell which way up),
**focus** (fine lines and a star: turn the lens until they are crisp), **colours** (bars, greys, the shades near black and near
white) and **white** (an even light, for overlaps). A card changes nothing in the scene, and a restart shows the show.

### Save and load

The scene on now saves itself as it changes and comes back after a restart: nothing to do. *Scenes* keeps named copies on the
device: **Save** under a name, **Load**, **Delete**, and **New empty scene** for no layer and no column. **Export** gives a file to
keep or to bring to another mapper with **Import a file**. A scene holds the layers and the columns; the media stay on the device,
so another mapper needs the same files. Loading or starting new first keeps what was on as `previous`: a wrong click loses nothing.

### A 1920x1080 media in a smaller zone

Nothing to prepare: a layer takes any media and draws it in its zone. `fit` says how: **stretch** fills the zone and deforms,
**contain** shows the whole picture with bars, **cover** fills the zone and cuts what exceeds. The device's GPU does the scaling,
so a big file costs decoding, not drawing. A file at the size *Calibration* gives looks sharper and decodes more easily, which is
what counts on small hardware.

### What you take to Premiere, Cavalry or After Effects

| From *Calibration* | What it is |
| --- | --- |
| **Template SVG** of a layer | the flat media as it must be drawn, with the deformation grid; import it on top of your composition |
| **Stage SVG** | the whole output as the projector draws it: every surface where it is, for a piece that crosses several |
| **calibration.json** | the snapshot of the setting: sizes in pixels, corners, grids, for a script or another tool |

### Light that spills past an edge

A low-resolution projector bleeds past the edge of a shape, onto what stands behind it. In *Output*, choose **Edges** and click a side of
a layer: its **cut** hides a strip outright, its **gradient** fades what follows, its **curve** shapes that fade. **Inside**, **Outside** or **Both** says which way the gradient goes
from the edge: into the layer, past it onto what stands behind, or both. Outside, the **cut** brings the far end of the gradient back toward the edge. **Offset** slides where the gradient starts, from -10 % to +10 %, without moving the layer. It follows the warp, and the lines on the
canvas show where each one ends.

### Several machines, one picture

Start a mapper on each machine, open the editor of the one that leads, and go to *Devices*: the other mappers on the network are listed. **Show a code on it** puts a code on that machine's output; type it and **Add** (once: they find each other again after a restart, wherever they moved). A machine on another network is added by its address. **Side by side** cuts the canvas between them, and each one's left, top, width and height are yours to set.

From then on the leader sends its setup, its show and every command to the others. What must look simultaneous (a column, a clip, a stop, a card, the volume) carries the shared time to run at: *Commands ahead* is how far ahead (80 ms by default: less on a cable, more on Wi-Fi), and each machine's *Delay* makes up for a projector slower than the others. Everything also goes over OSC to the leader: `/fleet/ask id`, `/fleet/add id code`, `/fleet/remove id`, `/fleet/viewport id x y w h`, `/fleet/trim id ms`, `/fleet/identify id`, `/fleet/lookahead ms`, `/fleet/sidebyside`, and `/step 1` or `/step -1` for the next or previous column.

The media go by themselves: what the leader has and a machine lacks is copied in the background, without troubling the picture (about 17 MB/s on a loaded Mac, 50 at most), and a cut copy goes on where it stopped. A file a layer is waiting for starts as soon as it arrives. A file the leader no longer has stays on the others. Files you copied by hand are kept when their size is right. Each film then follows the leader's: a small difference by playing a little faster or slower, a large one by a jump ahead and a wait for that moment. *Devices* shows how far off each machine is. On Android the system's player plays the media, and does not follow yet.

## OSC

The mapper listens on UDP 9000 (`--port`), in its own words and in those of Millumin and Resolume, single messages or bundles. Send to the leader: the others follow.

| Doing | The mapper's words (from 0) | Millumin (from 1) | Resolume (from 1) |
|---|---|---|---|
| A column | `/column n`, `/step 1`, `/step -1` | `/action/launchColumn n` or `"name"`, `launchNextColumn`, `launchPreviousColumn`, `launchOrStopColumn`, `stopColumn` | `/composition/columns/n/connect` |
| A clip | `/cell column layer` | `/index:n/startMedia column` | `/composition/layers/l/clips/c/connect` |
| Stop | `/stop`, `/stop layer` | `/index:n/stopMedia` | `/composition/disconnectall`, `/composition/layers/l/clear` |
| Opacity | `/layer/n/opacity v` | `/selectedLayer/opacity`, `/layer:name/opacity`, `/index:n/opacity` | `/composition/layers/l/video/opacity`, `/composition/layers/l/master` |
| A corner | `/layer/n/corner i x y` | `/index:n/mapping/topLeft x y` (and `topRight`, `bottomRight`, `bottomLeft`) | |
| The film | `/layer/n/time s`, `normalizedTime`, `speed`, `pause` (1, 0, -1 swaps), `/transport play\|pause\|toggle\|stop` | `/index:n/media/time` (seconds or `hh:mm:ss.mmm`), `media/speed`, `media/normalizedTime`, `pauseMedia`, `startOrPauseMedia`, `/action/play`, `pause`, `playOrPause` | `/composition/layers/l/clips/c/transport/position` |
| Test card | `/card grid\|focus\|colours\|white\|off` | `/action/displayTestCard`, `hideTestCard` | |

The prefix `/millumin` is optional, case does not matter in their words, and a button let go (`0`) does nothing. All other settings are the `/layer/n/...` of `mapping.json`.

**Being told.** `/feedback/subscribe [port] [host] [mapper|millumin|resolume]` asks to be told what happens, in those words, from now on and after restarts; with nothing, the sender at the port it sends from. `--feedback host:port[:words]` does it from the command line, `/feedback/unsubscribe [port] [host]` ends it. A message with the argument `?`, an address ending in `/?` and `/ping` answer with the whole state.

- Mapper: `/column/launched n name`, `/column/stopped n name`, `/layer/n/playing media duration`, `/layer/n/stopped media`, `/layer/n/paused 0|1`, `/layer/n/opacity v`, `/layer/n/time t duration` (ten times a second while a film plays), `/fleet/device/id/state online fps videoMs name` (each second).
- Millumin: `/millumin/board/launchedColumn`, `stoppedColumn`, `/millumin/index:n/mediaStarted`, `mediaPaused`, `mediaStopped`, `opacity`, `media/time`, `/millumin/selectedLayer/media/time`.
- Resolume: `/composition/columns/n/connect`, `/composition/layers/l/clips/c/connect`, `clips/c/transport/position`, `/composition/layers/l/clear`, `video/opacity`.

**Chataigne.** Open `chataigne/mapper-control.noisette`: a plain OSC module, listening on 12000 and sending to `127.0.0.1:9000` (change the address for another machine), with actions for the columns, the transport and the cards, and two variables, the opacity and the speed of the film on layer 1, mapped to OSC. Trigger *Tell me what happens* first. The file was written from Chataigne's format and has not been opened in a real Chataigne yet; a test sends everything it says to a mapper.

Each machine keeps its own media under the same names, for now: nothing copies them yet, and a video starts at the same moment on each machine but is not held to the clock afterwards. A machine that loses the leader keeps playing, and catches up when it comes back.

The **sync** card of *Calibration* (or `/card sync` over OSC) draws a bar that crosses the whole canvas from the shared clock alone, with a frame counter and each player's clock error: film it with a phone to see how far apart the screens are. For now each machine still has its own show; replicating it is the next step.

### Sending media, following the device

**Send files** and **Send a folder** in the library, or a drop on the window, open a window that follows each file; close it and they keep
going. The bar at the bottom shows the device (address, system, frame rate, memory, load) and its **i** lists what runs on it. Drag the
edges between the library, the views, the inspector and the grid to resize them: the sizes stay in this editor.

### What a clip shows of its picture

A clip's **fit** says how its picture takes the zone: **stretch** fills it and deforms, **contain** shows it whole with bars, **cover**
fills it and cuts what exceeds, **width** or **height** makes that side span the zone. The inspector says what is cut, and shows the
picture with the part on screen: drag that part to choose what shows, and **scale** to go closer or further. **x**, **y**, **rotation** and **opacity** place the picture in its zone, apart from the layer's own settings.

### Moving a zone, going back

In *Output*, drag a zone to move it whole, or press the arrows with no point selected (1 pixel, with Shift 10); corners linked to it
follow. **Undo** and **Redo** (Cmd or Ctrl+Z, Shift+Cmd+Z or Ctrl+Y) go through the actions, and *History* lists them: click one to go
back to it. A drag or a run of arrows is one action. What plays stays as it is, firing a clip is not an action, and the list lasts until
the app stops.

### The room in 3D

Enter a surface's real size and the projector's throw ratio in *Room*: the editor works out where each surface stands in the room
from its corners, and shows the scene with three.js, in the browser and in the native client. Drag to turn around it, use the wheel
to move closer. **Scene GLB** saves it (in metres, the projector at the origin) for a web page with three.js or `model-viewer`, or
for Blender.

![The room](../../../docs/img/mapper-room.png)

The corners and the lens give each surface its shape. A scale needs one more fact: the size you type, or a link. In *Output*, select a
corner, press **Link point**, then click the corner of another layer that is the same physical point. They now move together, and
the 3D view joins the two surfaces there, so one typed size scales everything linked to it. **Unlink** separates them.

### Sound

On Android a layer plays the sound of its media. *Sound* is the mixer: a master volume and a mute, which belong to the device (a
scene does not change them, a restart keeps them), and each layer's volume. The sound leaves by the device's own output, its speaker
or what is plugged into it; Android mixes everything to that output, so two physical outputs cannot have different levels. Its volume
keys set the level above the mixer. On a computer the layers show the picture only for now.

### Options

*Options* holds what stays with your browser or client: the frame around the selected layer on the projector, the focus ring on the
canvases, the steps of the arrow keys (1 and 10 by default). The status card is there too.

## What runs where

| Device | State |
| --- | --- |
| macOS | runs; video through `zinc:video`, no sound on layers |
| Android 4.4, RK3128, Mali-400 (Toumei C800) | runs at 56-57 images per second shown on a 59 Hz panel, hardware decoding, sound |
| Android 5 and later (Xiaomi box, Chromecast) | the same APK should run; not tried yet |
| Raspberry Pi 3 and later | builds; not run on hardware |

Android 4.4 is below Zinc's export floor, so its APK takes a patch after the export:

```sh
zinc export examples/video/mapper --target android
sh docs/reports/hardware/toumei-c800-api19.sh apply examples/video/mapper/dist/mapper-android
```

## Control it from anything

The editor speaks one small HTTP API, and every setting is also an OSC command on UDP 9000: a lighting desk, TouchOSC or a script
can drive a show. The address space is in [docs/plugins/mapping.md](../../../docs/plugins/mapping.md); `/column <n>` plays a column, `/cell <column> <layer>` one clip, `/stop [layer]` empties one layer or all,
`/hud <0|1>` shows the status card, `/volume <0..1>` and `/mute <0|1>` set the master, and `/card <kind> [target]` shows a calibration card
(`grid`, `focus`, `colours`, `white` or `off`; target -1 the whole output, -2 every layer, or a layer).

Anyone who has the token controls the mapper, and OSC has no token at all: keep the device on a network you trust.

## Where it goes

- **A fleet, in sync.** Every device keeps its own media and plays from one shared clock, the way Sonos and AirPlay 2 groups do.
  This is studied, not built: the design and its limits (one refresh at worst without genlock) are in
  [docs/reports/mapper-fleet-sync.md](../../../docs/reports/mapper-fleet-sync.md).
- **Live from a master.** Devices joined by Ethernet, following one operator's edits and sources. Later.
- **An iOS companion** that scans the room and gives the 3D model. Later, if the typed sizes turn out not to be enough.

## The code

| Path | Role |
| --- | --- |
| `src/main.ts` | composes everything, the frame loop, the remote's keys |
| `src/layers.ts`, `src/live.ts`, `src/hud.ts` | the demo layers, a live image, the status card and its QR code |
| `src/services/` | one file per outside thing: `web` (the editor's server), `mediaStore`, `show` (columns), `scenes`, `cards`, `sound`, `control` (commands), `layerMedia` (video on a computer) |
| `editor/src/model/` | the maths, with no interface: warp, the surface's pose from its corners, the GLB, the SVG templates |
| `editor/src/components/`, `editor/src/services/` | the editor's views, its link to the mapper, its file dialogs |
| `tests/` | `model_check.ts` (the maths), `editor-check.mjs` (the HTTP API) |
