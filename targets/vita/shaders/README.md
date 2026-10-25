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

# The zinc:3d vertex program (`tex3d.vert`)

`plugins/3d/native/render3d.vita.cpp` draws zinc:3d with one vertex program,
`tex3d.vert` (position and uv of the mesh, the draw's shaded colour, the `Wvp`
matrix), paired with SDL's texture fragment program (texture x colour, the
COLOR0 and TEXCOORD0 varyings psp2spvc gives its first vec4 and vec2 outputs).
psp2spvc translates only loads, stores, vector arithmetic, dot, normalize,
min, max, pow and matrix x vector: no branch, no division, no texture
sampling, and its register allocator gives up on the per-vertex lighting
("Cannot allocate space for temporary register"), so the lighting is computed
on the CPU and the program only transforms. It reads a matrix by rows: the
renderer uploads `Wvp` transposed.

Rebuild it from a checkout of psp2spvc (1whatleytay/psp2spvc, commit 1c296ab;
its `external/usse-decoder-gen` submodule is gone from GitHub and not needed,
the generated `src/gxp/src/instructions.cpp` is committed) and glslang
(KhronosGroup/glslang, `glslang-standalone`):

```sh
git -C psp2spvc submodule update --init external/fmt external/SPIRV-Cross
cmake -S psp2spvc -B spvc-build -DCMAKE_CXX_FLAGS="-w" && cmake --build spvc-build
glslang -V tex3d.vert -o tex3d-v.spv
spvc-build/src/psp2spvc tex3d-v.spv -o tex3d-v.gxp
```

then write `zn_gxp_tex3d.h` from `tex3d-v.gxp` (the bytes as
`zn::vita::gxp3d::tex3dVertexProgramGxp`, 16-byte aligned). The same tools
rebuild `color3d-v.gxp` and `color3d-f.gxp` byte for byte (checked
2026-10-25).
