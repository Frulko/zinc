# The Vita 3D shader pair (ZN-493, first milestone)

The 3D draw entrypoint (`targets/vita/gxm_3d.cpp`, built with
`tools/build-console-core vita --gxp3d`) needs a compiled colour program pair
with a z. **The pair is committed here now**: `color3d_v.gxp` (504 bytes) and
`color3d_f.gxp` (228 bytes), real GXM blobs generated on the build machine by
the open-source path below (not invented, not copied).

## How the pair is compiled (from this machine's sources)

```sh
# 1. GLSL -> SPIR-V (vendored glslang next/third_party/glslang/glslang/, built
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

Only these three files are the pair's compiled form; the test
`next/tests/t0/vita_gxp_3d.sh` checks that every blob present is a real
GXP (`GGP\0` magic, non-empty) and, when none is checked in, exits 77 with the
reason, never failing the build.
