// display-gl on an X server: a window with the newest OpenGL ES through EGL. libX11 is opened at run time, so a machine without it still runs on the screen (linux.cpp);
// a program exported for Linux carries no SDL, so this is the window it has. F11 toggles fullscreen, Esc quits. ZINC_GL_FULLSCREEN=1 starts fullscreen.
#include "hal.h"
#include "zgl.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if __has_include(<X11/Xlib.h>)
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/keysym.h>
#include <dlfcn.h>
#undef DefaultScreen   // macros of Xlib.h: the functions of the same names are what is looked up
#undef RootWindow
#undef DefaultVisual

static struct {
  Display* (*OpenDisplay)(const char*);
  int (*CloseDisplay)(Display*);
  int (*DefaultScreen)(Display*);
  Window (*RootWindow)(Display*, int);
  Visual* (*DefaultVisual)(Display*, int);
  VisualID (*VisualIDFromVisual)(Visual*);
  Window (*CreateSimpleWindow)(Display*, Window, int, int, unsigned, unsigned, unsigned, unsigned long, unsigned long);
  int (*DestroyWindow)(Display*, Window);
  int (*StoreName)(Display*, Window, const char*);
  int (*SelectInput)(Display*, Window, long);
  int (*MapWindow)(Display*, Window);
  Atom (*InternAtom)(Display*, const char*, Bool);
  Status (*SetWMProtocols)(Display*, Window, Atom*, int);
  int (*SetWMHints)(Display*, Window, XWMHints*);
  int (*ChangeProperty)(Display*, Window, Atom, Atom, int, int, const unsigned char*, int);
  Status (*SendEvent)(Display*, Window, Bool, long, XEvent*);
  int (*Pending)(Display*);
  int (*NextEvent)(Display*, XEvent*);
  KeySym (*LookupKeysym)(XKeyEvent*, int);
} x;
static bool load_x11() {
  void* h = dlopen("libX11.so.6", RTLD_LAZY | RTLD_LOCAL);
  if (!h) return false;
  bool ok = true;
  auto get = [&](auto& f, const char* n) { *(void**)&f = dlsym(h, n); ok = ok && f; };
  get(x.OpenDisplay, "XOpenDisplay"); get(x.CloseDisplay, "XCloseDisplay"); get(x.DefaultScreen, "XDefaultScreen"); get(x.RootWindow, "XRootWindow");
  get(x.DefaultVisual, "XDefaultVisual"); get(x.VisualIDFromVisual, "XVisualIDFromVisual"); get(x.CreateSimpleWindow, "XCreateSimpleWindow"); get(x.DestroyWindow, "XDestroyWindow");
  get(x.StoreName, "XStoreName"); get(x.SelectInput, "XSelectInput"); get(x.MapWindow, "XMapWindow"); get(x.InternAtom, "XInternAtom"); get(x.SetWMProtocols, "XSetWMProtocols");
  get(x.SetWMHints, "XSetWMHints"); get(x.ChangeProperty, "XChangeProperty"); get(x.SendEvent, "XSendEvent"); get(x.Pending, "XPending"); get(x.NextEvent, "XNextEvent"); get(x.LookupKeysym, "XLookupKeysym");
  return ok;
}

static Display* xd;
static Window win;
static Atom wm_delete, net_state, net_full;
static EGLDisplay dpy = EGL_NO_DISPLAY;
static EGLSurface surf = EGL_NO_SURFACE;
static EGLContext ctx = EGL_NO_CONTEXT;
static int32_t ww, wh;
static float px, py;
static bool pdown, quit, full, exposed;
static uint32_t keys;
static int wheel;

static uint32_t key_bit(KeySym k) {
  switch (k) {
    case XK_Up: case XK_w: return HAL_UP;
    case XK_Down: case XK_s: return HAL_DOWN;
    case XK_Left: case XK_a: return HAL_LEFT;
    case XK_Right: case XK_d: return HAL_RIGHT;
    case XK_space: case XK_z: return HAL_A;
    case XK_x: return HAL_B;
    case XK_c: return HAL_X;
    case XK_v: return HAL_Y;
    case XK_q: return HAL_L;
    case XK_e: return HAL_R;
    case XK_Return: return HAL_START;
    case XK_Tab: return HAL_SELECT;
  }
  return 0;
}

extern "C" const char* zgl_window_egl() { return dpy != EGL_NO_DISPLAY ? eglQueryString(dpy, EGL_EXTENSIONS) : nullptr; }

bool zgl_window_init(const HalConfig* cfg) {
  if (!load_x11() || !(xd = x.OpenDisplay(nullptr))) return false;
  const int screen = x.DefaultScreen(xd);
  auto platform = (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
  dpy = platform ? platform(EGL_PLATFORM_X11_KHR, xd, nullptr) : eglGetDisplay((EGLNativeDisplayType)xd);
  if (dpy == EGL_NO_DISPLAY || !eglInitialize(dpy, nullptr, nullptr)) { fprintf(stderr, "display-gl: eglInitialize failed\n"); return false; }
  eglBindAPI(EGL_OPENGL_ES_API);
  const EGLint visual = (EGLint)x.VisualIDFromVisual(x.DefaultVisual(xd, screen));
  EGLConfig cfgs[64], chosen = nullptr;
  for (int k = 0; k < 4 && !chosen; k++) {   // as on the screen (kms.cpp): depth for the occlusion, stencil for the fills
    const EGLint attr[] = {EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_DEPTH_SIZE, k & 1 ? 0 : 16, EGL_STENCIL_SIZE, k & 2 ? 0 : 8, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_NONE};
    EGLint n = 0;
    eglChooseConfig(dpy, attr, cfgs, 64, &n);
    for (int i = 0; i < n && !chosen; i++) { EGLint id = 0; if (eglGetConfigAttrib(dpy, cfgs[i], EGL_NATIVE_VISUAL_ID, &id) && id == visual) chosen = cfgs[i]; }
  }
  if (!chosen) { fprintf(stderr, "display-gl: no EGL config for the screen's visual\n"); return false; }
  ww = cfg->width; wh = cfg->height;
  win = x.CreateSimpleWindow(xd, x.RootWindow(xd, screen), 0, 0, (unsigned)ww, (unsigned)wh, 0, 0, 0);
  x.StoreName(xd, win, cfg->title ? cfg->title : "Zinc");
  x.SelectInput(xd, win, StructureNotifyMask | ExposureMask | KeyPressMask | KeyReleaseMask | ButtonPressMask | ButtonReleaseMask | PointerMotionMask);
  wm_delete = x.InternAtom(xd, "WM_DELETE_WINDOW", False);
  x.SetWMProtocols(xd, win, &wm_delete, 1);
  net_state = x.InternAtom(xd, "_NET_WM_STATE", False); net_full = x.InternAtom(xd, "_NET_WM_STATE_FULLSCREEN", False);
  if (getenv("ZINC_BACKGROUND") && getenv("ZINC_BACKGROUND")[0] != '0') {   // never take the focus from what the person is doing
    XWMHints hints{}; hints.flags = InputHint; hints.input = False;
    x.SetWMHints(xd, win, &hints);
  }
  full = getenv("ZINC_GL_FULLSCREEN") && atoi(getenv("ZINC_GL_FULLSCREEN")) != 0;
  if (full) x.ChangeProperty(xd, win, net_state, 4 /* XA_ATOM */, 32, PropModeReplace, (const unsigned char*)&net_full, 1);
  x.MapWindow(xd, win);
  hal_x11_window = win;
  // the newest GLES the driver gives (the replay reads the version of the context it got)
  const int versions[][2] = {{3, 2}, {3, 1}, {3, 0}, {2, 0}};
  for (const auto& v : versions) {
    const EGLint cattr[] = {EGL_CONTEXT_MAJOR_VERSION, v[0], EGL_CONTEXT_MINOR_VERSION, v[1], EGL_NONE};
    ctx = eglCreateContext(dpy, chosen, EGL_NO_CONTEXT, cattr);
    if (ctx != EGL_NO_CONTEXT) break;
  }
  surf = eglCreateWindowSurface(dpy, chosen, (EGLNativeWindowType)win, nullptr);
  if (ctx == EGL_NO_CONTEXT || surf == EGL_NO_SURFACE || !eglMakeCurrent(dpy, surf, surf, ctx)) { fprintf(stderr, "display-gl: EGL context failed\n"); return false; }
  eglSwapInterval(dpy, getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);
  // a window manager places and sizes the window when it maps it: its real size before the first frame
  for (bool mapped = false; !mapped;) {
    XEvent e;
    x.NextEvent(xd, &e);
    if (e.type == ConfigureNotify) { ww = e.xconfigure.width; wh = e.xconfigure.height; }
    if (e.type == MapNotify) mapped = true;
  }
  fprintf(stderr, "display-gl: X11 window %dx%d, %s, %s\n", ww, wh, glGetString(GL_VERSION), glGetString(GL_RENDERER));
  return true;
}

void zgl_window_size(int32_t* w, int32_t* h) { *w = ww; *h = wh; }
bool zgl_window_exposed() { const bool e = exposed; exposed = false; return e; }
void zgl_window_current() { if (eglGetCurrentContext() != ctx) eglMakeCurrent(dpy, surf, surf, ctx); }
void zgl_window_swap() { eglSwapBuffers(dpy, surf); }

void zgl_window_poll(HalInput* in, int32_t W, int32_t H) {
  while (x.Pending(xd)) {
    XEvent e;
    x.NextEvent(xd, &e);
    switch (e.type) {
      case ClientMessage: if ((Atom)e.xclient.data.l[0] == wm_delete) quit = true; break;
      case ConfigureNotify: ww = e.xconfigure.width; wh = e.xconfigure.height; break;
      case Expose: exposed = true; break;   // a window moved away, a web view hidden: the kept frame is shown again
      case KeyPress: case KeyRelease: {
        const KeySym k = x.LookupKeysym(&e.xkey, 0);
        const bool down = e.type == KeyPress;
        if (k == XK_F11 && down) {
          full = !full;
          XEvent m{}; m.xclient.type = ClientMessage; m.xclient.window = win; m.xclient.message_type = net_state; m.xclient.format = 32;
          m.xclient.data.l[0] = full; m.xclient.data.l[1] = (long)net_full;
          x.SendEvent(xd, x.RootWindow(xd, x.DefaultScreen(xd)), False, SubstructureRedirectMask | SubstructureNotifyMask, &m);
        }
        if (const uint32_t b = key_bit(k)) keys = down ? keys | b : keys & ~b;
        break;
      }
      case ButtonPress: case ButtonRelease:
        if (e.xbutton.button == Button1) pdown = e.type == ButtonPress;
        if (e.type == ButtonPress && e.xbutton.button == Button4) wheel++;
        if (e.type == ButtonPress && e.xbutton.button == Button5) wheel--;
        px = (float)e.xbutton.x; py = (float)e.xbutton.y;
        break;
      case MotionNotify: px = (float)e.xmotion.x; py = (float)e.xmotion.y; break;
    }
  }
  in->buttons = keys;
  in->px = ww > 0 ? px * W / ww : 0; in->py = wh > 0 ? py * H / wh : 0;
  in->pdown = pdown; in->wheel += wheel; wheel = 0;
  in->ntouch = 0;
  in->quit = quit;
}

void zgl_window_shutdown() {
  hal_x11_window = 0;
  eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  eglDestroySurface(dpy, surf);
  eglDestroyContext(dpy, ctx);
  eglTerminate(dpy);
  x.DestroyWindow(xd, win);
  x.CloseDisplay(xd);
}
#else
// built without the X11 headers: the screen only
bool zgl_window_init(const HalConfig*) { return false; }
void zgl_window_size(int32_t*, int32_t*) {}
bool zgl_window_exposed() { return false; }
void zgl_window_current() {}
void zgl_window_swap() {}
void zgl_window_poll(HalInput*, int32_t, int32_t) {}
void zgl_window_shutdown() {}
extern "C" const char* zgl_window_egl() { return nullptr; }
#endif
