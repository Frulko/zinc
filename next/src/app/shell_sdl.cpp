// The app shell on SDL3's main callbacks (ZN-620, docs/reports/zinc-next-mobile-core.md §3): SDL owns the run loop (the Android activity's
// thread, UIKit's run loop on iOS, the desktop's main) and calls these four functions; each maps to one call of include/zn/app.h.
// While the app is in the background the program is not stepped (no GL call there; Android may destroy the surface).
#define SDL_MAIN_USE_CALLBACKS 1
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>

#include "zn/app.h"

#ifdef __ANDROID__
#include <android/log.h>
#include <pthread.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef ZN_APP_HEAP_MB
#define ZN_APP_HEAP_MB 128   // zinc export writes the project's need (zinc.json targets.android.heapMB)
#endif

// stdout and stderr of the program (console.log, errors, the runtime's messages) go to logcat, a line per entry, tag "zinc"
static int log_fd[2];
static void* log_pump(void*) {
  char buf[4096];
  std::string line;
  for (ssize_t n; (n = read(log_fd[0], buf, sizeof buf)) > 0;) {
    line.append(buf, (size_t)n);
    for (size_t nl; (nl = line.find('\n')) != std::string::npos; line.erase(0, nl + 1)) __android_log_write(ANDROID_LOG_INFO, "zinc", line.substr(0, nl).c_str());
  }
  return nullptr;
}

// The project's assets/ travel in the APK under zinc/assets/ (zinc export lists them in zinc/assets.txt, with a stamp first): copied once per
// version into the app's files, where zinc:assets and file reads find them. ponytail: a copy, not AAsset descriptors; mapping the packs in
// place (stored uncompressed) when an app's assets are large
static void copy_assets(const std::string& files) {
  size_t n = 0;
  char* list = (char*)SDL_LoadFile("zinc/assets.txt", &n);
  if (!list) return;
  const std::string text(list, n), dir = files + "/assets", stampPath = files + "/assets.stamp";
  SDL_free(list);
  const std::string stamp = text.substr(0, text.find('\n'));
  size_t sn = 0;
  char* have = (char*)SDL_LoadFile(stampPath.c_str(), &sn);
  const bool same = have && std::string(have, sn) == stamp;
  SDL_free(have);
  if (!same) {
    for (size_t at = text.find('\n'); at != std::string::npos && at + 1 < text.size();) {
      const size_t end = text.find('\n', at + 1);
      const std::string rel = text.substr(at + 1, end == std::string::npos ? std::string::npos : end - at - 1);
      at = end;
      if (rel.empty()) continue;
      size_t len = 0;
      void* bytes = SDL_LoadFile(("zinc/assets/" + rel).c_str(), &len);
      const std::string out = dir + "/" + rel;
      for (size_t s = out.find('/', files.size() + 1); s != std::string::npos; s = out.find('/', s + 1)) mkdir(out.substr(0, s).c_str(), 0700);
      if (bytes) SDL_SaveFile(out.c_str(), bytes, len);
      SDL_free(bytes);
    }
    SDL_SaveFile(stampPath.c_str(), stamp.data(), stamp.size());
  }
  setenv("ZINC_ASSETS", dir.c_str(), 1);
}

static void android_setup() {
  pipe(log_fd);
  dup2(log_fd[1], 1);
  dup2(log_fd[1], 2);
  setvbuf(stdout, nullptr, _IOLBF, 0);
  pthread_t t;
  pthread_create(&t, nullptr, log_pump, nullptr);
  const char* files = SDL_GetAndroidInternalStoragePath();
  const char* cache = SDL_GetAndroidCachePath();
  if (files) {
    setenv("HOME", files, 1);
    setenv("ZINC_HOME", (std::string(files) + "/zinc").c_str(), 0);
    chdir(files);
    copy_assets(files);
  }
  if (cache) setenv("TMPDIR", cache, 0);
  // The heap of the runtime (one region, targets/common/hal_posix.cpp): the program's need, at most a quarter of the device's memory. The
  // desktop's 512 MiB cannot be had on a 1 GB device (a 32-bit process, ~400 MB free on the Nexus 7 2012).
  if (!getenv("ZINC_HEAP")) {
    long mb = ZN_APP_HEAP_MB, cap = SDL_GetSystemRAM() / 4;
    if (cap > 16 && mb > cap) mb = cap;
    setenv("ZINC_HEAP", std::to_string(mb << 20).c_str(), 1);
  }
}
#endif

static bool paused;

SDL_AppResult SDL_AppInit(void**, int argc, char** argv) {
#ifdef __ANDROID__
  android_setup();
#endif
  const int rc = zn_app_init(argc, argv);
  return rc == 0 ? SDL_APP_CONTINUE : rc == 1 ? SDL_APP_SUCCESS : SDL_APP_FAILURE;
}

SDL_AppResult SDL_AppIterate(void*) {
  if (paused) { SDL_Delay(50); return SDL_APP_CONTINUE; }
  const int rc = zn_app_iterate();
  return rc == 0 ? SDL_APP_CONTINUE : rc == 1 ? SDL_APP_SUCCESS : SDL_APP_FAILURE;
}

SDL_AppResult SDL_AppEvent(void*, SDL_Event* e) {
  // ponytail: lifecycle stops the stepping only; zinc:app onPause/onResume and the GPU rebuild after a lost surface are ZN-625
  if (e->type == SDL_EVENT_WILL_ENTER_BACKGROUND || e->type == SDL_EVENT_DID_ENTER_BACKGROUND) paused = true;
  if (e->type == SDL_EVENT_DID_ENTER_FOREGROUND) paused = false;
  if (e->type == SDL_EVENT_TERMINATING) return SDL_APP_SUCCESS;
  zn_app_event(e);
  return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void*, SDL_AppResult) { zn_app_quit(); }
