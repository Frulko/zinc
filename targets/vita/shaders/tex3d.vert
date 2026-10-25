#version 310 es

// zinc:3d on GXM (plugins/3d/native/render3d.vita.cpp): the vertex program of every draw. The shading is the software renderer's
// (render3d.host.cpp Engine::shade, per vertex on the CPU, into a colour stream of the draw): psp2spvc compiles no branch, no division and
// no texture sampling, and runs out of registers on the lighting (README.md). Its outputs are COLOR0 (the first vec4) and TEXCOORD0 (the
// first vec2): the inputs of SDL's texture fragment program (third_party/SDL3/src/render/vitagxm/shader_src/texture_f.cg), texture x colour.

layout(std140, binding = 0) uniform Wvp { mat4 self; } wvp;   // clip = Wvp * position, column major

layout(location = 0) in vec3 aPosition;   // model space
layout(location = 1) in vec2 aTexcoord;
layout(location = 2) in vec4 aColor;      // the shaded colour, a: the draw's opacity

layout(location = 0) out vec4 vColor;
layout(location = 1) out vec2 vTexcoord;

void main() {
    gl_Position = wvp.self * vec4(aPosition, 1.0);
    vColor = aColor;
    vTexcoord = aTexcoord;
}
