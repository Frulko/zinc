# Native embedding

`include/zn/embed.h` is the C/Swift-importable surface API in `zn_app`.
One program, one surface, one host thread; calls are not reentrant. The host owns
scheduling and never forwards its whole application's input queue.

Build on macOS:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zn_app zinc
ZINC=build/zinc tests/run --only embed
```

Compile a Zinc program with `ZN_AOT_CPP_ONLY=1 build/zinc build <entry> -o <prefix>`.
`tools/link-embedded <prefix> <executable> <shell.cpp>` links its generated C++ and
the host shell against `build/zn_app.link`. No compiler/CLI is required at runtime.
The helper currently targets macOS; other platforms are unverified.

Call `zn_embed_install(logicalWidth, logicalHeight, integerScale)` before the
program's generated `zn_app_init(argc, argv)`. Check both return codes. The existing
`HalDisplay` path owns input and pixels, so the SDL HAL creates no window.
Call `zn_embed_tick()` on the host thread; 0 means running, 1 finished, -1 failed.
Pause before hiding; resize between ticks. Stop scheduling before `zn_embed_quit()`.
Shutdown is idempotent. Restarting after shutdown is not supported by this first
contract: the runtime retains process-global graphics state.

`zn_embed_frame` returns a persistent owned buffer, physical dimensions, byte
stride and presentation serial. Top-left origin, premultiplied `0xAARRGGBB`, BGRA
bytes on little-endian hosts. Copy before the next tick if the native compositor
reads asynchronously. Resize/quit invalidates the pointer. Unchanged frames keep
the serial; CPU damage does not imply partial GPU uploads.

Opaque output adds alpha 255 to existing RGB raster output. Before initialization,
`zn_embed_transparent(1)` opts into transparent CLEAR commands. The command-list
rasterizer renders over black and white and reconstructs coverage using the
existing hardware-layer compositing helper. This supports semitransparent paint,
text coverage and shadows without colour-key fringes; it costs two full CPU
raster passes on each changed frame. All CLEAR commands become transparent in
this mode. GPU shader layers and native child views are outside this contract.

Events use local logical coordinates. Pointer button edges and keys are bounded
by the existing HAL queues (8 button edges, 32 keys, 256 UTF-8 bytes per poll).
Return 0 means invalid/full; return 1 means queued, **not that a Zinc widget
consumed the event**. Hosts own focus, pointer capture outside the region and
blocking globally polled gameplay input while editing UI. Blur clears held input.
Committed UTF-8 is supported; IME composition/candidate placement, native clipboard,
accessibility semantics and screen keyboard integration remain host work.

The test runs a real AOT program and asserts no SDL window, alpha/colour, pointer
input, pause/resume, Retina resize and repeated shutdown. `app_library` retains
the existing standalone shell regression and should be run after integration.
