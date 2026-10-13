// display-gl backend for HP webOS 3 (HP TouchPad): a full-screen card with an OpenGL ES 2 context from Palm's SDL 1.2, which is loaded
// from the device when the program starts (the few functions and structures used are declared here: the ABI of SDL 1.2 is frozen).
// The GL calls go to the device's own libGLESv2.so (Adreno 220). Touches come as SDL mouse events, `which` being the finger.
#include "hal.h"
#include "zgl.h"
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>

namespace {
struct SdlSurface { uint32_t flags; void* format; int w, h; };                // the start of SDL_Surface
struct SdlVideoInfo { uint32_t bits, video_mem; void* vfmt; int w, h; };      // SDL_VideoInfo: current_w, current_h
union SdlEvent {
  uint8_t type;
  struct { uint8_t type, which, state; uint16_t x, y; int16_t xrel, yrel; } motion;
  struct { uint8_t type, which, button, state; uint16_t x, y; } button;
  uint8_t room[64];
};
enum : uint32_t { SDL_INIT_VIDEO = 0x20, SDL_OPENGL = 0x2 };
enum : uint8_t { SDL_MOUSEMOTION = 4, SDL_MOUSEBUTTONDOWN = 5, SDL_MOUSEBUTTONUP = 6, SDL_QUIT = 12 };
// SDL_GLattr; the last one is Palm's addition to SDL 1.2 (after SDL_GL_SWAP_CONTROL): 2 asks for OpenGL ES 2
enum { SDL_GL_RED_SIZE = 0, SDL_GL_GREEN_SIZE, SDL_GL_BLUE_SIZE, SDL_GL_ALPHA_SIZE, SDL_GL_BUFFER_SIZE, SDL_GL_DOUBLEBUFFER, SDL_GL_DEPTH_SIZE, SDL_GL_STENCIL_SIZE,
       SDL_GL_SWAP_CONTROL = 16, SDL_GL_CONTEXT_MAJOR_VERSION = 17 };

int (*SDL_Init)(uint32_t);
void (*SDL_Quit)();
const char* (*SDL_GetError)();
const SdlVideoInfo* (*SDL_GetVideoInfo)();
SdlSurface* (*SDL_SetVideoMode)(int, int, int, uint32_t);
int (*SDL_GL_SetAttribute)(int, int);
void (*SDL_GL_SwapBuffers)();
int (*SDL_PollEvent)(SdlEvent*);

SdlSurface* screen = nullptr;
int sw = 0, sh = 0;   // the screen
bool quit = false;
// A finger, from one frame to the next: the program must see every press and every release, also when a finger leaves and comes back
// between two frames (fast typing, a flick followed by a tap). DOWN: on the screen. LEAVING: it left since the last frame and is shown
// once more, where it was. LEFT: shown absent for one frame; the next press waits for the frame after.
enum Phase : uint8_t { IDLE, DOWN, LEAVING, LEFT };
struct Finger { Phase phase; int32_t id; float x, y; };
Finger fingers[HAL_MAX_TOUCH] = {};
int32_t contacts = 0;   // each press is another touch for the program
SdlEvent queue[256];    // the events not given to the program yet, oldest at `head`: SDL's own queue is short, and a slow frame must not lose a release
int head = 0, queued = 0;
float px = 0, py = 0;   // the pointer stays where the last finger was: a release is read at that place

// An event for this frame. TAKEN: go on with the next one. LAST: taken, and the frame's input ends here (a press: the program sees the
// finger where it landed before it sees it move, so a flick shorter than a slow frame is still a flick). WAIT: it is for the next frame.
enum Took { TAKEN, LAST, WAIT };
Took take(const SdlEvent& e, float kx, float ky) {
  if (e.type == SDL_QUIT) { quit = true; return TAKEN; }
  if (e.type != SDL_MOUSEMOTION && e.type != SDL_MOUSEBUTTONDOWN && e.type != SDL_MOUSEBUTTONUP) return TAKEN;
  if (e.button.which >= HAL_MAX_TOUCH) return TAKEN;   // `which` is at the same place in the motion event
  Finger& g = fingers[e.button.which];
  if (e.type == SDL_MOUSEMOTION) { if (g.phase == DOWN) { g.x = e.motion.x * kx; g.y = e.motion.y * ky; } return TAKEN; }   // a move before a press belongs to that press, which has the place
  if (e.type == SDL_MOUSEBUTTONUP) { if (g.phase == DOWN) g.phase = LEAVING; return TAKEN; }
  if (g.phase != IDLE) return WAIT;
  g = Finger{DOWN, contacts++, e.button.x * kx, e.button.y * ky};
  if (getenv("ZINC_GL_INFO")) fprintf(stderr, "gl-info: touch %d down at %.0f,%.0f (finger %d)\n", g.id, g.x, g.y, e.button.which);
  return LAST;
}

bool open_sdl() {   // once: the screen's size is asked for before the init
  static int state = 0;
  if (state) return state > 0;
  state = -1;
  void* so = dlopen("libSDL-1.2.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!so) { fprintf(stderr, "display-gl: no libSDL-1.2.so.0: not webOS\n"); return false; }
#define SYM(f) if (!(f = (decltype(f))dlsym(so, #f))) { fprintf(stderr, "display-gl: libSDL has no %s\n", #f); return false; }
  SYM(SDL_Init) SYM(SDL_Quit) SYM(SDL_GetError) SYM(SDL_GetVideoInfo) SYM(SDL_SetVideoMode) SYM(SDL_GL_SetAttribute) SYM(SDL_GL_SwapBuffers) SYM(SDL_PollEvent)
#undef SYM
  if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "display-gl: SDL_Init: %s\n", SDL_GetError()); return false; }
  if (const SdlVideoInfo* v = SDL_GetVideoInfo()) { sw = v->w; sh = v->h; }
  state = 1;
  return true;
}
}  // namespace

bool zgl_backend_init(const HalConfig*) {
  if (!open_sdl()) return false;
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);    // the GL renderer's occlusion of what opaque rectangles hide (as src/sdl.cpp)
  SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);   // measured: without them a frame takes as long on the Adreno 220
  setenv("ZINC_RENDERER", "gl", 0);              // the GPU draws the UI: the faster renderer on this device (hp-touchpad-webos.md, section 12)
  setenv("ZINC_GL_LEAN", "1", 0);                // the GL renderer's lean programs: an image over the screen in 2 ms, 32 ms with the general one
  setenv("ZINC_GL_CORNERS", "0", 0);             // square clips: a rounded one copies the framebuffer in mid-frame, a whole pass on this GPU (12 to 24 frames a second in hero's transitions)
  SDL_GL_SetAttribute(SDL_GL_SWAP_CONTROL, getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);
  screen = SDL_SetVideoMode(0, 0, 0, SDL_OPENGL);   // 0 x 0: the screen's own mode
  if (!screen) { fprintf(stderr, "display-gl: no GL screen: %s\n", SDL_GetError()); return false; }
  sw = screen->w; sh = screen->h;
  if (getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0)   // measurements: Palm's SDL ignores SDL_GL_SWAP_CONTROL, EGL has the interval
    if (void* egl = dlopen("libEGL.so", RTLD_NOW)) {
      void* (*display)() = (void* (*)())dlsym(egl, "eglGetCurrentDisplay");
      unsigned (*interval)(void*, int) = (unsigned (*)(void*, int))dlsym(egl, "eglSwapInterval");
      if (display && interval) fprintf(stderr, "display-gl: swap interval 0: %s\n", interval(display(), 0) ? "set" : "refused");
    }
  GLint r = 0, g = 0, bl = 0, al = 0, dz = 0, st = 0;
  glGetIntegerv(GL_RED_BITS, &r); glGetIntegerv(GL_GREEN_BITS, &g); glGetIntegerv(GL_BLUE_BITS, &bl); glGetIntegerv(GL_ALPHA_BITS, &al); glGetIntegerv(GL_DEPTH_BITS, &dz); glGetIntegerv(GL_STENCIL_BITS, &st);
  fprintf(stderr, "display-gl: webOS %dx%d, %s, %s, colour %d%d%d%d depth %d stencil %d\n", sw, sh, glGetString(GL_RENDERER), glGetString(GL_VERSION), r, g, bl, al, dz, st);
  if (getenv("ZINC_GL_INFO")) fprintf(stderr, "gl-info: extensions %s\n", glGetString(GL_EXTENSIONS));
  return true;
}

int32_t zgl_backend_scale() { return 1; }   // the panel's own pixels
void zgl_backend_size(int32_t* w, int32_t* h) { *w = sw; *h = sh; }
void zgl_backend_native(int32_t* w, int32_t* h) { if (open_sdl() && sw > 0 && sh > 0) { *w = sw; *h = sh; } }
// LunaSysMgr composes the card with the alpha of its pixels: where a frame left less than 1 the system's wallpaper shows through. The frame
// is made opaque before it is shown (nothing in the renderer reads the alpha it wrote).
void zgl_backend_swap() {
  glDisable(GL_SCISSOR_TEST);
  glColorMask(GL_FALSE, GL_FALSE, GL_FALSE, GL_TRUE);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  SDL_GL_SwapBuffers();
}

void zgl_backend_poll(HalInput* in, int32_t W, int32_t H) {
  const float kx = sw > 0 ? (float)W / sw : 1, ky = sh > 0 ? (float)H / sh : 1;   // screen pixels to the logical surface
  static const bool info = getenv("ZINC_GL_INFO") != nullptr;   // every press and release as the program gets them, and the events that are not touches
  const int cap = (int)(sizeof queue / sizeof *queue);
  SdlEvent e;
  while (queued < cap && SDL_PollEvent(&e)) {
    if (info && (e.type < SDL_MOUSEMOTION || e.type > SDL_MOUSEBUTTONUP)) fprintf(stderr, "gl-info: event %d (%d %d %d)\n", e.type, e.room[1], e.room[2], e.room[3]);
    queue[(head + queued++) % cap] = e;
  }
  while (queued) {
    const Took t = take(queue[head], kx, ky);
    if (t == WAIT) break;
    head = (head + 1) % cap; queued--;
    if (t == LAST) break;
  }
  static const bool scripted = getenv("ZINC_INPUT") != nullptr;   // a scripted run (measurements): the script's pointer stays while no finger is on the screen
  bool any = false;
  for (const Finger& g : fingers) any = any || g.phase != IDLE;
  if (scripted && !any) { if (quit) in->quit = 1; return; }
  in->ntouch = 0;
  for (Finger& g : fingers) {
    if (g.phase == LEFT) g.phase = IDLE;
    if (g.phase != DOWN && g.phase != LEAVING) continue;
    if (!in->ntouch) { px = g.x; py = g.y; }
    in->touch[in->ntouch++] = HalTouch{g.id, g.x, g.y};
    if (info && g.phase == LEAVING) fprintf(stderr, "gl-info: touch %d up at %.0f,%.0f (finger %d)\n", g.id, g.x, g.y, (int)(&g - fingers));
    if (g.phase == LEAVING) g.phase = LEFT;
  }
  in->buttons = 0; in->px = px; in->py = py; in->pdown = in->ntouch > 0; in->quit = quit;
}

void zgl_backend_shutdown() { if (screen) SDL_Quit(); screen = nullptr; }
