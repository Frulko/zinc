#pragma once
#include <stdint.h>
struct SDL_Window { int id; };
using SDL_GLContext = void*;
using SDL_FunctionPointer = void (*)();
using SDL_InitFlags = uint32_t;
using SDL_WindowFlags = uint64_t;
constexpr SDL_InitFlags SDL_INIT_VIDEO = 0x20;
constexpr SDL_WindowFlags SDL_WINDOW_OPENGL = 2, SDL_WINDOW_HIDDEN = 8;
enum SDL_GLAttr { SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_MAJOR_VERSION, SDL_GL_CONTEXT_MINOR_VERSION, SDL_GL_CONTEXT_FLAGS };
constexpr int SDL_GL_CONTEXT_PROFILE_CORE = 1, SDL_GL_CONTEXT_PROFILE_ES = 4, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG = 2;
bool SDL_IsMainThread();
SDL_InitFlags SDL_WasInit(SDL_InitFlags);
bool SDL_InitSubSystem(SDL_InitFlags);
void SDL_GL_ResetAttributes();
bool SDL_GL_SetAttribute(SDL_GLAttr, int);
SDL_Window* SDL_CreateWindow(const char*, int, int, SDL_WindowFlags);
void SDL_DestroyWindow(SDL_Window*);
SDL_GLContext SDL_GL_CreateContext(SDL_Window*);
bool SDL_GL_DestroyContext(SDL_GLContext);
SDL_Window* SDL_GL_GetCurrentWindow();
SDL_GLContext SDL_GL_GetCurrentContext();
bool SDL_GL_MakeCurrent(SDL_Window*, SDL_GLContext);
SDL_FunctionPointer SDL_GL_GetProcAddress(const char*);

const char* SDL_GetError();
