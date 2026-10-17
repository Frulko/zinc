// ZN-493 (first milestone): the 3D colour program pair, GLSL-style source of the Cg program
// compiled by the Vita shader compiler into targets/vita/shaders/zn_gxp_3d.h (README.md).
// Reference only: the Vita runs the compiled GXP; this file never reaches the device.
//
// Why not SDL's pair (SDL_render_vita_gxm_shaders.h, gxm_shader_color_v/_f): the blob holds
// exactly three parameters, aPosition (2 components, SDL's own render path feeds (x,y) with
// componentCount 2 in SDL_render_vita_gxm_tools.c), aColor and wvp; the GXP is precompiled
// USSE and cannot gain a z uniform or a third position component at load time.

uniform mat4 wvp;          // world-view-projection, column major: clipPos = wvp * vec4(aPosition, 1.0)

in vec3 aPosition;         // model space
in vec4 aColor;

out vec4 vColor;

void main() {
    vColor = aColor;
    gl_Position = wvp * vec4(aPosition, 1.0);
}
