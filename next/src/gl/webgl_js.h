#pragma once
// WebGL for the QuickJS engine (ZN-203.03): call once before running a program; every trusted JS context then has document.createElement('canvas').getContext('webgl').
// It is built as a module beside zinc (libzn_webgl, ZN-330.01) that zinc loads with dlopen on the first QuickJS context: zinc itself carries no WebGL, glad or glslang.
// SDL3, QuickJS and zn_qjs come from the zinc that loads it.
struct JSContext;
namespace zn::gl {
// gl.zincPresent(image) hands the drawing buffer (RGBA, rows top to bottom, w x h) to the host: true when the image took it (ZN-205).
using PresentHook = bool (*)(int image, const unsigned char* rgba, int w, int h);
using ContextInstall = void (*)(JSContext*);
}
// The module's one entry: sets the present hook and returns what installs document.createElement('canvas').getContext('webgl') in a context.
extern "C" zn::gl::ContextInstall zn_webgl_open(zn::gl::PresentHook present);
