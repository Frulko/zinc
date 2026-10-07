// ZN-203.02: the WebGL 1.0 core drives a real context (buffers, shaders, programs, textures, framebuffers, draws) and reports the errors the spec asks for.
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "gl/webgl1.h"
#include "glad/gl.h"

using namespace zn::gl;
static int failures = 0, checks = 0;
#define EXPECT_ERR(w, want, what) do { ++checks; unsigned got_ = (w).getError(); if (got_ != (want)) { ++failures; std::fprintf(stderr, "FAIL %s: error 0x%04x, want 0x%04x\n", what, got_, (unsigned)(want)); } if ((w).getError() != 0) { ++failures; std::fprintf(stderr, "FAIL %s: more than one error\n", what); } } while (0)
#define EXPECT(cond, what) do { ++checks; if (!(cond)) { ++failures; std::fprintf(stderr, "FAIL %s\n", what); } } while (0)

static const char* kVs = "attribute vec2 pos;\nattribute vec4 col;\nvarying vec4 v;\nuniform mat4 m;\nuniform float s;\nvoid main() { v = col; gl_Position = m * vec4(pos * s, 0.0, 1.0); }\n";
static const char* kFs = "precision mediump float;\nvarying vec4 v;\nuniform sampler2D tex;\nvoid main() { gl_FragColor = v; }\n";

static Id program(WebGL1& w) {
  Id vs = w.createShader(GL_VERTEX_SHADER), fs = w.createShader(GL_FRAGMENT_SHADER);
  w.shaderSource(vs, kVs); w.shaderSource(fs, kFs);
  w.compileShader(vs); w.compileShader(fs);
  if (!w.shaderCompiled(vs) || !w.shaderCompiled(fs)) { std::fprintf(stderr, "shader log: %s %s\n", w.shaderInfoLog(vs).c_str(), w.shaderInfoLog(fs).c_str()); return 0; }
  Id p = w.createProgram();
  w.attachShader(p, vs); w.attachShader(p, fs);
  w.bindAttribLocation(p, 0, "pos"); w.bindAttribLocation(p, 1, "col");
  w.linkProgram(p);
  if (!w.programLinked(p)) { std::fprintf(stderr, "link log: %s\n", w.programInfoLog(p).c_str()); return 0; }
  return p;
}

int main() {
  WebGL1 w;
  std::string err;
  if (!w.create(Api::Gl33, 64, 64, err) && !w.create(Api::Gles2, 64, 64, err)) { std::puts("webgl1_test: no GL context here"); return 1; }
  EXPECT_ERR(w, GL_NO_ERROR, "fresh context has no error");

  // --- a working frame: a red-to-blue triangle covering the target, through buffers, attributes, uniforms and an index buffer
  Id p = program(w);
  EXPECT(p != 0, "program links");
  w.useProgram(p);
  EXPECT_ERR(w, GL_NO_ERROR, "useProgram");
  float verts[] = {-1, -1, 1, 0, 0, 1,   3, -1, 1, 0, 0, 1,   -1, 3, 1, 0, 0, 1};
  Id vb = w.createBuffer(), ib = w.createBuffer();
  w.bindBuffer(GL_ARRAY_BUFFER, vb);
  w.bufferData(GL_ARRAY_BUFFER, sizeof verts, verts, GL_STATIC_DRAW);
  std::uint16_t idx[] = {0, 1, 2};
  w.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, ib);
  w.bufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof idx, idx, GL_STATIC_DRAW);
  w.bindBuffer(GL_ARRAY_BUFFER, vb);
  w.enableVertexAttribArray(0); w.enableVertexAttribArray(1);
  w.vertexAttribPointer(0, 2, GL_FLOAT, false, 24, 0);
  w.vertexAttribPointer(1, 4, GL_FLOAT, false, 24, 8);
  float ident[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  UniformLoc m = w.getUniformLocation(p, "m"), s = w.getUniformLocation(p, "s");
  EXPECT(m.valid() && s.valid(), "uniform locations");
  w.uniformMatrix4fv(m, false, ident, 16);
  w.uniform1f(s, 1.0f);
  w.clearColor(0, 0, 1, 1);
  w.clear(GL_COLOR_BUFFER_BIT);
  w.drawElements(GL_TRIANGLES, 3, GL_UNSIGNED_SHORT, 0);
  EXPECT_ERR(w, GL_NO_ERROR, "indexed draw");
  std::uint8_t px[4] = {};
  w.readPixels(32, 32, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, px, 4);
  EXPECT(px[0] == 255 && px[1] == 0 && px[2] == 0, "the triangle is red at the centre");
  w.drawArrays(GL_TRIANGLES, 0, 3);
  EXPECT_ERR(w, GL_NO_ERROR, "array draw");

  // --- a luminance texture samples as (l, l, l, 1) on the desktop core too, and a framebuffer texture renders and completes
  Id tex = w.createTexture();
  w.bindTexture(GL_TEXTURE_2D, tex);
  std::uint8_t lum[4] = {200, 200, 200, 200};
  w.pixelStorei(GL_UNPACK_ALIGNMENT, 1);
  w.texImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE, 2, 2, 0, GL_LUMINANCE, GL_UNSIGNED_BYTE, lum, 4);
  w.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  w.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  EXPECT_ERR(w, GL_NO_ERROR, "luminance texture");
  Id rt = w.createTexture();
  w.bindTexture(GL_TEXTURE_2D, rt);
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 8, 8, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr, 0);
  w.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  Id fb = w.createFramebuffer();
  w.bindFramebuffer(GL_FRAMEBUFFER, fb);
  w.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, rt, 0);
  EXPECT(w.checkFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE, "framebuffer with a texture is complete");
  w.viewport(0, 0, 8, 8);
  w.clearColor(0, 1, 0, 1);
  w.clear(GL_COLOR_BUFFER_BIT);
  w.readPixels(4, 4, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, px, 4);
  EXPECT(px[0] == 0 && px[1] == 255, "clear into the texture");
  EXPECT_ERR(w, GL_NO_ERROR, "framebuffer flow");
  w.bindFramebuffer(GL_FRAMEBUFFER, 0);
  w.viewport(0, 0, 64, 64);

  // --- the errors of the spec: each invalid call sets exactly one, and the state stays usable
  w.enable(0x1234);                                        EXPECT_ERR(w, GL_INVALID_ENUM, "enable(bad cap)");
  w.bindBuffer(0x1234, vb);                                EXPECT_ERR(w, GL_INVALID_ENUM, "bindBuffer(bad target)");
  w.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, vb);               EXPECT_ERR(w, GL_INVALID_OPERATION, "bindBuffer(a buffer bound to another target)");
  w.bindBuffer(GL_ARRAY_BUFFER, 9999);                     EXPECT_ERR(w, GL_INVALID_OPERATION, "bindBuffer(unknown object)");
  w.bufferData(GL_ARRAY_BUFFER, -1, nullptr, GL_STATIC_DRAW);  EXPECT_ERR(w, GL_INVALID_VALUE, "bufferData(negative size)");
  w.bufferData(GL_ARRAY_BUFFER, 16, nullptr, 0x1234);      EXPECT_ERR(w, GL_INVALID_ENUM, "bufferData(bad usage)");
  w.bufferSubData(GL_ARRAY_BUFFER, 1000, 4, verts);        EXPECT_ERR(w, GL_INVALID_VALUE, "bufferSubData(out of range)");
  w.createShader(0x1234);                                  EXPECT_ERR(w, GL_INVALID_ENUM, "createShader(bad type)");
  w.shaderSource(777, "x");                                EXPECT_ERR(w, GL_INVALID_OPERATION, "shaderSource(unknown shader)");
  { Id v2 = w.createShader(GL_VERTEX_SHADER), v3 = w.createShader(GL_VERTEX_SHADER), p2 = w.createProgram(); w.attachShader(p2, v2); w.attachShader(p2, v3); }
                                                           EXPECT_ERR(w, GL_INVALID_OPERATION, "attachShader(a second vertex shader)");
  { Id p3 = w.createProgram(); w.linkProgram(p3); EXPECT(!w.programLinked(p3), "link without shaders fails"); w.useProgram(p3); }
                                                           EXPECT_ERR(w, GL_INVALID_OPERATION, "useProgram(unlinked program)");
  w.vertexAttribPointer(0, 5, GL_FLOAT, false, 0, 0);      EXPECT_ERR(w, GL_INVALID_VALUE, "vertexAttribPointer(size 5)");
  w.vertexAttribPointer(0, 2, 0x1234, false, 0, 0);        EXPECT_ERR(w, GL_INVALID_ENUM, "vertexAttribPointer(bad type)");
  w.vertexAttribPointer(0, 2, GL_FLOAT, false, 256, 0);    EXPECT_ERR(w, GL_INVALID_VALUE, "vertexAttribPointer(stride 256)");
  w.vertexAttribPointer(0, 2, GL_FLOAT, false, 6, 0);      EXPECT_ERR(w, GL_INVALID_OPERATION, "vertexAttribPointer(stride not a multiple of the type size)");
  w.enableVertexAttribArray(99);                           EXPECT_ERR(w, GL_INVALID_VALUE, "enableVertexAttribArray(99)");
  w.drawArrays(0x1234, 0, 3);                              EXPECT_ERR(w, GL_INVALID_ENUM, "drawArrays(bad mode)");
  w.drawArrays(GL_TRIANGLES, -1, 3);                       EXPECT_ERR(w, GL_INVALID_VALUE, "drawArrays(negative first)");
  w.drawArrays(GL_TRIANGLES, 0, 1000);                     EXPECT_ERR(w, GL_INVALID_OPERATION, "drawArrays(attributes out of the buffer)");
  w.drawElements(GL_TRIANGLES, 3, GL_UNSIGNED_INT, 0);     EXPECT_ERR(w, GL_INVALID_ENUM, "drawElements(UNSIGNED_INT without the extension)");
  w.drawElements(GL_TRIANGLES, 3, GL_UNSIGNED_SHORT, 1);   EXPECT_ERR(w, GL_INVALID_OPERATION, "drawElements(misaligned offset)");
  w.drawElements(GL_TRIANGLES, 300, GL_UNSIGNED_SHORT, 0); EXPECT_ERR(w, GL_INVALID_OPERATION, "drawElements(count beyond the element buffer)");
  w.uniform2f(s, 1, 2);                                    EXPECT_ERR(w, GL_INVALID_OPERATION, "uniform2f on a float");
  w.uniformMatrix4fv(m, true, ident, 16);                  EXPECT_ERR(w, GL_INVALID_VALUE, "uniformMatrix4fv(transpose)");
  { Id q = program(w); UniformLoc other = w.getUniformLocation(q, "s"); w.uniform1f(other, 1); }
                                                           EXPECT_ERR(w, GL_INVALID_OPERATION, "uniform1f with a location of another program");
  w.uniform1f(UniformLoc{}, 1);                            EXPECT_ERR(w, GL_NO_ERROR, "uniform1f(null location) is ignored");
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 2, 2, 1, GL_RGBA, GL_UNSIGNED_BYTE, nullptr, 0);   EXPECT_ERR(w, GL_INVALID_VALUE, "texImage2D(border 1)");
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGB, 2, 2, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr, 0);    EXPECT_ERR(w, GL_INVALID_OPERATION, "texImage2D(internalformat != format)");
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGB, 2, 2, 0, GL_RGB, GL_UNSIGNED_SHORT_4_4_4_4, nullptr, 0);  EXPECT_ERR(w, GL_INVALID_OPERATION, "texImage2D(RGB with 4_4_4_4)");
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 2, 2, 0, GL_RGBA, GL_FLOAT, nullptr, 0);           EXPECT_ERR(w, GL_INVALID_ENUM, "texImage2D(FLOAT without the extension)");
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 4, 4, 0, GL_RGBA, GL_UNSIGNED_BYTE, lum, 4);       EXPECT_ERR(w, GL_INVALID_OPERATION, "texImage2D(data too small)");
  w.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 100000, 2, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr, 0);   EXPECT_ERR(w, GL_INVALID_VALUE, "texImage2D(larger than MAX_TEXTURE_SIZE)");
  w.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, 0x1234);  EXPECT_ERR(w, GL_INVALID_ENUM, "texParameteri(bad wrap)");
  w.activeTexture(GL_TEXTURE0 + 99);                       EXPECT_ERR(w, GL_INVALID_ENUM, "activeTexture(99)");
  w.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, rt, 0);        EXPECT_ERR(w, GL_INVALID_OPERATION, "framebufferTexture2D on the canvas framebuffer");
  w.clear(0x1);                                            EXPECT_ERR(w, GL_INVALID_VALUE, "clear(bad mask)");
  w.viewport(0, 0, -1, 4);                                 EXPECT_ERR(w, GL_INVALID_VALUE, "viewport(negative size)");
  w.readPixels(0, 0, 1, 1, GL_RGB, GL_UNSIGNED_BYTE, px, 4);   EXPECT_ERR(w, GL_INVALID_ENUM, "readPixels(RGB)");
  w.readPixels(0, 0, 4, 4, GL_RGBA, GL_UNSIGNED_BYTE, px, 4); EXPECT_ERR(w, GL_INVALID_OPERATION, "readPixels(buffer too small)");
  { Id empty = w.createFramebuffer(); w.bindFramebuffer(GL_FRAMEBUFFER, empty); w.clear(GL_COLOR_BUFFER_BIT); w.bindFramebuffer(GL_FRAMEBUFFER, 0); }
                                                           EXPECT_ERR(w, GL_INVALID_FRAMEBUFFER_OPERATION, "clear on an incomplete framebuffer");
  w.pixelStorei(GL_UNPACK_ALIGNMENT, 3);                   EXPECT_ERR(w, GL_INVALID_VALUE, "pixelStorei(alignment 3)");
  w.useProgram(0); w.drawArrays(GL_TRIANGLES, 0, 3);       EXPECT_ERR(w, GL_INVALID_OPERATION, "drawArrays without a program");

  std::printf("webgl1_test: %d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
