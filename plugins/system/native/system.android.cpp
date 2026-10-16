// zinc:system on Android (ZN-628): the live backend of system.host.cpp is the Java class dev.zinc.system.SystemBackend
// (native/android/SystemBackend.java: notifications, the share sheet, opening a URL, the document picker, deep links), reached through JNI on
// the program's thread. The op names and their JSON arguments cross as they are: the op table (ops.json) is the contract. Plain C here, as in
// system.host.cpp: zrt.h's placement new and the standard containers do not mix.
#include <jni.h>
#include <string.h>
#include <stdlib.h>

#include "app/mobile_bridge.h"

namespace {
jclass gCls = nullptr;
jmethodID gCall = nullptr, gPoll = nullptr, gPending = nullptr;

bool bind(JNIEnv* e) {
  if (gCls) return true;
  jclass c = e->FindClass("dev/zinc/system/SystemBackend");   // the program's thread is SDL's Java thread: the app's class loader
  if (!c) { zn_jni_check(e, "dev.zinc.system.SystemBackend"); return false; }
  gCls = static_cast<jclass>(e->NewGlobalRef(c));
  e->DeleteLocalRef(c);
  gCall = e->GetStaticMethodID(gCls, "call", "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;");
  gPoll = e->GetStaticMethodID(gCls, "poll", "()Ljava/lang/String;");
  gPending = e->GetStaticMethodID(gCls, "pending", "()Z");
  zn_jni_check(e, "SystemBackend's methods");
  return gCall && gPoll && gPending;
}

// a Java string into out (capacity cap); 0 for null
int copyOut(JNIEnv* e, jstring s, char* out, int cap) {
  if (!s) return 0;
  size_t n = 0;
  char* p = zn_jni_utf8(e, s, &n);
  e->DeleteLocalRef(s);
  if (!p) return 0;
  snprintf(out, static_cast<size_t>(cap), "%s", p);
  zn_jni_free(p);
  return 1;
}
}  // namespace

extern "C" {
const char* zn_sys_live_backend(void) { return "android"; }

int zn_sys_live_call(const char* op, const char* args, char* out, int cap) {
  JNIEnv* e = zn_jni_env();
  if (!e || !bind(e)) return 0;
  jstring jo = zn_jni_string(e, op, strlen(op)), ja = zn_jni_string(e, args, strlen(args));
  jstring r = static_cast<jstring>(e->CallStaticObjectMethod(gCls, gCall, jo, ja));
  zn_jni_check(e, op);
  e->DeleteLocalRef(jo);
  e->DeleteLocalRef(ja);
  return copyOut(e, r, out, cap);   // null: an op this backend does not do (the simulator's answer stands)
}

int zn_sys_live_poll(char* out, int cap) {
  JNIEnv* e = zn_jni_env();
  if (!e || !bind(e)) return 0;
  jstring r = static_cast<jstring>(e->CallStaticObjectMethod(gCls, gPoll));
  zn_jni_check(e, "SystemBackend.poll");
  return copyOut(e, r, out, cap);
}

int zn_sys_live_pump(void) {   // a picker is open: the loop waits for its answer
  JNIEnv* e = zn_jni_env();
  if (!e || !bind(e)) return 0;
  const jboolean p = e->CallStaticBooleanMethod(gCls, gPending);
  zn_jni_check(e, "SystemBackend.pending");
  return p ? 1 : 0;
}
}
