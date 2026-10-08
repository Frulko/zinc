#pragma once
// WebGL for the QuickJS engine (ZN-203.03): call once before running a program; every trusted JS context then has document.createElement('canvas').getContext('webgl').
namespace zn::gl {
void installWebGLBindings();
// gl.zincPresent(image) hands the drawing buffer (RGBA, rows top to bottom, w x h) to the host: true when the image took it (ZN-205).
using PresentHook = bool (*)(int image, const unsigned char* rgba, int w, int h);
void setPresentHook(PresentHook h);
}
