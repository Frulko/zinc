# Third-party code and toolchain (SBOM)

What a Zinc program or build can contain that Zinc did not write, with versions as of the security audit
(2026-09, [reports/security-audit.md](../reports/security-audit.md)). Licenses: [licenses.md](../licenses.md).

## Vendored in the repository (compiled into programs)

| Component | Version | Where | Used by | Notes |
| --- | --- | --- | --- | --- |
| stb_image | v2.30 | `plugins/three/native/stb_image.h` | programs importing `three` (glTF textures) | PNG and JPEG only (`STBI_ONLY_PNG`, `STBI_ONLY_JPEG`), `STBI_MAX_DIMENSIONS 16384` and at most 2^24 pixels per image, internal asserts abort. GitHub Security Lab reported memory-safety issues in stb_image in 2023 ([GHSL-2023-145…151](https://securitylab.github.com/advisories/GHSL-2023-145_GHSL-2023-151_stb_image_h/), CVE-2023-45661…45667); some affect the GIF decoder, which is compiled out here. We did not check each one against the PNG and JPEG paths; treat glTF from untrusted sources accordingly. `tests/fuzz/image.cpp` fuzzes the configuration Zinc uses. |
| Inter (Regular, Bold) | 4.x (as shipped in `lib/fonts`) | `lib/fonts/Inter-*.ttf` | UI programs (embedded, rasterized by `runtime/ttf.cpp`) | OFL-1.1 (`lib/fonts/LICENSE-Inter.txt`) |
| JetBrains Mono (Regular) | 2.x (as shipped) | `lib/fonts/JetBrainsMono-Regular.ttf` | UI programs (`mono`) | OFL-1.1 (`lib/fonts/LICENSE-JetBrainsMono.txt`) |

Everything else in `runtime/` and `plugins/` (JSON, SVG, Lottie, glTF, TrueType, vector-tile and map-style parsers,
the rasterizer, the HTTP/MQTT/OSC/WebSocket code) is Zinc's own code, covered by `tests/fuzz/`.

## System libraries linked by modules and plugins

Linked only when a program uses the module or plugin. Versions are those of the build environments used for the audit;
the device's own copies are used when linking dynamically.

| Library | Linked by | macOS (Homebrew) | linux SDK (`zinc/sdk-linux`, Debian trixie) | rpi1 SDK (`zinc/sdk-rpi1`, Alpine 3.20) |
| --- | --- | --- | --- | --- |
| libcurl | `zinc:net` (fetch) | system | 8.14.1 (`libcurl4-openssl-dev` 8.14.1-2+deb13u5) | 8.14.1-r2 |
| SDL3 | windowed HAL (macos, linux) | 3.4.16 | device package | – |
| libgpiod | `zinc:gpio` with `ZRT_GPIOD=1` | – | device package | 1.6.4-r3 |
| FFmpeg (libavformat, libavcodec, libavutil, libswscale) | `zinc:video` | 8.1 | distribution package | distribution package |
| libgphoto2, libjpeg-turbo | `zinc:gphoto2` | 2.5.34, 3.2.0 | distribution package | distribution package |
| Mesa EGL / GLES2, GBM, libdrm | `display: "gl"` (KMS) | – | – | distribution package |
| WebKit | `zinc:webview` (macOS) | system | – | – |
| musl libc | static rpi1 exports | – | – | 1.2.5-r3 |

FFmpeg parses the video files a program opens: keep it updated on the device, and do not open media from untrusted
sources with a build that is not. FFmpeg and libgphoto2 are LGPL: a statically linked rpi1/rmpp export must let users
relink (ship objects or link dynamically).

## Toolchain and build images

| Image | Pinned base | Installed at build time |
| --- | --- | --- |
| `docker/sdk-linux` | `debian:trixie-slim@sha256:a99cfc51…` | g++ 14.2, cmake 3.31.6, ninja, libcurl dev |
| `docker/sdk-rpi1` | `alpine:3.20@sha256:d9e853e8…` (arm/v6) | g++ 13.2.1, cmake, make, binutils, curl-dev, pkgconf, libgpiod-dev |
| `docker/sdk-rmpp` | `debian:bookworm-slim@sha256:3783cc01…` (arm64) | g++, cmake, ninja, file |
| `docker/sdk-mips` | `debian:bookworm-slim@sha256:3783cc01…` | g++-mipsel-linux-gnu, qemu-user, cmake, make |
| `docker/sdk-psx` | `ubuntu:26.04@sha256:da6fc2be…` | PSn00bSDK v0.24 and PCSX-Redux, downloads checked by sha256 |
| `docker/sdk-ps2` | `ps2dev/ps2dev:latest@sha256:1511fde1…` | cmake, make |
| ESP-IDF (esp32) | `espressif/idf:v6.0@sha256:59df146f…` (`compiler/src/cli.ts`) | – |

Base images are pinned by digest; the distribution packages installed on top are not (they come from the
distribution's archive when the image is built). Images are built once (`zinc/sdk-*`); delete one to rebuild it after
changing its Dockerfile. The compiler itself runs on Node.js with `@typescript/typescript6` (Apache-2.0,
`pnpm-lock.yaml` pins it).

## Updating

- stb_image: replace the header, keep the `#define`s in `plugins/three/native/three.host.cpp`, run
  `scripts/fuzz.sh 300 image gltf`.
- A base image: `docker buildx imagetools inspect <image:tag>` gives the new index digest; update the `FROM` line and
  this table.
