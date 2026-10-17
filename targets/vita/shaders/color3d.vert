#version 310 es

// ZN-493 (first milestone): the 3D colour program pair, GLSL-style source of the Cg program
// compiled to targets/vita/shaders/zn_gxp_3d.h by stubs/../README.md: glslang -> SPIR-V ->
// psp2spvc (GXM GXP). Why not SDL's pair (gxm_shader_color_v/_f): the blob holds exactly
// three parameters, aPosition (2 components), aColor and wvp; the GXP is precompiled USSE
// and cannot gain a z uniform or a third position component at load time.

layout(std140, binding = 0) uniform Wvp {
    mat4 wvp;   // world-view-projection, column major: clipPos = wvp * vec4(aPosition, 1.0)
};

layout(location = 0) in vec3 aPosition;   // model space
layout(location = 1) in vec4 aColor;

layout(location = 0) out vec4 vColor;

void main() {
    vColor = aColor;
    gl_Position = wvp * vec4(aPosition, 1.0);
}
