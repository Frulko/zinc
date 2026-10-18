// display-gl backend for HP webOS 3 (HP TouchPad): a full-screen card with an OpenGL ES 2 context from Palm's SDL 1.2, which is loaded
// from the device when the program starts (the few functions and structures used are declared here: the ABI of SDL 1.2 is frozen).
// The GL calls go to the device's own libGLESv2.so (Adreno 220). Touches come as SDL mouse events, `which` being the finger.
#include "hal.h"
#include "zgl.h"
#include <dlfcn.h>
#include <cmath>
#include <unistd.h>
#include <cstring>
#include <string>
#include <ctime>
#include <stdio.h>
#include <stdlib.h>

namespace {
struct SdlSurface { uint32_t flags; void* format; int w, h; };                // the start of SDL_Surface
struct SdlVideoInfo { uint32_t bits, video_mem; void* vfmt; int w, h; };      // SDL_VideoInfo: current_w, current_h
union SdlEvent {
  uint8_t type;
  struct { uint8_t type, gain, state; } active;
  struct { uint8_t type, p1, p2, p3; int32_t w, h; } resize;   // SDL_ResizeEvent
  struct { uint8_t type, which, state, pad; uint8_t scancode, p1, p2, p3; int32_t sym; int32_t mod; uint16_t unicode; } key;   // SDL_keysym at 4
  struct { uint8_t type, which, state; uint16_t x, y; int16_t xrel, yrel; } motion;
  struct { uint8_t type, which, button, state; uint16_t x, y; } button;
  uint8_t room[64];
};
enum : uint32_t { SDL_INIT_VIDEO = 0x20, SDL_OPENGL = 0x2, SDL_FULLSCREEN = 0x80000000 };
enum : uint8_t { SDL_ACTIVEEVENT = 1, SDL_KEYDOWN = 2, SDL_KEYUP = 3, SDL_MOUSEMOTION = 4, SDL_MOUSEBUTTONDOWN = 5, SDL_MOUSEBUTTONUP = 6, SDL_QUIT = 12, SDL_VIDEORESIZE = 16 };
enum : uint8_t { SDL_APPACTIVE = 4 };
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
int (*SDL_EnableUNICODE)(int);

SdlSurface* screen = nullptr;
// The screen the program has: below `top` rows the system covers. webOS 3.0.0 keeps 14 rows of its status bar over a full-screen PDK
// card (the owner's eye and a marker line, 2026-10-15; libnapp asks for full screen and LunaSysMgr grants it, the cause is unknown):
// the program's screen starts under them, its picture and its touches moved down as one. ZINC_WEBOS_TOP overrides (0: the whole panel).
int sw = 0, sh = 0;   // the program's screen: the panel less `top` rows
int top = 14;
int panelH(int h) { static const int t = getenv("ZINC_WEBOS_TOP") ? atoi(getenv("ZINC_WEBOS_TOP")) : 14; top = t >= 0 && t < h / 4 ? t : 14; return h - top; }
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

void setKeyboard(bool on);   // below: the system keyboard and the band it leaves
// A program sent to the background gives back what it asked of zinc-helper (zinc:webos setBacklight / setPerformance): a hidden card
// must never hold the screen dark (the next touch would not reach it) nor the CPU at full speed. Its requests come back when it returns.
void yieldRequests(bool front) {
  static bool heldDark = false, heldFast = false;
  const std::string pid = std::to_string(getpid()), perf = "/tmp/zinc/perf/" + pid;
  if (!front) {
    char state[64] = {0};
    if (FILE* f = fopen("/tmp/zinc/backlight", "r")) { if (!fgets(state, sizeof state, f)) state[0] = 0; fclose(f); }
    heldDark = std::string(state).rfind("off " + pid, 0) == 0;
    if (heldDark) if (FILE* f = fopen("/tmp/zinc/backlight", "w")) { fputs("on\n", f); fclose(f); }
    heldFast = access(perf.c_str(), F_OK) == 0;
    if (heldFast) remove(perf.c_str());
  } else {
    if (heldDark) if (FILE* f = fopen("/tmp/zinc/backlight", "w")) { fprintf(f, "off %s\n", pid.c_str()); fclose(f); }
    if (heldFast) if (FILE* f = fopen(perf.c_str(), "w")) fclose(f);
    heldDark = heldFast = false;
  }
}
bool active = true;   // the card is maximized (SDL_APPACTIVE): document.visibilityState, through zgl_backend_device
std::string keysSeen;   // keys the program has no HAL code for (media keys, the Center button if it comes): read and emptied by the "keys" query
// A key or a typed character for the program (the system keyboard, a Bluetooth keyboard, the gesture area: back is SDLK_ESCAPE).
void key(const SdlEvent& e, HalInput* in) {
  const int32_t sym = e.key.sym;
  int32_t code = 0;
  if (sym >= 32 && sym < 127) code = sym >= 'A' && sym <= 'Z' ? sym + 32 : sym;
  else if (sym == 8) code = HAL_KEY_BACKSPACE;
  else if (sym == 127) code = HAL_KEY_DELETE;
  else if (sym == 13) code = HAL_KEY_ENTER;
  else if (sym == 9) code = HAL_KEY_TAB;
  else if (sym == 27) code = HAL_KEY_ESCAPE;   // PDLK_GESTURE_BACK
  else if (sym == 230) {   // the keyboard's own "hide" key: the program asked for the keyboard, it closes it (it would stay), and hears Escape
    if (e.type == SDL_KEYDOWN) setKeyboard(false);
    if (in->nkeys < HAL_MAX_KEYS) in->keys[in->nkeys++] = HalKey{HAL_KEY_ESCAPE, 0, e.type == SDL_KEYDOWN ? HAL_KEY_DOWN : HAL_KEY_UP, 0, 0};
    return;
  }
  else if (sym >= 273 && sym <= 276) code = sym == 273 ? HAL_KEY_ARROW_UP : sym == 274 ? HAL_KEY_ARROW_DOWN : sym == 275 ? HAL_KEY_ARROW_RIGHT : HAL_KEY_ARROW_LEFT;
  if (e.type == SDL_KEYDOWN && !code && keysSeen.size() < 200) keysSeen += (keysSeen.empty() ? "" : ",") + std::to_string(sym);
  if (code && in->nkeys < HAL_MAX_KEYS) in->keys[in->nkeys++] = HalKey{code, 0, e.type == SDL_KEYDOWN ? HAL_KEY_DOWN : HAL_KEY_UP, 0, 0};
  const uint32_t u = e.key.unicode;   // the character, SDL_EnableUNICODE(1)
  if (e.type != SDL_KEYDOWN || u < 32 || u == 127 || in->nkeys >= HAL_MAX_KEYS) return;
  char b[4]; int n = 0;
  if (u < 0x80) b[n++] = (char)u;
  else if (u < 0x800) { b[n++] = (char)(0xC0 | u >> 6); b[n++] = (char)(0x80 | (u & 63)); }
  else { b[n++] = (char)(0xE0 | u >> 12); b[n++] = (char)(0x80 | (u >> 6 & 63)); b[n++] = (char)(0x80 | (u & 63)); }
  if (in->ntext + n > HAL_TEXT_BYTES) return;
  std::memcpy(in->text + in->ntext, b, n);
  in->keys[in->nkeys++] = HalKey{0, 0, HAL_KEY_TEXT, (uint16_t)in->ntext, (uint16_t)n};
  in->ntext += n;
}

// The system keyboard and the program's orientation (docs/reports/hardware/webos-keyboard-orientation.md). webOS 3.0.0 tells a PDK card
// neither the keyboard's height nor a turn: the keyboard is the user's size setting (340 px by default), the card shrinks around the
// screen's centre (the wallpaper shows in a band of k/2 at the user's top, the keyboard covers k at the bottom), and the system never turns
// the card's buffer. So the program's surface is the visible band, drawn there and turned by display-gl, and its touches are mapped back.
bool kbShown = false;
int kb = 340;            // ponytail: the default size; com.palm.systemservice x_palm_virtualkeyboard_settings ("keyboard size" -2..1: 243 291 340 393) when it matters
int turn = 0;            // the program's picture turned clockwise on the screen, in quarter turns (0 the screen's own landscape)
std::string policy = "natural";   // what the program asked (screen.orientation): natural, any, landscape, portrait, or one orientation
// The logical surface for the turn and the keyboard.
void logicalSize(int* w, int* h) {
  int lw = turn & 1 ? sh : sw, lh = turn & 1 ? sw : sh;
  if (kbShown) lh -= kb + kb / 2 - (turn & 1 ? 0 : top);   // landscape: the bands are the panel's, whose top rows the system takes anyway
  *w = lw; *h = lh;
}
// A screen point to the surface's (content turned clockwise by `turn`: report §11), then the band of the keyboard.
void toLogical(float X, float Y, float* x, float* y) {
  const float W = (float)sw, H = (float)sh;
  Y -= top;   // the panel's rows to the program's screen
  float lx = X, ly = Y;
  if (turn == 1) { lx = Y; ly = W - 1 - X; }
  else if (turn == 2) { lx = W - 1 - X; ly = H - 1 - Y; }
  else if (turn == 3) { lx = H - 1 - Y; ly = X; }
  if (kbShown) ly -= turn == 0 ? kb / 2 - top : kb / 2;
  *x = lx; *y = ly;
}
void setKeyboard(bool on) {
  if (void* pdl = dlopen("libpdl.so", RTLD_NOW | RTLD_GLOBAL)) if (auto f = (int (*)(int))dlsym(pdl, "PDL_SetKeyboardState")) f(on ? 1 : 0);
  kbShown = on;
}
// The system's own rotation (the keyboard, banners): PDL_SetOrientation counts the other way round in portrait (measured 2026-10-15: with
// the same value the system's keyboard stood upside down against the picture), 0 and 2 the landscapes.
void tellOrientation() {
  if (void* pdl = dlopen("libpdl.so", RTLD_NOW | RTLD_GLOBAL)) if (auto f = (int (*)(int))dlsym(pdl, "PDL_SetOrientation")) f(turn & 1 ? 4 - turn : turn);
}

// An event for this frame. TAKEN: go on with the next one. LAST: taken, and the frame's input ends here (a press: the program sees the
// finger where it landed before it sees it move, so a flick shorter than a slow frame is still a flick). WAIT: it is for the next frame.
enum Took { TAKEN, LAST, WAIT };
Took take(const SdlEvent& e) {
  if (e.type == SDL_QUIT) { quit = true; return TAKEN; }
  if (e.type != SDL_MOUSEMOTION && e.type != SDL_MOUSEBUTTONDOWN && e.type != SDL_MOUSEBUTTONUP) return TAKEN;
  if (e.button.which >= HAL_MAX_TOUCH) return TAKEN;   // `which` is at the same place in the motion event
  Finger& g = fingers[e.button.which];
  if (e.type == SDL_MOUSEMOTION) { if (g.phase == DOWN) toLogical(e.motion.x, e.motion.y, &g.x, &g.y); return TAKEN; }   // a move before a press belongs to that press, which has the place
  if (e.type == SDL_MOUSEBUTTONUP) { if (g.phase == DOWN) g.phase = LEAVING; return TAKEN; }
  if (g.phase != IDLE) return WAIT;
  g = Finger{DOWN, contacts++, 0, 0};
  toLogical(e.button.x, e.button.y, &g.x, &g.y);
  if (getenv("ZINC_GL_INFO")) fprintf(stderr, "gl-info: touch %d down at %.0f,%.0f (finger %d)\n", g.id, g.x, g.y, e.button.which);
  return LAST;
}

// Measurements without a shell: webOS starts the card itself, so /tmp/zinc/env (NAME=value lines, e.g. ZINC_PERF_HUD=1, ZINC_PROFILE=1)
// is the program's environment, and its stderr goes to /tmp/zinc/log-<pid> while that file exists. Read first, before the screen's size.
void loadEnv() {
  static bool done = false;
  if (done) return;
  done = true;
  if (FILE* f = fopen("/tmp/zinc/env", "r")) {
    char line[2048];   // a benchmark's list of scenes is longer than 255 characters (tools/zbench)
    while (fgets(line, sizeof line, f)) {
      line[strcspn(line, "\r\n")] = 0;
      if (char* eq = strchr(line, '=')) { *eq = 0; if (*line) setenv(line, eq + 1, 1); }
    }
    fclose(f);
    char log[64];
    snprintf(log, sizeof log, "/tmp/zinc/log-%d", (int)getpid());
    if (freopen(log, "w", stderr)) setvbuf(stderr, nullptr, _IOLBF, 0);
  }
}
bool open_sdl() {   // once: the screen's size is asked for before the init
  static int state = 0;
  if (state) return state > 0;
  state = -1;
  loadEnv();
  void* so = dlopen("libSDL-1.2.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!so) { fprintf(stderr, "display-gl: no libSDL-1.2.so.0: not webOS\n"); return false; }
#define SYM(f) if (!(f = (decltype(f))dlsym(so, #f))) { fprintf(stderr, "display-gl: libSDL has no %s\n", #f); return false; }
  SYM(SDL_Init) SYM(SDL_Quit) SYM(SDL_GetError) SYM(SDL_GetVideoInfo) SYM(SDL_SetVideoMode) SYM(SDL_GL_SetAttribute) SYM(SDL_GL_SwapBuffers) SYM(SDL_PollEvent) SYM(SDL_EnableUNICODE)
#undef SYM
  // PDL_Init before SDL, as the PDK's own ports do (cocos2d-x webOS, the webOS X server): with it late the system kept the card as a normal
  // one, under a strip of its status bar (docs/reports/hardware/webos-fullscreen.md)
  if (void* pdl = dlopen("libpdl.so", RTLD_NOW | RTLD_GLOBAL))
    if (auto init = (int (*)(unsigned))dlsym(pdl, "PDL_Init")) init(0);
  if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "display-gl: SDL_Init: %s\n", SDL_GetError()); return false; }
  if (const SdlVideoInfo* v = SDL_GetVideoInfo()) { sw = v->w; sh = panelH(v->h); }
  SDL_EnableUNICODE(1);   // the typed character in each key event
  state = 1;
  return true;
}
}  // namespace

bool zgl_backend_init(const HalConfig*) {
  // A program's jail has no /etc/localtime: zinc-helper writes the system's zone (plugins/webos/helper.sh) and the zoneinfo files are there
  if (!getenv("TZ"))
    if (FILE* f = fopen("/tmp/zinc/tz", "r")) {
      char zone[64] = {0};
      if (fgets(zone, sizeof zone, f)) { zone[strcspn(zone, "\n")] = 0; if (*zone) { setenv("TZ", zone, 1); tzset(); } }
      fclose(f);
    }
  if (!open_sdl()) return false;
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);    // the GL renderer's occlusion of what opaque rectangles hide (as src/sdl.cpp)
  SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);   // measured: without them a frame takes as long on the Adreno 220
  setenv("ZINC_RENDERER", "gl", 0);              // the GPU draws the UI: the faster renderer on this device (hp-touchpad-webos.md, section 12)
  setenv("ZINC_GL_DIRECT", "1", 0);              // a frame straight into the window: on this tiled GPU the texture's reload and copy cost 12 ms (52 ms against 40 for the Matériel page, 2026-10-15)
  setenv("ZINC_GL_CORNERS", "0", 0);             // square clips: a rounded one copies the framebuffer in mid-frame, a whole pass on this GPU (12 to 24 frames a second in hero's transitions)
  SDL_GL_SetAttribute(SDL_GL_SWAP_CONTROL, getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0 ? 0 : 1);
  screen = SDL_SetVideoMode(0, 0, 0, SDL_OPENGL | SDL_FULLSCREEN);   // 0 x 0: the screen's own mode
  if (!screen) { fprintf(stderr, "display-gl: no GL screen: %s\n", SDL_GetError()); return false; }
  sw = screen->w; sh = panelH(screen->h);
  if (getenv("ZINC_VSYNC") && atoi(getenv("ZINC_VSYNC")) == 0)   // measurements: Palm's SDL ignores SDL_GL_SWAP_CONTROL, EGL has the interval
    if (void* egl = dlopen("libEGL.so", RTLD_NOW)) {
      void* (*display)() = (void* (*)())dlsym(egl, "eglGetCurrentDisplay");
      unsigned (*interval)(void*, int) = (unsigned (*)(void*, int))dlsym(egl, "eglSwapInterval");
      if (display && interval) fprintf(stderr, "display-gl: swap interval 0: %s\n", interval(display(), 0) ? "set" : "refused");
    }
  GLint r = 0, g = 0, bl = 0, al = 0, dz = 0, st = 0;
  glGetIntegerv(GL_RED_BITS, &r); glGetIntegerv(GL_GREEN_BITS, &g); glGetIntegerv(GL_BLUE_BITS, &bl); glGetIntegerv(GL_ALPHA_BITS, &al); glGetIntegerv(GL_DEPTH_BITS, &dz); glGetIntegerv(GL_STENCIL_BITS, &st);
  fprintf(stderr, "display-gl: webOS %dx%d, %s, %s, colour %d%d%d%d depth %d stencil %d\n", sw, sh, glGetString(GL_RENDERER), glGetString(GL_VERSION), r, g, bl, al, dz, st);
  return true;
}

int32_t zgl_backend_scale() { return 1; }   // the panel's own pixels
void zgl_backend_size(int32_t* w, int32_t* h) { *w = sw; *h = sh; }
extern "C" void zgl_backend_surface(int32_t* w, int32_t* h) { if (sw > 0 && sh > 0) logicalSize(w, h); }
// Both orientations fit a square of the screen's longer side: the GPU target is allocated once (the Adreno 220 cannot reallocate it).
extern "C" void zgl_backend_reserve(int32_t* w, int32_t* h) { *w = *h = sw > sh ? sw : sh; }
// The visible band and the turn (display-gl): the picture's rectangle on the screen, in screen pixels from the top-left.
extern "C" int zgl_backend_place(int32_t* x, int32_t* y, int32_t* w, int32_t* h, int32_t* t) {
  if (!kbShown && !turn) return 0;
  const int k = kbShown ? kb : 0;
  *t = turn;
  if (turn == 0) { *x = 0; *y = k ? k / 2 - top : 0; *w = sw; *h = k ? sh + top - k - k / 2 : sh; }   // with the keyboard the bands are counted on the panel
  else if (turn == 2) { *x = 0; *y = k ? k - top : 0; *w = sw; *h = k ? sh + top - k - k / 2 : sh; }
  else if (turn == 1) { *x = k; *y = 0; *w = sw - k - k / 2; *h = sh; }
  else { *x = k / 2; *y = 0; *w = sw - k - k / 2; *h = sh; }
  return 1;
}
// webos_device.cpp: the system keyboard (navigator.virtualKeyboard) and the orientation the program asked (screen.orientation).
extern "C" void zgl_webos_keyboard(int on) { setKeyboard(on != 0); }
extern "C" int zgl_webos_turn() { return turn; }   // the program's picture turned clockwise, quarter turns (screen.orientation)
extern "C" void zgl_webos_orientation(const char* p) {
  policy = p;
  const int fixed = policy == "landscape-primary" || policy == "natural" ? 0 : policy == "portrait-primary" ? 1 : policy == "landscape-secondary" ? 2 : policy == "portrait-secondary" ? 3 : -1;
  if (fixed >= 0 && fixed != turn) { turn = fixed; tellOrientation(); }   // the system is told only of a change (see the activation)
}
void zgl_backend_native(int32_t* w, int32_t* h) { if (open_sdl() && sw > 0 && sh > 0) { *w = sw; *h = sh; } }
// LunaSysMgr composes the card with the alpha of its pixels: where a frame left less than 1 the system's wallpaper shows through. The frame
// is made opaque before it is shown (nothing in the renderer reads the alpha it wrote).
void zgl_backend_swap() {
  glDisable(GL_SCISSOR_TEST);
  glColorMask(GL_FALSE, GL_FALSE, GL_FALSE, GL_TRUE);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  if (top > 0) {   // the rows above the program's screen: never drawn, they kept old frames the system sometimes shows (2026-10-15)
    glEnable(GL_SCISSOR_TEST);
    glScissor(0, sh, sw, top);
    glClear(GL_COLOR_BUFFER_BIT);
    glDisable(GL_SCISSOR_TEST);
  }
  SDL_GL_SwapBuffers();
}

extern "C" int zgl_webos_axes(float* xyz);   // webos_device.cpp: the accelerometer, m/s^2, raw axes of the tablet
// The pose from the accelerometer while the program turns with the device: the raw axes' thresholds of the TouchPad's X server (dtzWill,
// sdl.c:988-1020; upright landscape reads x = -9.8, measured), a pose held 300 ms, flat or in between keeps the last one.
void followPose() {
  if (policy == "natural" || policy == "landscape-primary" || policy == "portrait-primary" || policy == "landscape-secondary" || policy == "portrait-secondary") return;
  static uint64_t last = 0;
  static int candidate = -1, held = 0;
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
  const uint64_t now = (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
  if (now - last < 100) return;
  last = now;
  float a[3];
  if (!zgl_webos_axes(a)) return;
  const float g = 9.80665f * 0.5f;
  int pose = -1;
  // measured 2026-10-15 (the owner, holding it): y > 0 is the portrait whose picture is turned 270 degrees, y < 0 the one turned 90
  if (a[0] < -g && std::fabs(a[1]) < std::fabs(a[0])) pose = 0;
  else if (a[1] > g && std::fabs(a[0]) < a[1]) pose = 3;
  else if (a[0] > g && std::fabs(a[1]) < a[0]) pose = 2;
  else if (a[1] < -g && std::fabs(a[0]) < -a[1]) pose = 1;
  if (pose < 0 || ((policy == "landscape" && (pose & 1)) || (policy == "portrait" && !(pose & 1)))) { candidate = -1; return; }
  if (pose != candidate) { candidate = pose; held = 0; return; }
  if ((held += 100) < 300 || pose == turn) return;
  turn = pose;
  tellOrientation();
}

// Test hooks for the workstation (over novacom, no hands on the tablet): /tmp/zinc/test-turn holds a turn (0..3) to apply as if the device
// had turned; /tmp/zinc/test-kb shows the system keyboard while it exists. Read twice a second.
void testHooks() {
  static int n = 0, wasKb = 0;
  if (n++ % 30) return;
  if (FILE* f = fopen("/tmp/zinc/test-turn", "r")) { int t = 0; if (fscanf(f, "%d", &t) == 1 && t >= 0 && t < 4 && t != turn) { turn = t; tellOrientation(); } fclose(f); }
  const int kbNow = access("/tmp/zinc/test-kb", F_OK) == 0;
  if (kbNow != wasKb) { wasKb = kbNow; setKeyboard(kbNow != 0); }
}

void zgl_backend_poll(HalInput* in, int32_t W, int32_t H) {
  testHooks();
  followPose();
  static const bool info = getenv("ZINC_GL_INFO") != nullptr;   // every press and release as the program gets them, and the events that are not touches
  const int cap = (int)(sizeof queue / sizeof *queue);
  SdlEvent e;
  in->nkeys = 0; in->ntext = 0;
  // the events that are not touches, raw, while /tmp/zinc/glinfo exists (finding the layout of Palm's events on the device)
  static FILE* raw = nullptr;
  static int rawChecked = 0;
  if (rawChecked++ % 60 == 0) { if (!raw && access("/tmp/zinc/glinfo", F_OK) == 0) raw = fopen("/tmp/zinc/glinfo.log", "a"); }
  while (queued < cap && SDL_PollEvent(&e)) {
    if (raw && (e.type < SDL_MOUSEMOTION || e.type > SDL_MOUSEBUTTONUP)) {
      fprintf(raw, "type %d:", e.type);
      for (int k = 0; k < 24; k++) fprintf(raw, " %02x", e.room[k]);
      fprintf(raw, "  screen %dx%d\n", sw, sh);
      fflush(raw);
    }
    if (info && (e.type < SDL_MOUSEMOTION || e.type > SDL_MOUSEBUTTONUP)) fprintf(stderr, "gl-info: event %d (%d %d %d) sym %d unicode %d\n", e.type, e.room[1], e.room[2], e.room[3], e.type == SDL_KEYDOWN || e.type == SDL_KEYUP ? e.key.sym : 0, e.type == SDL_KEYDOWN ? e.key.unicode : 0);
    if (e.type == SDL_KEYDOWN || e.type == SDL_KEYUP) { key(e, in); continue; }   // keys are not touches: given at once, in order
    // back in front: the keyboard and the turn are told again only when there is one (a call with nothing to change brought the status
    // bar back over the card's top rows, 2026-10-15)
    if (e.type == SDL_ACTIVEEVENT) { if (e.active.state & SDL_APPACTIVE) { active = e.active.gain != 0; yieldRequests(active); if (active) { if (kbShown) setKeyboard(true); if (turn) tellOrientation(); } } continue; }
    if (e.type == 24) continue;   // SDL_USEREVENT: PDL's compass (0xE110), GPS...: read through libpdl when asked
    if (e.type == 17) { if (kbShown) setKeyboard(true); continue; }   // SDL_VIDEOEXPOSE: the card is back
    // the system keyboard takes the bottom of the screen and gives it back: the card is that much shorter, the program draws to fit
    if (e.type == SDL_VIDEORESIZE) { if (e.resize.w > 0 && e.resize.h > 0) { sw = e.resize.w; sh = panelH(e.resize.h); } continue; }
    queue[(head + queued++) % cap] = e;
  }
  while (queued) {
    const Took t = take(queue[head]);
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

// For webos_device.cpp (the device's features): the card's state and the keys without a HAL code.
extern "C" int zgl_webos_active() { return active ? 1 : 0; }
extern "C" const char* zgl_webos_keys() { static std::string out; out.swap(keysSeen); keysSeen.clear(); return out.c_str(); }
