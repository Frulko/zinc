# The Vita 3D shader pair (ZN-493, first milestone)

The 3D draw entrypoint (`targets/vita/gxm_3d.cpp`, compiled only with
`-DZN_VITA_GXP_3D=1`) needs a compiled colour program pair with a z. The blob is
**not committed yet**: no shader compiler is on this machine. Until it is, the
2D replay (`gxm_vita.cpp`) builds and behaves unchanged and the 3D path stays
out of the build.

## Why SDL's blob cannot be used for 3D

`gxm_shader_color_v`/`_f` (vendored SDL3, `SDL_render_vita_gxm_shaders.h`) are
the same precompiled GXP blobs SDL's own Vita render path uses
(`SDL_render_vita_gxm.c`/`_tools.c` build their colour pair from them). They
hold exactly three parameters, visible in the blob's own string table:
`aPosition`, `aColor`, `wvp` — no z uniform — and SDL itself feeds `aPosition`
with `componentCount = 2` (x, y; the compiled code applies `wvp` to a 2D
position). A GXP is precompiled USSE: it cannot gain a uniform or a third
position component at load time, and the shader patcher patches, it does not
extend. So a 3D pair must be compiled from source.

## Why nothing was compiled here

- No `vita-shader-compiler` (or `shacc`) in PATH, in `~/VitaSDK/bin` (absent)
  or in the pinned toolchain `~/.zinc/toolchains/vitasdk-aarch64-macos-20261015`
  (checked `bin/`: gcc toolchain, `vita-elf-*`, `vita-pack-vpk`, no shader tool).
- The per-D144 method compiles Cg with SceShaccCg (`libshacccg.suprx`) **on a
  real console**; vitaGL's extracted-module route is rejected by D144.

## How to compile the pair (maintainer step, once, then commit the .gxp)

1. Get `vita-shader-compiler` (github.com/Rinnegatamante/vita-shader-compiler)
   or run SceShaccCg on a console, per D144's method. Translate
   `color3d.vert`/`color3d.frag` to Cg first (`in`→attribute/input,
   `out`→output; same names `aPosition`, `aColor`, `wvp`, `vColor`).
2. Compile to `color3d_v.gxp` and `color3d_f.gxp` (do not invent bytes: the
   blobs must come out of the compiler).
3. Generate the header the build expects, from the real blobs:

   ```sh
   xxd -i targets/vita/shaders/color3d_v.gxp | sed 's/^/.../' > targets/vita/shaders/zn_gxp_3d.h
   ```

   (or any generator); the result must define

   ```c
   #define zn_color3d_v_size <n>
   static const unsigned char zn_color3d_v[zn_color3d_v_size] = { ... };
   #define zn_color3d_f_size <n>
   static const unsigned char zn_color3d_f[zn_color3d_f_size] = { ... };
   ```

4. Rebuild the Vita core with the 3D path:

   ```sh
   cmake -B build/console-vita -DZN_VITA_GXP_3D=ON   # the configured build directory
   cmake --build build/console-vita
   ```

   A `ZN_VITA_GXP_3D=1` build without `zn_gxp_3d.h` fails at configure time
   naming the shader.

`next/tests/t0/vita_gxp_3d.sh` checks the state: passes when the committed
blobs are present and look like GXPs, exits 77 (SKIP) while they are not.
