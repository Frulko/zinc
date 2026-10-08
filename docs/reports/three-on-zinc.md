# Real three.js on zinc's WebGL 2 (ZN-204)

three.js r186.1 (MIT, `third_party/three`, unmodified from the npm tarball) runs on the QuickJS engine (`zinc run <file> --engine quickjs`) over `zinc:webgl` (ZN-203): `WebGLRenderer`, `GLTFLoader`, shadow maps and instancing, with no shim beyond the DOM bits three touches.

## What had to change in the engine

| Where | Why |
|---|---|
| `src/gl/webgl1.cpp` `translate` | three defines `#define gl_FragColor pc_fragColor`; the driver refuses a macro named after a compatibility built-in. In GLSL ES 3.00 sources `gl_FragColor` and `gl_FragData` are renamed (`zn_FragColor`, `zn_FragData`) |
| `src/gl/webgl1.cpp` `getUniformLocation` | struct member names (`directionalLights[0].direction`) were refused, so every light was silently dropped; the active uniform is now matched by its whole name |
| `src/gl/webgl1.cpp` | 32 texture units (MAX_COMBINED_TEXTURE_IMAGE_UNITS was reported as 32 but `activeTexture` stopped at 8; three binds `TEXTURE0 + max - 1`) |
| `src/gl/webgl1.h`, `webgl1_more.cpp` | every sampler type (3D, array, shadow, integer) takes a unit through `uniform1i` / `uniform1iv` |
| `src/gl/webgl2_tex.cpp` | unsized `RGBA` on 3D and array textures is valid (three's placeholder textures) |
| `src/qjs/qjs.cpp` | an `importmap.json` next to the entry maps bare specifiers (`import 'three'`, which `GLTFLoader` uses) |
| `src/qjs/prelude.cpp` | `TextEncoder`, `TextDecoder` (UTF-8), `AbortController` |

## The comparison

`tools/three-compare` renders each scene of `tests/three/scenes.mjs` twice: on zinc (`run-<scene>.mjs`) and in headless Chrome (`page.html`, the same module), 128 x 128, antialias off, and compares luma SSIM and the mean RGB error with `tests/three/ref/<scene>.png`. `--update-refs` renders the references again (needs Google Chrome). Gate: SSIM >= 0.90, mean error <= 12; test `tests/t1/three.sh`.

| Scene | SSIM | mean error | GL calls (init + one render) | one render | wall | peak RSS |
|---|---|---|---|---|---|---|
| cube (`MeshNormalMaterial`) | 1.000 | 0.00 | 128 | 67 | 0.5 s | 84 MB |
| instanced mesh + PCF shadow map (`MeshStandardMaterial`, 9 instances) | 1.000 | 0.00 | 425 | 364 | 0.5 s | 87 MB |
| glTF (GLB cube through `GLTFLoader.parse`) | 1.000 | 0.00 | 175 | 114 | 0.4 s | 87 MB |

Measured on macOS arm64 (Apple's GL 4.1 core through the zinc wrapper), release build. The numbers are the whole process (QuickJS, three, the GL context).

## Not done

- **T2 / Pi 3 (WebGL 1):** r186 needs WebGL 2. The last three.js with a WebGL 1 renderer is r162 (r163 dropped it); running that release on a GLES2 context is the open half of the acceptance criterion.
- **EXT_color_buffer_float and the other extensions:** `getSupportedExtensions()` is empty, three logs a warning and falls back; the extension round belongs to ZN-203.06.
- **Real hardware numbers** (Pi 4 / Pi 5): no hardware here; the simulator gives call counts only.
