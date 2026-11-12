#include <atomic>
#include <mutex>
#include <thread>
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
// Select the production Linux loader after the host standard headers have selected their own ABI.
#undef __APPLE__
#include "plugins/3d/native/gpu_context.h"
#include "plugins/3d/native/gpu_pool.h"
static SDL_Window before{1}, owned{2};
static SDL_Window* currentWindow = &before;
static SDL_GLContext currentContext = &before;
static const char* version = "OpenGL ES 3.0 fixture", *missing = nullptr, *missingSdl = nullptr;
static bool sdlAvailable = true, hostLoader = false, hostLoadOk = true;
static int hostLoads = 0, sdlLookups = 0;
static const auto originalThread = std::this_thread::get_id();
static bool mainThread = true, initialized = true, initOk = true, windowOk = true, contextOk = true;
static int creates = 0, windowsDestroyed = 0, contextsDestroyed = 0, lookups = 0;
bool SDL_IsMainThread() { return mainThread && std::this_thread::get_id() == originalThread; }
const char* SDL_GetError() { return "fixture"; }
SDL_InitFlags SDL_WasInit(SDL_InitFlags) { return initialized ? SDL_INIT_VIDEO : 0; }
bool SDL_InitSubSystem(SDL_InitFlags) { if (initOk) initialized = true; return initOk; }
void SDL_GL_ResetAttributes() {}
bool SDL_GL_SetAttribute(SDL_GLAttr, int) { return true; }
SDL_Window* SDL_CreateWindow(const char*, int w, int h, SDL_WindowFlags flags) {
  assert(w == 16 && h == 16 && flags == (SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN)); ++creates;
  return windowOk ? &owned : nullptr;
}
void SDL_DestroyWindow(SDL_Window* w) { assert(w == &owned); ++windowsDestroyed; }
SDL_GLContext SDL_GL_CreateContext(SDL_Window* w) {
  assert(w == &owned);
  if (!contextOk) return nullptr;
  currentWindow = w; currentContext = w; return w;
}
bool SDL_GL_DestroyContext(SDL_GLContext c) { assert(c == &owned); ++contextsDestroyed; if (currentContext == c) { currentContext = nullptr; currentWindow = nullptr; } return true; }
SDL_Window* SDL_GL_GetCurrentWindow() { return currentWindow; }
SDL_GLContext SDL_GL_GetCurrentContext() { return currentContext; }
bool SDL_GL_MakeCurrent(SDL_Window* w, SDL_GLContext c) { currentWindow = w; currentContext = c; return true; }
static const GLubyte* GLAD_API_PTR getString(GLenum name) { assert(name == GL_VERSION); return (const GLubyte*)version; }
static void noop() {}
SDL_FunctionPointer SDL_GL_GetProcAddress(const char* name) {
  assert(currentContext == &owned); ++lookups;
  if (missing && !strcmp(missing, name)) return nullptr;
  return !strcmp(name, "glGetString") ? (SDL_FunctionPointer)getString : noop;
}
static int loadHost() { ++hostLoads; if (hostLoadOk) sdlAvailable = true; return hostLoadOk ? 1 : 0; }
void* dlsym(void* handle, const char* name) {
  assert(handle == RTLD_DEFAULT); ++sdlLookups;
  if (!strcmp(name,"zn_window_load")) return hostLoader ? (void*)loadHost : nullptr;
  if (!sdlAvailable || (missingSdl && !strcmp(name,missingSdl))) return nullptr;
#define LOOKUP(name) if (!strcmp("SDL_" #name, nameString)) return (void*)&SDL_##name;
  const char* nameString = name;
  ZN_3D_SDL_FUNCTIONS(LOOKUP)
#undef LOOKUP
  return nullptr;
}
static void restored() { assert(currentWindow == &before && currentContext == &before); }
static void failed() {
  const int attempts = creates;
  GpuContext c;
  assert(!c.open() && c.state == GpuContext::State::Failed);
  restored();
  const int after = creates;
  assert(!c.open() && creates == after && creates <= attempts + 1);
  assert(!c.transition(GpuContext::State::Ready));
}
int main() {
  sdlAvailable = false;
  { GpuSdlBootstrap absent; assert(!absent.load()); const int n = sdlLookups; assert(!absent.load() && sdlLookups == n); assert(absent.state == GpuSdlBootstrap::State::Unavailable && absent.api.CreateWindow == nullptr && absent.error != nullptr); }
  hostLoader = true; hostLoadOk = false;
  { GpuSdlBootstrap failedHost; assert(!failedHost.load() && !strcmp(failedHost.error,"host window module unavailable")); }
  hostLoadOk = true;
  assert(gpuSdlLoad()); assert(hostLoads == 2); const int cachedLookups = sdlLookups;
  assert(gpuSdlLoad() && cachedLookups == sdlLookups);
  mainThread = false; assert(!gpuSdlLoad() && gpuSdlBootstrap.state == GpuSdlBootstrap::State::Ready); mainThread = true;
  hostLoader = false;
#define CHECK_SDL_MISSING(name) missingSdl = "SDL_" #name; { GpuSdlBootstrap absent; assert(!absent.load()); assert(absent.api.CreateWindow == nullptr && strstr(absent.error,missingSdl) != nullptr); const int n = sdlLookups; assert(!absent.load() && sdlLookups == n); }
  ZN_3D_SDL_FUNCTIONS(CHECK_SDL_MISSING)
#undef CHECK_SDL_MISSING
  missingSdl = nullptr;
  { GpuSdlBootstrap deferred; mainThread = false; assert(!deferred.load() && deferred.state == GpuSdlBootstrap::State::NotTried); mainThread = true; assert(deferred.load()); }
  mainThread = false; { GpuContext c; assert(!c.open() && c.state == GpuContext::State::NotTried); } mainThread = true;

  initialized = false; initOk = false; failed(); initOk = true; initialized = true;
  windowOk = false; failed(); windowOk = true;
  contextOk = false; failed(); contextOk = true;
  const char* versions[] = {"OpenGL ES 2.0 fixture", "4.1 desktop", "garbage"};
  for (const char* v : versions) { version = v; failed(); }
  version = "OpenGL ES 3.0 fixture";
  missing = "glGetString"; failed();
#define CHECK_MISSING(name) missing = "gl" #name; failed();
  ZN_3D_GL_FUNCTIONS(CHECK_MISSING)
#undef CHECK_MISSING
  missing = nullptr;
  const int destroyed = contextsDestroyed;
  { GpuContext c; assert(c.open() && c.state == GpuContext::State::Ready); restored(); const int n = lookups; assert(c.open() && lookups == n); c.current(); assert(currentContext == &owned); SDL_GL_MakeCurrent(&before, &before); }
  assert(contextsDestroyed == destroyed + 1 && windowsDestroyed > 0); restored();
  { GpuSdlBootstrap deferred; std::thread worker([&]() { assert(!deferred.load()); }); worker.join(); assert(deferred.state == GpuSdlBootstrap::State::NotTried); assert(deferred.load()); const int n = sdlLookups; std::thread second([&]() { assert(!deferred.load()); }); second.join(); assert(deferred.state == GpuSdlBootstrap::State::Ready && sdlLookups == n); }
  int a = 1, b = 2;
  GpuPool<int> p;
  const int32_t old = p.add(&a); assert(p.at(old) == &a); assert(p.remove(old));
  const int32_t live = p.add(&b); assert(live != old && p.at(old) == nullptr && p.at(live) == &b);
  assert(!p.remove(old) && p.at(live) == &b && !p.at(-1));
  assert(p.remove(live));
  for (uint32_t n = 2; n <= GpuPool<int>::maxGeneration; ++n) { const int32_t id = p.add(&a); assert(p.at(id) == &a); if (n == GpuPool<int>::maxGeneration) assert(!GpuPool<int>::transition(p.slots[0],GpuPool<int>::State::Vacant)); assert(p.remove(id)); }
  assert(p.slots[0].state == GpuPool<int>::State::Retired);
  const int32_t next = p.add(&b); assert((uint32_t(next) & GpuPool<int>::slotMask) == 1 && p.at(old) == nullptr);
  assert(!GpuPool<int>::transition(p.slots[1], GpuPool<int>::State::Ready, &a));
}
