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
SdlEvent held;          // the press that has to wait for the next frame
bool holding = false;
float px = 0, py = 0;   // the pointer stays where the last finger was: a release is read at that place

// false: the event waits for the next frame, and those after it
bool take(const SdlEvent& e, float kx, float ky) {
  if (e.type == SDL_QUIT) { quit = true; return true; }
  if (e.type != SDL_MOUSEMOTION && e.type != SDL_MOUSEBUTTONDOWN && e.type != SDL_MOUSEBUTTONUP) return true;
  if (e.button.which >= HAL_MAX_TOUCH) return true;   // `which` is at the same place in the motion event
  Finger& g = fingers[e.button.which];
  if (e.type == SDL_MOUSEMOTION) { if (g.phase == DOWN) { g.x = e.motion.x * kx; g.y = e.motion.y * ky; } return true; }   // a move before a press belongs to that press, which has the place
  if (e.type == SDL_MOUSEBUTTONUP) { if (g.phase == DOWN) g.phase = LEAVING; return true; }
  if (g.phase != IDLE) return false;
  g = Finger{DOWN, contacts++, e.button.x * kx, e.button.y * ky};
  return true;
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
  SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);
  SDL_GL_SetAttribute(SDL_GL_SWAP_CONTROL, getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);
  screen = SDL_SetVideoMode(0, 0, 0, SDL_OPENGL);   // 0 x 0: the screen's own mode
  if (!screen) { fprintf(stderr, "display-gl: no GL screen: %s\n", SDL_GetError()); return false; }
  sw = screen->w; sh = screen->h;
  fprintf(stderr, "display-gl: webOS %dx%d, %s, %s\n", sw, sh, glGetString(GL_RENDERER), glGetString(GL_VERSION));
  return true;
}

int32_t zgl_backend_scale() { return 1; }   // the panel's own pixels
void zgl_backend_size(int32_t* w, int32_t* h) { *w = sw; *h = sh; }
void zgl_backend_native(int32_t* w, int32_t* h) { if (open_sdl() && sw > 0 && sh > 0) { *w = sw; *h = sh; } }
void zgl_backend_swap() { SDL_GL_SwapBuffers(); }

void zgl_backend_poll(HalInput* in, int32_t W, int32_t H) {
  const float kx = sw > 0 ? (float)W / sw : 1, ky = sh > 0 ? (float)H / sh : 1;   // screen pixels to the logical surface
  if (holding) holding = !take(held, kx, ky);
  SdlEvent e;
  while (!holding && SDL_PollEvent(&e)) if (!take(e, kx, ky)) { held = e; holding = true; }
  in->ntouch = 0;
  for (Finger& g : fingers) {
    if (g.phase == LEFT) g.phase = IDLE;
    if (g.phase != DOWN && g.phase != LEAVING) continue;
    if (!in->ntouch) { px = g.x; py = g.y; }
    in->touch[in->ntouch++] = HalTouch{g.id, g.x, g.y};
    if (g.phase == LEAVING) g.phase = LEFT;
  }
  in->buttons = 0; in->px = px; in->py = py; in->pdown = in->ntouch > 0; in->quit = quit;
}

void zgl_backend_shutdown() { if (screen) SDL_Quit(); screen = nullptr; }
