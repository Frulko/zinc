---
id: ZN-439
title: Texture importer tex-basis and compressed uploads
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 19:05'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-434
  - ZN-435
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
basisu 2.50 as a pinned tool; KTX2; mipmaps; premultiplied alpha; sRGB; transcode per profile to BC1/BC3/BC7, ETC1/ETC2, ASTC and PVRTC1. display-gl uploads ETC1 (vc4) and BCn/ASTC (desktop). The WebGL layer gains the ETC1, ETC, ASTC and PVRTC extensions where the driver has them. Includes the texture decision record. Report: docs/reports/games/toolchain-assets-loading.md (3, 4.2, 9).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 for a 2048 px texture, the report gives pack and GPU bytes per profile
- [ ] #2 it renders in display-gl on macOS and on the Pi 3 (vc4) with ETC1 within a pixel tolerance of the RGBA path
- [x] #3 the determinism test passes with the thread count it fixes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (parallel worktree, 2026-10-11). Review: what is left is the Pi 3 (vc4) run of criterion 2; everything else passes on macOS.

What was built:
- basisu 2.50 as a pinned tool (src/tc: `zinc toolchain basisu`, `ZINC_BASISU`, listed by `zinc doctor`): no binary release exists, so the source archive (sha256 216e49e1...) is fetched once, checked, and built with the pinned zig without SSE, OpenCL or astcenc (353 s here at load 7).
- The `texture` importer (src/assets/texture.cpp): profile formats (release: the target's `texture` list; dev: rgba8; a rule's `format` wins), maxSize/pot, mipmaps with stb_image_resize2 2.18 (vendored), premultiplied alpha, rgba8/rgb565/rgba4444/rgba5551 in process, bc1/bc3/bc7/etc1/etc2/astc/pvrtc through basisu (UASTC per level, `-export_ktx`), ktx2 (uastc or etc1s) for the browser. ZIM1 gains the block formats and the mipmap and sRGB flags (include/zn/zim.h). report.json: packBytes per entry, format and gpuBytes per image, gpuBytes total. Release packs use the target's `pack` codec. The baker leaves texture-rule files to the packs.
- Run time: sys_host decodes BC1/BC3/BC7 (bcdec) and ETC1/ETC2 (etcdec) for the software raster and keeps level 0's blocks on the runtime image (zrt dyn_set_blocks); gl_replay uploads them with glCompressedTexImage2D where the driver lists the format (ETC1 as ETC2 RGB8 where only ETC2 exists), premultiplied texels divided back in the shader. ASTC/PVRTC: GPU only.
- WebGL: WEBGL_compressed_texture_etc1, _etc, _astc (getSupportedProfiles), _pvrtc where the driver has them.

Criteria (tests/t1/texture.sh, 16 s at 128 texels; TEXTURE_SIZE=2048: 284 s):
- #1 at 2048 (pack / GPU bytes): macos bc7 1,258,382 / 5,592,432, bc1 586,403 / 2,796,216; rpi1 rgba4444 1,445,085 / 11,184,810, etc1 1,211,201 / 2,796,216; wasm ktx2:uastc 1,861,396 and 1,592,918 / 5,592,432; etc2 983,643 / 5,592,432; astc 1,245,185 / 5,592,432; pvrtc 1,173,394 / 2,796,288 (table in docs/reports/zinc-next-assets.md).
- #2 macOS: display-gl, macos packs 0.000% over 24 / mae 0.58 against the RGBA path (BC1 uploaded as blocks, 2,097,152 bytes; BC7 decoded: GL 4.1 lists only 0x83f0 0x83f2 0x83f3); rpi1 packs (ETC1 decoded here) 0.043% / 1.81. Pi 3 not run (no board): Review.
- #3 "determinism: the macos and wasm packs of two copies are the same bytes" (two directories, two ZINC_HOMEs, basisu fixed at 4 threads; UASTC and ETC1S gave the same bytes with 1, 4 and 8 threads).

Tests run: texture, assets (t0, report grep updated), assets_test (texture checks added), assets_groups, tc, res, sprite_atlas, tilemap, splash, asset_reload, gl_replay_es2, webgl_js, webgl2_tex, webgl_module, image_rect, image_reuse; window tests once at the end, load 5.4 to 6: texture, image_rect_gl, many_images, gl_renderer: all pass. project_assets skipped (project_test not built; frontend unchanged).

Texture decision (for a decision record): basisu as the hub (report section 9, 64 against 49 and 49), delivered as pinned sources built with the pinned zig (61, against vendoring its 13 MB of sources 52 and linking the encoder 46); ZIM1 extended for every native format, KTX2 only for the browser; textures premultiplied and mipmapped by default (stb_image_resize2, alpha-weighted, linear light), atlas pages stay rgba8 with straight alpha on every profile (D95's pixel identity); dev builds rgba8; basisu at a fixed 4 threads. Revisit: CMA pressure on the Pi, a quality complaint (astcenc, bc7enc_rdo, etcpak as options), aarch64 bytes differing, basisu's first-use time.

Lines for later.md:
- Cross-platform pass: ZN-439: tests/t1/texture.sh on a Pi 3 (vc4, display-gl on KMS): the rpi1 packs' ETC1 uploaded as blocks (GL_OES_compressed_ETC1_RGB8_texture) within 2% / mae 3 of the RGBA path, and webgl_ext.js offering WEBGL_compressed_texture_etc1.
- Cross-platform pass: ZN-439: basisu built on aarch64 gives the bytes of x86_64 (SSE off): compare the packs of tests/t1/texture.sh across hosts; Linux Mesa offers WEBGL_compressed_texture_etc and uploads ETC1 as ETC2.
- ZN-439: share the UASTC encode of a texture across profiles in the cache: each profile encodes again (a 2048 texture: 12 to 19 s each).
- ZN-439: CPU decoders for ASTC and PVRTC1 (basisu's astc_helpers, a PVRTC decoder), so phone packs draw in the software raster.
- ZN-439: free a texture's CPU texels after its GPU upload on GL-only targets (the Pi): both copies are kept today.
- ZN-439: atlas pages in the profile's GPU formats (rgba4444/ETC1 on the Pi) once a game measures CMA pressure.
- ZN-439: basisu fetched prebuilt through the signed index (ZN-337): its first use downloads 190 MB of sources and builds for about 6 minutes.
- ZN-439: the importer as a plugin of kind importer (plugins/tex-basis) once importer plugins exist; it is built in for now.

usage: n/a (tools/usage printed n/a in the worktree)
<!-- SECTION:NOTES:END -->
