# The Vita 3D shader pair (ZN-493, first milestone)

The 3D draw entrypoint (`targets/vita/gxm_3d.cpp`, built with
`tools/build-console-core vita --gxp3d`) needs a compiled colour program pair
with a z. **The pair is committed here now**: `color3d_v.gxp` (504 bytes) and
`color3d_f.gxp` (228 bytes), real GXM blobs generated on the build machine by
the open-source path below (not invented, not copied).

## How the pair is compiled (from this machine's sources)

```sh
# 1. GLSL -> SPIR-V (vendored glslang third_party/glslang/glslang/, built
#    out of tree with -DENABLE_OPT=0):
glslang -V color3d.vert -o color3d-v.spv
glslang -V color3d.frag -o color3d-f.spv

# 2. SPIR-V -> GXP (github.com/1whatleytay/psp2spvc, built once on the build
#    machine; sources/vendor docs in targets/vita/shaders/README.md):
psp2spvc color3d-v.spv -o color3d_v.gxp
psp2spvc color3d-f.spv -o color3d_f.gxp

# 3. The C table the compiler reads (targets/vita/shaders/zn_gxp_3d.h) embeds
#    both blobs with the names the C++ uses (colorVertexProgramGxp,
#    colorFragmentProgramGxp, parameter "Wvp").
```

The shader sources are `color3d.vert`/`color3d.frag`: SDL's precompiled blobs
(`gxm_shader_color_v/_f`) hold three parameters (`aPosition` vec2, `aColor`,
`wvp`), no z and no third position component, and a GXP is precompiled USSE
that cannot gain a uniform at load time; these are compiled from source. One
deviation from the first notes: the pair's wvp parameter is a UBO block whose
name in the blob is `Wvp` (psp2spvc names uniform blocks by their block name);
`gxm_3d.cpp` looks the parameter up by that name. The blobs' string table
still holds `aPosition`, `aColor`, `Wvp`.

## What is committed

- `color3d.vert` / `color3d.frag` — the GLSL the pair was compiled from (the
  versions are fixed by the #version line, not by the tool download).
- `color3d_v.gxp` / `color3d_f.gxp` — the compiled blobs the Vita runs.
- `zn_gxp_3d.h` — the byte-table header generated from the two blobs.

Only these three files are the pair's compiled form.

# The zinc:3d vertex program (`tex3d-v.gxp`)

It transforms the mesh's position by `Wvp` (uploaded row by row) and passes the
uv and the draw's shaded colour (the lighting runs on the CPU) to SDL's texture
fragment program. Its Cg source is in `targets/vita/gxpc/gxpc.c`.

It is compiled by Sony's SceShaccCg, on a PS Vita:
1. Build the `gxpc` tool (its `CMakeLists.txt` names the commands).
2. Install `gxpc.vpk` and run it once. It needs `libshacccg.suprx` in
   `ur0:data` or `ur0:data/external`.
3. Fetch `ux0:data/zinc/gxp/tex3d-v.gxp` over FTP.
4. Write `zn_gxp_tex3d.h` from it: its bytes as
   `zn::vita::gxp3d::tex3dVertexProgramGxp`, 16-byte aligned.

The first version came from glslang and psp2spvc. It ran in Vita3K but crashed
a real Vita's GPU (2026-10-25): its header fields differ from those of Sony's
compiler. The colour pair above (`color3d-*.gxp`, ZN-493, off by default) comes
from the same tools and was never run on a console; build it with `gxpc` before
turning it on.
