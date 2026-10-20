#pragma once
// WebGL for the QuickJS engine (ZN-203.03): call once before running a program; every trusted JS context then has document.createElement('canvas').getContext('webgl').
// It is built as a module beside zinc (libzn_webgl, ZN-330.01) that zinc loads with dlopen on the first QuickJS context: zinc itself carries no WebGL, glad or glslang.
// SDL3, QuickJS and zn_qjs come from the zinc that loads it.
struct JSContext;
namespace zn::gl {
// gl.zincPresent(image) writes the drawing buffer into a host image (ZN-205): `size` gives the image's size, `pixels` its 0x00RRGGBB rows top to
// bottom after resizing it to w x h, `done` says they changed. The module reads the pixels straight into them, scaled down on the GPU (ZN-411).
// `atFrameEnd` registers a function the host runs at the end of every frame, before painting: a canvas read started in an earlier frame is
// finished there when no later present took it.
struct PresentHooks {
  bool (*size)(int image, int* w, int* h);
  unsigned* (*pixels)(int image, int w, int h);
  void (*done)(int image);
  void (*atFrameEnd)(void (*fn)());
};
using ContextInstall = void (*)(JSContext*);
}
// The module's one entry: sets the present hook and returns what installs document.createElement('canvas').getContext('webgl') in a context.
extern "C" zn::gl::ContextInstall zn_webgl_open(const zn::gl::PresentHooks* present);
