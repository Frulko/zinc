#pragma once
#include <SDL3/SDL.h>
#include <stdio.h>
#ifndef __APPLE__
#include <dlfcn.h>
#include <atomic>
#include <mutex>
#endif

namespace {

#define ZN_3D_SDL_FUNCTIONS(X) X(CreateWindow) \
  X(DestroyWindow) \
  X(GL_CreateContext) \
  X(GL_DestroyContext) \
  X(GL_GetCurrentContext) \
  X(GL_GetCurrentWindow) \
  X(GL_GetProcAddress) \
  X(GL_MakeCurrent) \
  X(GL_ResetAttributes) \
  X(GL_SetAttribute) \
  X(GetError) \
  X(InitSubSystem) \
  X(IsMainThread) \
  X(WasInit)
struct GpuSdl {
#define ZN_3D_SDL_FIELD(name) decltype(&::SDL_##name) name = nullptr;
  ZN_3D_SDL_FUNCTIONS(ZN_3D_SDL_FIELD)
#undef ZN_3D_SDL_FIELD
};
#ifdef __APPLE__
static const GpuSdl sdl{
#define ZN_3D_SDL_DIRECT(name) &::SDL_##name,
  ZN_3D_SDL_FUNCTIONS(ZN_3D_SDL_DIRECT)
#undef ZN_3D_SDL_DIRECT
};
static bool gpuSdlLoad() { return sdl.IsMainThread(); }
#else
struct GpuSdlBootstrap {
  enum class State { NotTried, Resolving, Ready, Unavailable };
  std::atomic<State> state{State::NotTried};
  std::mutex mutex;
  GpuSdl api;
  const char* error = nullptr;
  bool transition(State from, State to) {
    const bool allowed = (from == State::NotTried && to == State::Resolving) ||
      (from == State::Resolving && (to == State::NotTried || to == State::Ready || to == State::Unavailable));
    return allowed && state.compare_exchange_strong(from, to, std::memory_order_acq_rel);
  }
  bool load() {
    const State current = state.load(std::memory_order_acquire);
    if (current == State::Ready) return api.IsMainThread();
    if (current == State::Unavailable || current == State::Resolving) return false;
    std::lock_guard<std::mutex> lock(mutex);
    if (state.load(std::memory_order_acquire) == State::Ready) return api.IsMainThread();
    if (!transition(State::NotTried, State::Resolving)) return false;
    struct Attempt {
      GpuSdlBootstrap& owner;
      ~Attempt() { if (owner.transition(State::Resolving, State::Unavailable)) fprintf(stderr, "zinc:3d: %s; drawing with the software renderer\n", owner.error ? owner.error : "SDL unavailable"); }
    } attempt{*this};
    GpuSdl candidate;
    const char* missing = nullptr;
    auto resolve = [&]() {
      bool ok = true; missing = nullptr;
#define ZN_3D_SDL_LOAD(name) if (!(candidate.name = (decltype(candidate.name))dlsym(RTLD_DEFAULT, "SDL_" #name))) { ok = false; if (!missing) missing = "missing SDL_" #name; }
      ZN_3D_SDL_FUNCTIONS(ZN_3D_SDL_LOAD)
#undef ZN_3D_SDL_LOAD
      return ok;
    };
    if (!resolve()) {
      // The CLI owns SDL in this optional module; cross-built null/EGL apps may have no SDL at all.
      const auto windowLoad = (int (*)())dlsym(RTLD_DEFAULT, "zn_window_load");
      if (!windowLoad) { error = missing; return false; }
      if (!windowLoad()) { error = "host window module unavailable"; return false; }
      if (!resolve()) { error = missing; return false; }
    }
    if (!candidate.IsMainThread()) { transition(State::Resolving, State::NotTried); return false; }
    api = candidate;
    return transition(State::Resolving, State::Ready); // Release publishes the complete immutable table.
  }
};
static GpuSdlBootstrap gpuSdlBootstrap;
static const GpuSdl& sdl = gpuSdlBootstrap.api;
static bool gpuSdlLoad() { return gpuSdlBootstrap.load(); }
#endif

} // namespace
