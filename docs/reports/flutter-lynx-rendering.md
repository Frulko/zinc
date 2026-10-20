# How Flutter and Lynx render, and what Zinc takes from them

2026-10-19, asked by the owner after the first runs on a real iPad Pro (A9X, iOS 16.7): "comment font Lynx et Flutter, c'est de
eux qu'il faut apprendre". Context: D137 (iOS ships the software raster with a zero-copy Metal present), D119 (our own GPU layer,
one back end per API), the Metal back-end plan in the ZN-627 notes. Earlier analysis: `ui-rendering-architecture.md` §2.6
(Impeller), `gles2-2d-rendering-techniques.md`, `zinc-next-mobile-core.md`.

## The short answer

Flutter draws every pixel itself, on the GPU. Lynx draws nothing: each element becomes a native view and the system draws it.
Zinc sits between the two: it draws every pixel itself, like Flutter, but on the CPU, and only the present goes through Metal.

## Flutter: its own pixels, on the GPU (Impeller)

- **iOS is Impeller on Metal, with no way back.** Skia was removed from iOS in Flutter 3.29; `--no-enable-impeller` does nothing
  there. Impeller is the default on Android API 29+ (Vulkan, with a GLES fallback); older Android devices and the web keep Skia.
  Desktop moved to Impeller by default in 3.47 (secondary source).
- **Shaders are compiled at build time.** `impellerc` turns GLSL into SPIR-V, then into MSL (Metal) or the other back ends'
  languages, and every pipeline state object is created before the first frame. That was Impeller's first goal: Skia compiled
  shaders while the app ran, which made the first animations stutter ("shader jank").
- **Two threads.** The UI thread builds a display list; the raster thread replays it on the GPU. It is the split Zinc already
  has between building `raster::Cmd` lists and replaying them.
- **Shapes.** Convex shapes are tessellated on the CPU; concave ones use stencil-then-cover (one pass marks the shape in the
  stencil buffer, a second fills it); antialiasing is 4x MSAA, cheap on tiled mobile GPUs such as Apple's. An uber SDF shader
  covers rounded rectangles and shadows; a draw-order resolver batches opaque draws.
- **The embedder contract.** The engine is a library; the embedder owns the threads, vsync (CADisplayLink, Choreographer), the
  surface, input, and mirrors a semantics tree to the platform's accessibility.
- **The limit.** Even Flutter keeps a fallback for weak GPUs (Skia on old Android). It is what D126 measured on the Nexus 7:
  on Tegra 3 the GPU replay is slower per pixel than the CPU raster.

## Lynx: native views

- **Each element becomes a real `UIView` (iOS) or `View` (Android).** The system draws and composites them on the GPU with
  Core Animation or RenderThread. Lynx gets the platform's look, scrolling and compositor animations for free.
- **Two threads.** A short main-thread script renders the first frame and handles gestures; the app's logic runs on a
  background thread. The goal is an instant first frame (ByteDance's pain point with React Native).
- **A C++ core** shared by the platforms, with the layout and the element tree.
- **A renderer of its own?** Some secondary sources mention an optional pixel-perfect custom renderer; they contradict each
  other, and the official documentation (lynxjs.org) was not checked.

## Where Zinc stands (2026-10-19)

| | Flutter | Lynx | Zinc |
|---|---|---|---|
| Who draws | its own renderer | the platform's views | its own renderer |
| Where | GPU (Metal, Vulkan, GLES) | GPU through the system compositor | CPU raster; GLES 2 replay on desktop and some Android; Metal only for the present on iOS (D137) |
| Shaders | compiled at build time | the system's | GLSL ES compiled at run time by the GL driver |
| Threads | UI + raster | main-thread script + background logic | one thread builds and draws |
| Fallback | Skia on weak GPUs | none needed | the CPU raster is the default |

## What Zinc takes from them

1. **From Flutter, the GPU back end.** The Metal back end of the command lists planned in ZN-627 (D119, D137), with one
   correction from Impeller: convert the GLSL ES shaders to MSL at `zinc export` time (glslang to SPIR-V, then SPIRV-Cross),
   not at run time; create the Metal pipelines before the first frame; use 4x MSAA on Apple GPUs rather than per-primitive
   antialiasing. The same offline step serves the later Vulkan back end.
2. **From Flutter, the raster thread.** Build the command list on the program's thread, replay it on a second one, so a slow
   frame of the program does not stop scrolling.
3. **From both, keep the CPU raster.** It stays the reference (pixels byte-identical across targets) and the fallback for GPUs
   that are slower than their CPU, as Skia stays for Flutter.
4. **From Lynx, compositing by the system.** A scrolling view or a page transition can become a `CALayer` that Core Animation
   moves without redrawing (the music carousel line in `backlog/later.md`). And `NativeView` stays the way to embed a
   real platform control where fidelity matters (text input, maps, web views).
5. **From Lynx, the first frame.** Measure the time to the first frame on a real device and keep it short: the program's first
   render before anything optional loads.
6. **For 3D and three.js:** neither framework offers WebGL. The answer stays ANGLE on Metal (D30).

## Next step

Measure rn-showcase and music on the iPad Pro with `ZINC_PERF_HUD=1` (or `tools/zbench`). If the A9X misses 60 Hz full
screen, the Metal back end becomes a task (`New-task: owner`), as D137's revisit condition says.

## Sources

- [The New Stack: Lynx competes with React Native](https://thenewstack.io/cross-platform-ui-framework-lynx-competes-with-react-native)
- [Courier: why ByteDance built Lynx](https://www.courier.com/blog/why-bytedance-built-lynx-because-react-native-left-a-gap)
- [Lynx vs React Native vs Flutter](https://alexcloudstar.com/blog/lynx-vs-react-native-vs-flutter-tiktoks-new-framework-in-perspective/)
- [Impeller mandatory in Flutter, 2026](https://ecorpit.com/impeller-mandatory-flutter-android-ios-2026/)
- [State of Flutter 2026](https://devnewsletter.com/p/state-of-flutter-2026/)
- [Flutter roadmaps (archive)](https://flutter.googlesource.com/mirrors/flutter.git/+show/HEAD/docs/roadmap/%5BArchive%5D-Old-Roadmaps.md)
- [Flutter 3.47: Impeller by default on desktop](https://startdebugging.net/pt-br/2026/08/flutter-3-47-impeller-default-renderer-on-desktop/)
