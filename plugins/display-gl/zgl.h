// display-gl: the GL context shared with GPU plugins (zinc:mapping). See docs/plugins/display-gl.md.
// Shaders are written in the GLSL ES 1.00 dialect (attribute/varying/texture2D/gl_FragColor); zgl_program adds the
// preamble that makes them compile as GLSL 1.50 core on desktop GL.
#pragma once
#ifdef __APPLE__
#include <OpenGL/gl3.h>
#else
#include <GLES2/gl2.h>
#endif
#include <stdint.h>

extern "C" {
/** Drawn every frame into the default framebuffer (w x h pixels, cleared to black), before the UI overlay. */
extern void (*zgl_layers)(int32_t w, int32_t h);
/** Links a program; attribute 0 is `a_pos`, 1 is `a_uv`. `defines` is inserted after the preamble. 0 on error (logged). */
GLuint zgl_program(const char* defines, const char* vs, const char* fs);
/** Logical UI surface size (zinc.json width/height). */
void zgl_logical_size(int32_t* w, int32_t* h);
}
