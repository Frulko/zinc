#pragma once
// What the phone glue of a plugin (zinc native-gen --android, ZN-628, docs/plugins.md "Phones") calls in the engine: JNI helpers implemented in
// src/app/android_glue.cpp, so each generated bridge stays a list of calls. Strings cross as UTF-16 (JNI's "modified UTF-8" mangles emoji).
// Plain C types only: the bridges include zrt.h, whose placement new the standard containers would redefine.
#ifdef __ANDROID__
#include <jni.h>
#include <stddef.h>
#include <stdint.h>

// A program's function a Java ZincCallback calls (dev.zinc.app.ZincCallback.call(Object...)): `args` holds the values in the order of the spec.
struct ZnJavaCallback {
  virtual void call(JNIEnv* env, jobjectArray args) = 0;
  virtual ~ZnJavaCallback() = default;
};

JNIEnv* zn_jni_env();                                                // the program thread's (SDL attached it)
jobject zn_jni_new(JNIEnv* env, const char* className);             // a global reference to a new instance (constructor without parameters); null and a log line when it fails
jobject zn_jni_callback(JNIEnv* env, ZnJavaCallback* cb);           // a ZincCallback (a local reference) that calls `cb`
int zn_jni_drain(JNIEnv* env);                                       // the ZincCallback calls Java queued from any thread, made now (the program's thread); how many
void zn_jni_check(JNIEnv* env, const char* what);                    // a pending Java exception is logged and cleared, so the program goes on
jstring zn_jni_string(JNIEnv* env, const char* utf8, size_t n);      // a local reference
char* zn_jni_utf8(JNIEnv* env, jstring s, size_t* n);                // malloc'd, NUL-terminated; free with zn_jni_free
void zn_jni_free(char* p);
int32_t zn_jni_arg_int(JNIEnv* env, jobjectArray args, int i);       // a java.lang.Number or Boolean of a ZincCallback's arguments
double zn_jni_arg_double(JNIEnv* env, jobjectArray args, int i);
bool zn_jni_arg_bool(JNIEnv* env, jobjectArray args, int i);
#endif
