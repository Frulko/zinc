#pragma once
// WebGL for the QuickJS engine (ZN-203.03): call once before running a program; every trusted JS context then has document.createElement('canvas').getContext('webgl').
namespace zn::gl {
void installWebGLBindings();
}
