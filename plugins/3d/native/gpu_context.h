#pragma once
#include "gpu_gl.h"

namespace {

struct GpuCurrent {
  SDL_Window* window = sdl.GL_GetCurrentWindow();
  SDL_GLContext context = sdl.GL_GetCurrentContext();
  ~GpuCurrent() { if (sdl.GL_GetCurrentContext() != context) sdl.GL_MakeCurrent(window, context); }
};

// SDL's GL API is main-thread-only. Failed initialization is cached for this renderer instance.
struct GpuContext {
  enum class State { NotTried, Opening, Ready, Failed, Closed };
  State state = State::NotTried;
  SDL_Window* window = nullptr;
  SDL_GLContext context = nullptr;
  bool transition(State to) {
    const bool allowed = (state == State::NotTried && to == State::Opening) ||
      (state == State::Opening && (to == State::Ready || to == State::Failed)) ||
      ((state == State::NotTried || state == State::Ready || state == State::Failed) && to == State::Closed);
    if (allowed) state = to;
    return allowed;
  }
  void release() {
    if (context) sdl.GL_DestroyContext(context);
    if (window) sdl.DestroyWindow(window);
    context = nullptr; window = nullptr;
  }
  ~GpuContext() {
    if (sdl.WasInit && sdl.WasInit(SDL_INIT_VIDEO)) release();  // SDL_Quit may already have destroyed the window at process shutdown.
    transition(State::Closed);
  }
  bool open() {
    if (state != State::NotTried) return state == State::Ready;
    if (!gpuSdlLoad() || !transition(State::Opening)) return false;
    GpuCurrent restore;
    struct Attempt {
      GpuContext& owner;
      ~Attempt() { if (owner.state == State::Opening) { owner.release(); owner.transition(State::Failed); } }
    } attempt{*this};
    if (!sdl.WasInit(SDL_INIT_VIDEO) && !sdl.InitSubSystem(SDL_INIT_VIDEO)) return false;
    sdl.GL_ResetAttributes();
#ifdef __APPLE__
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
#else
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    sdl.GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
#endif
    window = sdl.CreateWindow("zinc:3d", 16, 16, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
    if (window) context = sdl.GL_CreateContext(window);
    if (!context || !gpuLoadApi()) return false;
    return transition(State::Ready);
  }
  void current() { if (sdl.GL_GetCurrentContext() != context) sdl.GL_MakeCurrent(window, context); }
};

} // namespace
