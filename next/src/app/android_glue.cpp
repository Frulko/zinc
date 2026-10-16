// The Android side of the system signals and commands (docs/ui.md "System signals", docs/targets/android.md): the JNI entries of the activity of
// `zinc export --target android` (src/app/android/java/dev/zinc/app/ZincActivity.java) and the program's zinc:sys device() commands that it does
// (haptics, the status bar, the system's back, the text input connection). Compiled into zn_app for Android only; the shell calls
// zn_mobile_glue_init (src/app/shell_sdl.cpp) so the linker keeps this file. Strings cross as UTF-16 (JNI's "modified UTF-8" mangles emoji).
// Unproven on a device (written 2026-10-16 without one): next/backlog/later.md, cross-platform pass.
#ifdef __ANDROID__
#include <jni.h>
#include <string>

extern "C" void zn_hal_signal(const char* line);                                  // src/host/hal_dispatch.cpp
extern "C" const char* (*zn_mobile_command)(const char* q, const char* a);         // src/host/hal_dispatch.cpp, read by sys_host.cpp
extern "C" void* SDL_GetAndroidJNIEnv(void);                                         // SDL3 (SDL_system.h), without its headers here

namespace {
jclass activity = nullptr;    // dev.zinc.app.ZincActivity
jmethodID commandFn = nullptr;

std::string utf8(JNIEnv* env, jstring s) {
  std::string out;
  if (!s) return out;
  const jsize n = env->GetStringLength(s);
  const jchar* u = env->GetStringChars(s, nullptr);
  for (jsize i = 0; i < n; ++i) {
    unsigned c = u[i];
    if (c >= 0xD800 && c < 0xDC00 && i + 1 < n && u[i + 1] >= 0xDC00 && u[i + 1] < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (u[i + 1] - 0xDC00); ++i; }
    if (c < 0x80) out += static_cast<char>(c);
    else if (c < 0x800) { out += static_cast<char>(0xC0 | c >> 6); out += static_cast<char>(0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { out += static_cast<char>(0xE0 | c >> 12); out += static_cast<char>(0x80 | (c >> 6 & 0x3F)); out += static_cast<char>(0x80 | (c & 0x3F)); }
    else { out += static_cast<char>(0xF0 | c >> 18); out += static_cast<char>(0x80 | (c >> 12 & 0x3F)); out += static_cast<char>(0x80 | (c >> 6 & 0x3F)); out += static_cast<char>(0x80 | (c & 0x3F)); }
  }
  env->ReleaseStringChars(s, u);
  return out;
}
jstring utf16(JNIEnv* env, const char* s) {
  std::u16string w;
  const unsigned char* p = reinterpret_cast<const unsigned char*>(s);
  while (*p) {
    unsigned c = *p, n = 0;
    if (c < 0x80) n = 0; else if (c >> 5 == 6) { c &= 0x1F; n = 1; } else if (c >> 4 == 14) { c &= 0x0F; n = 2; } else { c &= 0x07; n = 3; }
    ++p;
    for (unsigned k = 0; k < n && (*p & 0xC0) == 0x80; ++k, ++p) c = c << 6 | (*p & 0x3F);
    if (c >= 0x10000) { c -= 0x10000; w += static_cast<char16_t>(0xD800 + (c >> 10)); w += static_cast<char16_t>(0xDC00 + (c & 0x3FF)); }
    else w += static_cast<char16_t>(c);
  }
  return env->NewString(reinterpret_cast<const jchar*>(w.data()), static_cast<jsize>(w.size()));
}
// zinc:sys device(q, a) on the program's thread: ZincActivity.zincCommand posts the work to the UI thread and answers at once
const char* command(const char* q, const char* a) {
  static std::string answer;
  JNIEnv* env = static_cast<JNIEnv*>(SDL_GetAndroidJNIEnv());
  if (!env || !activity || !commandFn) return "0";
  jstring jq = utf16(env, q), ja = utf16(env, a);
  jstring r = static_cast<jstring>(env->CallStaticObjectMethod(activity, commandFn, jq, ja));
  if (env->ExceptionCheck()) { env->ExceptionClear(); r = nullptr; }
  answer = r ? utf8(env, r) : "0";
  env->DeleteLocalRef(jq); env->DeleteLocalRef(ja);
  if (r) env->DeleteLocalRef(r);
  return answer.c_str();
}
}  // namespace

extern "C" {
void zn_mobile_glue_init(void) {}   // referenced by the shell: keeps this object (and its JNI entries) in libmain.so
JNIEXPORT void JNICALL Java_dev_zinc_app_ZincActivity_nativeInit(JNIEnv* env, jclass cls) {
  if (!activity) activity = static_cast<jclass>(env->NewGlobalRef(cls));
  commandFn = env->GetStaticMethodID(activity, "zincCommand", "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;");
  zn_mobile_command = command;
}
JNIEXPORT void JNICALL Java_dev_zinc_app_ZincActivity_nativeSignal(JNIEnv* env, jclass, jstring line) { zn_hal_signal(utf8(env, line).c_str()); }
}
#endif
