# Defined WebGL storage (ZN-701)

The wrapper now initializes uncompressed texture allocations and renderbuffers immediately. Texture staging is bounded to 64 KiB or one row, whichever is larger, instead of allocating a whole CPU image. Every mip, cube face and 3D/array layer is uploaded under an RAII unpack/PBO guard. Driver allocation errors remain visible and stop initialization before metadata is updated.

Renderbuffers use a temporary framebuffer and typed clears: normalized/float color zero, signed/unsigned integer color zero, depth one and stencil zero. The guard restores separate READ/DRAW bindings, scissor, rasterizer discard, depth/stencil write masks and the affected color mask (including indexed masks). The user's framebuffer draw/read-buffer choices and clear values are untouched.

`copyTexImage2D` keeps the direct path for entirely in-bounds copies. Otherwise it builds a zeroed temporary image, copies only the source intersection, then defines the destination. Saving the source before redefining the destination retains the existing different-mip alias detour. Subimage copies validate the original destination rectangle first and only copy the source intersection; outside destination texels remain unchanged. Coordinates use widened arithmetic. Read/copy/blit completeness checks select the READ framebuffer independently of DRAW.

## References

- [WebGL 1: reads outside the framebuffer](https://registry.khronos.org/webgl/specs/latest/1.0/#READS_OUTSIDE_FRAMEBUFFER): a new copied image is zero outside the source; a subimage destination is untouched there. The original task description incorrectly grouped the two behaviors.
- [ANGLE GL blits](https://raw.githubusercontent.com/google/angle/main/src/libANGLE/renderer/gl/BlitGL.cpp): temporary framebuffers, state isolation and typed resource clears.
- [Firefox framebuffer initialization](https://raw.githubusercontent.com/mozilla/gecko-dev/master/dom/canvas/WebGLFramebuffer.cpp): resource initialization and attachment clearing with depth one/stencil zero.

Immediate initialization avoids a new lazy resource lifecycle. Its cost is additional zero uploads/clears at allocation time; no performance claim or large-allocation benchmark was made.

## Focused proof

`tests/run --only webgl_initialization` compiles a driver-spy check and runs a small real WebGL 1/2 program. The spy checks explicit bounded zero uploads, allocation failure, and PBO/unpack restoration. The program checks partial/fully outside/extreme-coordinate copies, original destination validation, nonzero subimage preservation, aliasing between mip levels, 3D copies/storage, null reallocation, signed/unsigned renderbuffers, integer textures, hostile/indexed masks, depth/stencil and multisample resolve. No conformance page campaign is part of this test.

AMD verification and the full Apple Silicon pass list remain acceptance gates. The known AMD failures are retained until those actual pages pass on the affected driver.
