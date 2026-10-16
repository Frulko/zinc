# Zinc against Flutter, PocketJS, Lynx and React Native: a first measured comparison

Date: 2026-10-17. Status: partial. Zinc and Flutter are measured side by side on this Mac; PocketJS, Lynx and React Native are not (see "What was not measured and why"). Scripts: `examples/perf-compare/`.

## Method

Machine: Intel Mac (x86_64, macOS 15.7), the development machine, shared with other agents. Four equivalent screens, written once per framework:

| Screen | Content |
|---|---|
| hello | one centred text, nothing animated (idle cost) |
| list | 1000 rows (text and a bottom border), auto-scrolled 40 px per frame, down 200 frames and back |
| anim | a counter and a bar width updated every frame |
| input | a text field that receives one character per frame, plus a "n chars" label |

Builds: Zinc `zinc build` (AOT to C++, release, one 5.1 MB executable, ZINC_BACKGROUND=1); Flutter 3.35.7 stable (Oct 2025, the SDK in the unzip of the official release), `flutter build macos --release` (AOT, Skia/Impeller default of that version).

External measurements, identical for both (`measure.py`): cold start = launch until the process owns a window over 100 px (median of 5 fresh launches); RSS and CPU of the process tree sampled with `ps` over the second half of a 10 s run (CPU 100 = one core). Per-frame work (`frames.sh`): Zinc `ZINC_PROFILE=1` "work" (app + layout + paint + diff, GPU submit not counted); Flutter `FrameTiming.totalSpan` (build + raster, vsync to raster done). These two are close in meaning, not identical.

## Results (Zinc AOT vs Flutter release, same Mac)

The `run.sh` numbers (start, RSS, CPU) were taken when the 1-minute load average was under 4 (the script waits for it). Frame times:  Zinc's were taken through the same gate; Flutter's are from one manual run that was NOT load-gated (the machine stayed above 7 for the next hour), so treat them as indicative only.

| | Zinc AOT | Flutter release |
|---|---|---|
| Executable / bundle | 5.1 MB (one file) | 38.5 MB (.app) |
| Cold start, hello (ms) | 198 | 254 |
| Cold start, list / anim / input (ms) | 193 / 193 / 194 | 243 / 231 / 230 |
| RSS hello / list / anim / input (MB) | 92 / 95 / 92 / 93 | 91 / 93 / 93 / 110 |
| CPU hello (idle) | 4.4 % | 0.2 % |
| CPU list / anim / input | 8.2 / 4.2 / 6.6 % | see caveat 3 / 5.3 / 27.9 % |
| Frame work p50 / p99, list (ms) | 0.56 / 5.65 | 0.92 / 6.16 (not gated) |
| Frame work p50 / p99, anim (ms) | 0.04 / 0.14 | 0.89 / 3.14 (not gated) |
| Frame work p50 / p99, input (ms) | 0.05 / 0.28 | not measured |

Reading: on these tiny screens Zinc starts about 20 % faster, ships a binary 7x smaller, and does less CPU work per frame on animation (a retained tree where a signal changes one text and one width, against a widget rebuild). Memory is a tie: about 90 MB for both, which means a good part of it is the window system and GL context, not the framework. The input screen costs Flutter 28 % of a core against 6.6 % for Zinc, but Flutter's number includes the text-editing controller being rewritten and the whole `Scaffold` rebuilt every frame by my twin; a real app would not do that, so do not quote this ratio.

## What was not measured and why

- **PocketJS**: it has a portable Rust macOS host (`hosts/desktop`, wgpu + winit, `bun run macos hero`). I downloaded the repository but did not build it: compiling the wgpu stack on a machine whose load was 8 to 100 for two hours would have disturbed every other measurement, and the app that exists there is its Hero demo and a markdown note, not my four screens. Its own published numbers (an Apple M3 Max, so not comparable with this Intel Mac, and for a markdown editor): cold start to first frame 149 ms, 83 MB idle, 10 MB on disk, 1 process; 2.2 ms of JavaScript per frame on a PSP at 60 fps; an 8 MB budget for a complete animated app. PocketJS runs app code in the QuickJS interpreter.
- **Lynx**: the documented hosts are the iOS Simulator and Android "Explorer", plus HarmonyOS; there is no desktop host. A simulator run on an Intel Mac would measure the simulator. Public material gives only architecture claims and a "2 to 4 times faster launch than web" statement, nothing comparable. No number is quoted here.
- **React Native**: `react-native-macos` needs a Pod install and a full Xcode build of React Native itself (tens of minutes of CPU) and a Hermes/Metro setup; skipped for the same load reason. It is an AppKit-widget framework with a JS thread; expect a larger bundle and memory than Flutter and Zinc, but this is a guess, not a measurement.

## Caveats

1. Different renderers: Zinc draws its own tree with its GLES-class GPU layer, Flutter with Skia/Impeller, so frame "work" is not the same set of operations.
2. Flutter is one year older than Zinc's date (3.35.7); newer Impeller on macOS may differ.
3. The first Flutter `list` run did nothing (CPU 0.0 %): my twin crashed in the first tick (`maxScrollExtent` null) and was fixed afterwards. The corrected build was only measured for frame times, not for CPU, so its list CPU is missing.
4. Zinc idles at 4.4 % CPU on `hello` because my scripted callback runs every frame; Flutter idles at 0.2 % because it draws nothing when nothing changes. Zinc's own idle behaviour with no per-frame callback was not measured.
5. "Start" is the first window, not the first painted pixel; both are measured the same way. The machine was shared and loaded, so absolute numbers are noisy (the 5 start samples spread by about 10 %).
6. Zinc was run as an AOT executable; `zinc run` (interpreter or QuickJS) was not measured.
7. Energy, input-to-frame latency, and release-vs-debug were not measured.

## Where Zinc is good and bad

Good: size and cold start (a 5 MB file, no runtime to unpack), retained-tree updates by signal (almost free per frame), a 1000-row list at 0.56 ms p50 without virtualisation work from the author, and one binary for all targets.
Bad or unproven: idle cost with a per-frame callback (4 % of a core is a battery cost), p99 spikes on the list (5.65 ms against a 0.56 median, probably first-time text shaping for rows entering view), ~90 MB of RSS for a hello screen, and no measurement yet on a phone or a small board, where the ranking against Flutter and PocketJS is the real question.

## Improvement ideas

1. Make an app with no animation and no input sleep: draw only when a signal, input event or timer is due, and measure `hello` at 0.2 % like Flutter.
2. Find what the 90 MB of `hello` is (GL context, font atlas, mimalloc arenas) with `zinc mem` and `resmon`; a 40 MB hello is plausible and is the PocketJS comparison that matters (83 MB idle for a gpui editor).
3. Warm the text-shaping cache for the rows just outside the viewport in the idle part of the frame to cut the list p99 (5.65 ms).
4. Add a real `FlatList`-style virtualised row path to the perf screen and compare 100000 rows, where Flutter's `ListView.builder` is the reference.
5. Put this perf-compare run into `tools/bench` as a gated milestone job, and add a build of the PocketJS desktop host and a `react-native-macos` hello when the machine is idle, so the table can be completed.
