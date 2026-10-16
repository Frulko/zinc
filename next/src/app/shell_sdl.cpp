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

#ifdef __APPLE__
#include <TargetConditionals.h>   // TARGET_OS_IOS: __APPLE__ is true on macOS too
#endif
#if defined(__ANDROID__) || (defined(TARGET_OS_IOS) && TARGET_OS_IOS)
#define ZN_PHONE 1   // an app of a phone or tablet: no environment, no terminal, its own data directory
#include <pthread.h>
#include <sys/stat.h>
#include <unistd.h>
#ifdef __ANDROID__
#include <android/log.h>
#include <jni.h>
#else
#include <os/log.h>
#endif

#ifdef ZN_APP_HEAP_MB   // zinc export defines it from the profile's heap (android 128 MiB, ios 256 MiB); a constant, not a macro of ours (tests/t0/shared_headers)
static const long kAppHeapMb = ZN_APP_HEAP_MB;
#else
static const long kAppHeapMb = 128;
#endif

// stdout and stderr of the program (console.log, errors, the runtime's messages) go to the system's log, a line per entry: logcat (tag "zinc"),
// os_log on iOS (Console.app, `xcrun simctl spawn booted log stream`, Xcode)
static int log_fd[2];
static void* log_pump(void*) {
  char buf[4096];
  std::string line;
  for (ssize_t n; (n = read(log_fd[0], buf, sizeof buf)) > 0;) {
    line.append(buf, (size_t)n);
    for (size_t nl; (nl = line.find('\n')) != std::string::npos; line.erase(0, nl + 1)) {
#ifdef __ANDROID__
      __android_log_write(ANDROID_LOG_INFO, "zinc", line.substr(0, nl).c_str());
#else
      os_log(OS_LOG_DEFAULT, "%{public}s", line.substr(0, nl).c_str());
#endif
    }
  }
  return nullptr;
}
static pthread_t log_thread;
static bool log_on;
static void log_to_system() {
  pipe(log_fd);
  dup2(log_fd[1], 1);
  dup2(log_fd[1], 2);
  setvbuf(stdout, nullptr, _IOLBF, 0);
  log_on = pthread_create(&log_thread, nullptr, log_pump, nullptr) == 0;
}
// at the end of the run: the lines still in the pipe reach the log before the process ends (a console program on iOS ends at once)
static void log_drain() {
  if (!log_on) return;
  fflush(stdout);
  close(1); close(2); close(log_fd[1]);
  pthread_join(log_thread, nullptr);
  log_on = false;
}
// "KEY=VALUE KEY2=VALUE2": each word with an '=' set in the environment
static void set_env_words(const char* words) {
  const std::string text = words;
  for (size_t at = 0; at < text.size();) {
    size_t end = text.find(' ', at);
    if (end == std::string::npos) end = text.size();
    const std::string w = text.substr(at, end - at);
    at = end + 1;
    const size_t eq = w.find('=');
    if (eq != std::string::npos && eq > 0) setenv(w.substr(0, eq).c_str(), w.substr(eq + 1).c_str(), 1);
  }
}
#endif

#ifdef __ANDROID__

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

// The activity through JNI (SDL keeps it): whether the app is debuggable (ApplicationInfo.FLAG_DEBUGGABLE), a string extra of its intent
static bool debuggable() {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  jobject act = (jobject)SDL_GetAndroidActivity();
  if (!env || !act) return false;
  jobject info = env->CallObjectMethod(act, env->GetMethodID(env->GetObjectClass(act), "getApplicationInfo", "()Landroid/content/pm/ApplicationInfo;"));
  const jint flags = info ? env->GetIntField(info, env->GetFieldID(env->GetObjectClass(info), "flags", "I")) : 0;
  env->DeleteLocalRef(act);
  return (flags & 2) != 0;   // FLAG_DEBUGGABLE
}
static std::string intent_extra(const char* key) {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  jobject act = (jobject)SDL_GetAndroidActivity();
  std::string out;
  if (!env || !act) return out;
  jobject intent = env->CallObjectMethod(act, env->GetMethodID(env->GetObjectClass(act), "getIntent", "()Landroid/content/Intent;"));
  if (intent) {
    jstring k = env->NewStringUTF(key);
    jstring v = (jstring)env->CallObjectMethod(intent, env->GetMethodID(env->GetObjectClass(intent), "getStringExtra", "(Ljava/lang/String;)Ljava/lang/String;"), k);
    if (v) { const char* s = env->GetStringUTFChars(v, nullptr); out = s; env->ReleaseStringUTFChars(v, s); }
  }
  env->DeleteLocalRef(act);
  return out;
}
static void android_setup() {
  log_to_system();
  const char* files = SDL_GetAndroidInternalStoragePath();
  const char* cache = SDL_GetAndroidCachePath();
  if (files) {
    setenv("HOME", files, 1);
    setenv("ZINC_HOME", (std::string(files) + "/zinc").c_str(), 0);
    chdir(files);
    copy_assets(files);
  }
  if (cache) setenv("TMPDIR", cache, 0);
  // An app has no environment: a debuggable build takes the Zinc variables a desktop run takes from its shell from the project (zinc.json "dev",
  // baked by zinc export as ZN_APP_DEV_ENV) and from the launch, `adb shell am start -n <id>/.<Activity> --es zinc.env "ZINC_PERF_HUD=1 ZINC_PROFILE=1"`.
  // A release build takes neither. zinc.json targets.android (fullscreen, kiosk) is baked as ZN_APP_ENV for every build, before them.
#ifdef ZN_APP_ENV
  set_env_words(ZN_APP_ENV);
#endif
  if (debuggable()) {
#ifdef ZN_APP_DEV_ENV
    set_env_words(ZN_APP_DEV_ENV);
#endif
    set_env_words(intent_extra("zinc.env").c_str());
  }
}
#elif defined(ZN_PHONE)
// iOS: the bundle is read-only (SDL makes it the working directory) and holds the project's assets/; the program's files (zinc.storage, what it
// writes by relative paths) go to Library/Application Support/zinc, which becomes the working directory as the files directory does on
// Android, with assets/ there a link to the bundle's. The environment: what Xcode's scheme or `xcrun simctl launch` (SIMCTL_CHILD_*) gives,
// zinc.json "dev" (ZN_APP_DEV_ENV) in a Debug build, and targets.ios (ZN_APP_ENV) for every build, first.
static void ios_setup() {
  if (!isatty(1)) log_to_system();   // a terminal (`simctl launch --console-pty`, Xcode's console) keeps the output as it is
  const char* base = SDL_GetBasePath();
  if (char* pref = SDL_GetPrefPath("", "zinc")) {
    const std::string dir = pref, assets = std::string(base ? base : "") + "assets";
    SDL_free(pref);
    setenv("ZINC_HOME", dir.c_str(), 0);
    chdir(dir.c_str());
    struct stat st;
    if (base && stat(assets.c_str(), &st) == 0) {
      unlink("assets");   // the bundle moves at each install: the link is made again at each start
      symlink(assets.c_str(), "assets");
      setenv("ZINC_ASSETS", assets.c_str(), 1);
    }
  }
#ifdef ZN_APP_ENV
  set_env_words(ZN_APP_ENV);
#endif
#if defined(ZN_APP_DEV_ENV) && !defined(NDEBUG)
  set_env_words(ZN_APP_DEV_ENV);
#endif
}
#endif

#ifdef ZN_PHONE
static void phone_setup() {
#ifdef __ANDROID__
  android_setup();
#else
  ios_setup();
#endif
  // SDL keeps the screen on for every app (FLAG_KEEP_SCREEN_ON on Android, idleTimerDisabled on iOS, unless SDL_HINT_VIDEO_ALLOW_SCREENSAVER):
  // a phone app lets it sleep, as a web page does; a program keeps it on with navigator.wakeLock (zinc:sys "wakelock"), a kiosk always. A
  // kiosk also keeps Android's back button (the desktop's kiosk ignores the quit shortcuts); Home still leaves.
  const char* kv = getenv("ZINC_KIOSK");
  const bool kiosk = kv && kv[0] == '1';
  SDL_SetHint(SDL_HINT_VIDEO_ALLOW_SCREENSAVER, kiosk ? "0" : "1");
  if (kiosk) SDL_SetHint(SDL_HINT_ANDROID_TRAP_BACK_BUTTON, "1");
  // The heap of the runtime (one region, targets/common/hal_posix.cpp): the program's need, at most a quarter of the device's memory. The
  // desktop's 512 MiB cannot be had on a 1 GB device (a 32-bit process, ~400 MB free on the Nexus 7 2012); iOS ends an app that grows
  // past its share (jetsam).
  if (!getenv("ZINC_HEAP")) {
    long mb = kAppHeapMb, cap = SDL_GetSystemRAM() / 4;
    if (cap > 16 && mb > cap) mb = cap;
    setenv("ZINC_HEAP", std::to_string(mb << 20).c_str(), 1);
  }
}
#endif

static bool paused;

SDL_AppResult SDL_AppInit(void**, int argc, char** argv) {
#ifdef ZN_PHONE
  phone_setup();
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
#ifdef __ANDROID__
  if (e->type == SDL_EVENT_QUIT) return SDL_APP_SUCCESS;   // the activity is being destroyed: neither a kiosk nor a close handler can refuse
#endif
  zn_app_event(e);
  return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void*, SDL_AppResult) {
  zn_app_quit();
#ifdef ZN_PHONE
  log_drain();
#endif
}
