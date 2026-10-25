// The engine as a library for an app shell (ZN-620, D59, docs/reports/zinc-next-mobile-core.md §3): an Android activity, an iOS app, any embedder.
// The library is the CMake target zn_app: the runtime, the graphics host with the SDL3 window HAL, the native registry and the libraries they
// need; no compiler (src/frontend), no toolchain manager (src/tc), no dlopen of plugins and no child processes. The program is the C++ that
// `zinc build` writes (ZN_AOT_CPP_ONLY=1 keeps it), compiled with -DZN_APP_LIBRARY: its main becomes zn_app_init.
// The shell owns the run loop and calls the engine once per tick: SDL3's main callbacks map one to one (src/app/shell_sdl.cpp).
#pragma once

// The SDL_SendAndroidMessage command the activity of `zinc export --target android` answers on its UI thread: the window's brightness,
// 0 (darkest) to 255, -1 the system's (device('backlight'), src/host/sys_host.cpp)
#define ZN_APP_ANDROID_BRIGHTNESS 0x8001
// ... and steady clocks while frames move (targets/macos/hal_sdl.cpp, ZN-750): 1 frames move, 0 at rest; the activity asks for
// Window.setSustainedPerformanceMode while frames move or the program asks for it (device('performance'))
#define ZN_APP_ANDROID_SUSTAINED 0x8002

#ifdef __cplusplus
extern "C" {
#endif
int zn_app_init(int argc, char** argv);    // the program's top level, up to where its loop would start: 0 running, 1 done, <0 error
int zn_app_iterate(void);                  // one tick: a frame when the program draws, else the due timers and a look at the host's loop; the same codes
void zn_app_event(const void* sdl_event);  // an SDL_Event the shell took off SDL's queue: the window HAL reads it at the next frame
void zn_app_quit(void);                    // flushes the console output, ends the run (once; zn_app_iterate's last call does it too)
int zn_app_main(int argc, char** argv);    // desktop and tests: init, then iterate until done; the exit status of `zinc run`
#ifdef __cplusplus
}
#endif
