// zinc:mapping on Android: the host's compositor, with media files on layers through ZincMappingMedia.java (MediaPlayer and SurfaceTexture, so a
// video needs neither a copy nor libmediandk, which Android 4.4 does not have). All of it runs on the GL thread, in draw().
#include <jni.h>
#include <stdint.h>
#include <stdio.h>
#include <SDL3/SDL_system.h>
#include "zgl.h"

#define ZN_MAPPING_MEDIA 1

struct MediaFrame { bool ready, image; int32_t w, h; float scaleS, scaleT, offsetS, offsetT; };
struct MediaHandle { jobject media; };

namespace {
jclass mediaClass;
jmethodID mediaNew, mediaUpdate, mediaVolume, mediaLooping, mediaRelease;
jfloatArray updateResult;

// The class by the activity's loader: on a native thread, FindClass sees the system's classes only.
bool loadMediaClass(JNIEnv* env) {
  if (mediaClass) return true;
  jobject activity = (jobject)SDL_GetAndroidActivity();
  jclass activityClass = env->GetObjectClass(activity);
  jobject loader = env->CallObjectMethod(activity, env->GetMethodID(activityClass, "getClassLoader", "()Ljava/lang/ClassLoader;"));
  jclass loaderClass = env->GetObjectClass(loader);
  jstring name = env->NewStringUTF("dev.zinc.mapping.ZincMappingMedia");
  jobject found = env->CallObjectMethod(loader, env->GetMethodID(loaderClass, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;"), name);
  if (env->ExceptionCheck()) { env->ExceptionClear(); fprintf(stderr, "mapping: ZincMappingMedia is not in the package\n"); return false; }
  mediaClass = (jclass)env->NewGlobalRef(found);
  mediaNew = env->GetMethodID(mediaClass, "<init>", "(ILjava/lang/String;ZF)V");
  mediaUpdate = env->GetMethodID(mediaClass, "update", "([F)V");
  mediaVolume = env->GetMethodID(mediaClass, "setVolume", "(F)V");
  mediaLooping = env->GetMethodID(mediaClass, "setLooping", "(Z)V");
  mediaRelease = env->GetMethodID(mediaClass, "release", "()V");
  updateResult = (jfloatArray)env->NewGlobalRef(env->NewFloatArray(8));
  env->DeleteLocalRef(activity);
  return true;
}
}  // namespace

static MediaHandle* media_open(GLuint texture, const char* path, bool loop, float volume) {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  if (!env || !loadMediaClass(env)) return nullptr;
  jstring javaPath = env->NewStringUTF(path);
  jobject media = env->NewObject(mediaClass, mediaNew, (jint)texture, javaPath, (jboolean)loop, (jfloat)volume);
  env->DeleteLocalRef(javaPath);
  if (env->ExceptionCheck()) { env->ExceptionClear(); return nullptr; }
  MediaHandle* handle = new MediaHandle{env->NewGlobalRef(media)};
  env->DeleteLocalRef(media);
  return handle;
}
static void media_update(MediaHandle* handle, MediaFrame* frame) {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  env->CallVoidMethod(handle->media, mediaUpdate, updateResult);
  if (env->ExceptionCheck()) { env->ExceptionClear(); frame->ready = false; return; }
  jfloat r[8];
  env->GetFloatArrayRegion(updateResult, 0, 8, r);
  *frame = MediaFrame{r[0] > 0, r[3] > 0, (int32_t)r[1], (int32_t)r[2], r[4], r[5], r[6], r[7]};
}
static void media_set(MediaHandle* handle, float volume, bool loop) {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  env->CallVoidMethod(handle->media, mediaVolume, (jfloat)volume);
  env->CallVoidMethod(handle->media, mediaLooping, (jboolean)loop);
}
// Writes a small picture of a video on its own thread: the show goes on (ZincMappingMedia.writeThumbnail).
static void media_thumbnail(const char* path, const char* out) {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  if (!env || !loadMediaClass(env)) return;
  jstring javaPath = env->NewStringUTF(path), javaOut = env->NewStringUTF(out);
  env->CallStaticVoidMethod(mediaClass, env->GetStaticMethodID(mediaClass, "writeThumbnail", "(Ljava/lang/String;Ljava/lang/String;)V"), javaPath, javaOut);
  if (env->ExceptionCheck()) env->ExceptionClear();
  env->DeleteLocalRef(javaPath);
  env->DeleteLocalRef(javaOut);
}
static void media_close(MediaHandle* handle) {
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  env->CallVoidMethod(handle->media, mediaRelease);
  env->DeleteGlobalRef(handle->media);
  delete handle;
}

#include "mapping.host.cpp"
