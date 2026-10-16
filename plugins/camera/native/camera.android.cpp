// zinc:camera on Android: the NDK's camera2 (ACameraManager, a repeating preview request) into an AImageReader of YUV_420_888, then the
// shared part (camera.host.cpp). The reader calls back on its own thread; the latest image is converted to the runtime image's pixels,
// turned upright by the sensor's orientation (front cameras also mirrored, so the preview looks like a mirror) and kept as the newest frame
// under a mutex. The CAMERA permission is read through JNI and asked through SDL3 (same libmain.so). Links camera2ndk, mediandk, android, log.
#define CAM_BACKEND 1
#include "backend.h"
#include <atomic>
#include <jni.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <SDL3/SDL_system.h>
#include <camera/NdkCameraCaptureSession.h>
#include <camera/NdkCameraDevice.h>
#include <camera/NdkCameraManager.h>
#include <camera/NdkCameraMetadata.h>
#include <camera/NdkCaptureRequest.h>
#include <media/NdkImage.h>
#include <media/NdkImageReader.h>

namespace {
const int MAXS = 8;
const char* const PERM = "android.permission.CAMERA";
struct Cam {
  bool used = false;
  volatile bool lost = false;          // disconnected or failed: the frames stop, the program keeps its last one
  int sw = 0, sh = 0, w = 0, h = 0;    // the stream's size (the sensor's way up), the delivered size (turned upright)
  long o0 = 0, sx = 0, sy = 0;         // where source pixel (x, y) lands: o0 + x * sx + y * sy
  uint32_t seq = 0;
  uint32_t* px = nullptr;              // the newest frame (under mu)
  uint32_t* tmp = nullptr;             // the conversion's target (under rmu)
  pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;    // px, seq
  pthread_mutex_t rmu = PTHREAD_MUTEX_INITIALIZER;   // reader: close waits for a callback in progress before deleting it
  AImageReader* reader = nullptr;
  ACameraDevice* dev = nullptr;
  ACaptureSessionOutputContainer* outs = nullptr;
  ACaptureSessionOutput* out = nullptr;
  ACameraOutputTarget* target = nullptr;
  ACaptureRequest* req = nullptr;
  ACameraCaptureSession* session = nullptr;
  ACameraDevice_StateCallbacks devcb = {};
  ACameraCaptureSession_stateCallbacks sescb = {};
  AImageReader_ImageListener listener = {};
};
Cam cams[MAXS];
std::atomic<int> asked{0};   // what SDL's request answered: 0 nothing, 1 granted, 2 denied, 3 waiting for the person

ACameraManager* manager() {   // one for the process, made on first use
  static pthread_once_t once = PTHREAD_ONCE_INIT;
  static ACameraManager* m = nullptr;
  pthread_once(&once, [] { m = ACameraManager_create(); });
  return m;
}

int granted_now() {   // activity.checkSelfPermission(CAMERA): 1 granted, 0 not (yet), -1 no activity to ask
  JNIEnv* env = (JNIEnv*)SDL_GetAndroidJNIEnv();
  jobject act = (jobject)SDL_GetAndroidActivity();
  if (!env || !act) return -1;
  int r = -1;
  jclass cls = env->GetObjectClass(act);
  jmethodID m = env->GetMethodID(cls, "checkSelfPermission", "(Ljava/lang/String;)I");
  if (m) {
    jstring p = env->NewStringUTF(PERM);
    r = env->CallIntMethod(act, m, p) == 0;   // PackageManager.PERMISSION_GRANTED
    env->DeleteLocalRef(p);
  }
  if (env->ExceptionCheck()) { env->ExceptionClear(); r = -1; }
  env->DeleteLocalRef(cls);
  env->DeleteLocalRef(act);
  return r;
}
void SDLCALL answered(void*, const char*, bool granted) { asked = granted ? 1 : 2; }

inline uint8_t clamp8(int v) { return (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v); }
inline uint32_t rgb(int y, int u, int v) {   // BT.601, integers
  const int c = (y - 16) * 298;
  return (uint32_t)clamp8((c + 409 * v + 128) >> 8) << 16 | (uint32_t)clamp8((c - 100 * u - 208 * v + 128) >> 8) << 8 | clamp8((c + 516 * u + 128) >> 8);
}

// The index in the delivered frame of source pixel (x, y): turned clockwise by `rot` (the sensor orientation is the clockwise turn that
// makes the image upright), then mirrored when `mirror`. Taken at three points it gives the linear form the conversion steps through.
long dst(int x, int y, int sw, int sh, int rot, bool mirror) {
  const int ow = rot == 90 || rot == 270 ? sh : sw;
  int dx = x, dy = y;
  if (rot == 90) { dx = sh - 1 - y; dy = x; }
  else if (rot == 180) { dx = sw - 1 - x; dy = sh - 1 - y; }
  else if (rot == 270) { dx = y; dy = sw - 1 - x; }
  if (mirror) dx = ow - 1 - dx;
  return (long)dy * ow + dx;
}

// YUV_420_888 is planar (I420) or semi-planar (NV12/NV21) depending on the device: the row and pixel strides of each plane cover all of them.
bool convert(Cam& d, AImage* img) {
  int32_t iw = 0, ih = 0;
  AImage_getWidth(img, &iw); AImage_getHeight(img, &ih);
  if (iw != d.sw || ih != d.sh) return false;
  uint8_t* p[3]; int len[3]; int32_t rs[3], ps[3];
  for (int i = 0; i < 3; i++) {
    if (AImage_getPlaneData(img, i, &p[i], &len[i]) != AMEDIA_OK || AImage_getPlaneRowStride(img, i, &rs[i]) != AMEDIA_OK ||
        AImage_getPlanePixelStride(img, i, &ps[i]) != AMEDIA_OK) return false;
    const int pw = i ? (d.sw + 1) / 2 : d.sw, ph = i ? (d.sh + 1) / 2 : d.sh;
    if ((long)(ph - 1) * rs[i] + (long)(pw - 1) * ps[i] + 1 > len[i]) return false;   // a short plane: skip the frame, never read past it
  }
  for (int y = 0; y < d.sh; y++) {
    const uint8_t* yr = p[0] + (long)y * rs[0];
    const uint8_t* ur = p[1] + (long)(y >> 1) * rs[1];
    const uint8_t* vr = p[2] + (long)(y >> 1) * rs[2];
    long o = d.o0 + y * d.sy;
    for (int x = 0; x < d.sw; x++, o += d.sx) d.tmp[o] = rgb(yr[x * ps[0]], ur[(x >> 1) * ps[1]] - 128, vr[(x >> 1) * ps[2]] - 128);
  }
  return true;
}

void on_image(void* ctx, AImageReader* r) {   // the reader's thread
  Cam& d = *(Cam*)ctx;
  pthread_mutex_lock(&d.rmu);
  if (d.reader != r) { pthread_mutex_unlock(&d.rmu); return; }   // closed meanwhile
  AImage* img = nullptr;
  if (AImageReader_acquireLatestImage(r, &img) == AMEDIA_OK && img) {
    if (!d.lost && convert(d, img)) {
      pthread_mutex_lock(&d.mu);
      memcpy(d.px, d.tmp, (size_t)d.w * d.h * 4);
      d.seq++;
      pthread_mutex_unlock(&d.mu);
    }
    AImage_delete(img);
  }
  pthread_mutex_unlock(&d.rmu);
}
void on_lost(void* ctx, ACameraDevice*) { ((Cam*)ctx)->lost = true; }   // another app took it, or it was unplugged
void on_error(void* ctx, ACameraDevice*, int) { ((Cam*)ctx)->lost = true; }
void on_session(void*, ACameraCaptureSession*) {}

void release(Cam& d) {
  if (d.session) { ACameraCaptureSession_stopRepeating(d.session); ACameraCaptureSession_close(d.session); }
  if (d.req) ACaptureRequest_free(d.req);
  if (d.target) ACameraOutputTarget_free(d.target);
  if (d.outs) ACaptureSessionOutputContainer_free(d.outs);
  if (d.out) ACaptureSessionOutput_free(d.out);
  if (d.dev) ACameraDevice_close(d.dev);
  pthread_mutex_lock(&d.rmu);   // a callback in progress ends first; later ones see no reader
  AImageReader* r = d.reader;
  d.reader = nullptr;
  pthread_mutex_unlock(&d.rmu);
  if (r) AImageReader_delete(r);
  free(d.px); free(d.tmp);
  d.px = d.tmp = nullptr;
  d.session = nullptr; d.req = nullptr; d.target = nullptr; d.outs = nullptr; d.out = nullptr; d.dev = nullptr;
  d.used = false; d.lost = false; d.sw = d.sh = d.w = d.h = 0;
}
int fail(Cam& d, char* err, int n, const char* msg, const char* id) { snprintf(err, n, msg, id); release(d); return -1; }
}  // namespace

int cam_backend_permission(bool ask) {
  const int g = granted_now();
  if (g == 1) return 1;
  int a = asked.load();
  if (a == 2) return 2;   // refused when asked: checkSelfPermission alone cannot tell it from never asked
  if (ask && g == 0 && a != 3 && asked.compare_exchange_strong(a, 3) && !SDL_RequestAndroidPermission(PERM, answered, nullptr)) asked = 0;
  return 0;
}

int cam_backend_list(CamDevice* out, int max) {
  ACameraManager* m = manager();
  ACameraIdList* ids = nullptr;
  if (!m || ACameraManager_getCameraIdList(m, &ids) != ACAMERA_OK || !ids) return 0;
  int n = 0, ext = 0;
  for (int i = 0; i < ids->numCameras && n < max; i++) {
    const char* id = ids->cameraIds[i];
    ACameraMetadata* md = nullptr;
    int facing = -1;
    if (ACameraManager_getCameraCharacteristics(m, id, &md) == ACAMERA_OK) {
      ACameraMetadata_const_entry e = {};
      if (ACameraMetadata_getConstEntry(md, ACAMERA_LENS_FACING, &e) == ACAMERA_OK && e.count) facing = e.data.u8[0];
      ACameraMetadata_free(md);
    }
    snprintf(out[n].id, sizeof out[n].id, "%s", id);
    if (facing == ACAMERA_LENS_FACING_FRONT) { out[n].position = "front"; snprintf(out[n].name, sizeof out[n].name, "Front camera (%s)", id); }
    else if (facing == ACAMERA_LENS_FACING_BACK) { out[n].position = "back"; snprintf(out[n].name, sizeof out[n].name, "Back camera (%s)", id); }
    else if (facing == ACAMERA_LENS_FACING_EXTERNAL) { out[n].position = "external"; snprintf(out[n].name, sizeof out[n].name, "External camera %d (%s)", ++ext, id); }
    else { out[n].position = "unknown"; snprintf(out[n].name, sizeof out[n].name, "Camera (%s)", id); }
    n++;
  }
  ACameraManager_deleteCameraIdList(ids);
  return n;
}

int cam_backend_open(const char* id, int w, int h, int fps, int* ow, int* oh, double* ofps, char* err, int n) {
  switch (cam_backend_permission(false)) {
    case 1: break;
    case 0: snprintf(err, n, "access to the camera was not asked yet: call requestPermission() first"); return -1;
    default: snprintf(err, n, "access to the camera is denied to this app (Settings > Apps > this app > Permissions > Camera)"); return -1;
  }
  ACameraManager* m = manager();
  if (!m) { snprintf(err, n, "the camera service is not available"); return -1; }
  int slot = 0;
  while (slot < MAXS && cams[slot].used) slot++;
  if (slot == MAXS) { snprintf(err, n, "too many cameras open"); return -1; }
  Cam& d = cams[slot];
  ACameraMetadata* md = nullptr;
  if (ACameraManager_getCameraCharacteristics(m, id, &md) != ACAMERA_OK || !md) { snprintf(err, n, "no camera '%s' (devices() lists them)", id); return -1; }
  // the smallest YUV output that covers the asked size (else the largest), so the frame is never scaled up
  ACameraMetadata_const_entry e = {};
  long best = -1, big = -1;
  int bw = 0, bh = 0, gw = 0, gh = 0;
  if (ACameraMetadata_getConstEntry(md, ACAMERA_SCALER_AVAILABLE_STREAM_CONFIGURATIONS, &e) == ACAMERA_OK)
    for (uint32_t i = 0; i + 3 < e.count; i += 4) {
      const int32_t* c = e.data.i32 + i;   // format, width, height, input
      if (c[0] != AIMAGE_FORMAT_YUV_420_888 || c[3] != ACAMERA_SCALER_AVAILABLE_STREAM_CONFIGURATIONS_OUTPUT) continue;
      const long a = (long)c[1] * c[2];
      if (c[1] >= w && c[2] >= h && (best < 0 || a < best)) { best = a; bw = c[1]; bh = c[2]; }
      if (a > big) { big = a; gw = c[1]; gh = c[2]; }
    }
  if (best < 0) { bw = gw; bh = gh; }
  // the AE frame-rate range nearest [fps, fps]; a camera without the list keeps its own rate
  int32_t range[2] = {0, 0};
  long rd = -1;
  if (ACameraMetadata_getConstEntry(md, ACAMERA_CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES, &e) == ACAMERA_OK)
    for (uint32_t i = 0; i + 1 < e.count; i += 2) {
      const int32_t lo = e.data.i32[i], hi = e.data.i32[i + 1];
      const long dd = labs((long)lo - fps) + labs((long)hi - fps);
      if (rd < 0 || dd < rd) { rd = dd; range[0] = lo; range[1] = hi; }
    }
  int rot = 0, facing = -1;
  if (ACameraMetadata_getConstEntry(md, ACAMERA_SENSOR_ORIENTATION, &e) == ACAMERA_OK && e.count) rot = ((e.data.i32[0] % 360) + 360) % 360 / 90 * 90;
  if (ACameraMetadata_getConstEntry(md, ACAMERA_LENS_FACING, &e) == ACAMERA_OK && e.count) facing = e.data.u8[0];
  ACameraMetadata_free(md);
  if (bw <= 1 || bh <= 1) { snprintf(err, n, "camera '%s' offers no YUV output", id); return -1; }

  d.used = true; d.lost = false; d.seq = 0;
  d.sw = bw; d.sh = bh;
  d.w = rot == 90 || rot == 270 ? bh : bw; d.h = rot == 90 || rot == 270 ? bw : bh;
  const bool mirror = facing == ACAMERA_LENS_FACING_FRONT;
  d.o0 = dst(0, 0, bw, bh, rot, mirror); d.sx = dst(1, 0, bw, bh, rot, mirror) - d.o0; d.sy = dst(0, 1, bw, bh, rot, mirror) - d.o0;
  d.px = (uint32_t*)calloc((size_t)d.w * d.h, 4);
  d.tmp = (uint32_t*)calloc((size_t)d.w * d.h, 4);
  if (!d.px || !d.tmp) return fail(d, err, n, "camera '%s': out of memory", id);

  AImageReader* r = nullptr;
  if (AImageReader_new(bw, bh, AIMAGE_FORMAT_YUV_420_888, 3, &r) != AMEDIA_OK || !r) return fail(d, err, n, "camera '%s': no image reader", id);
  pthread_mutex_lock(&d.rmu); d.reader = r; pthread_mutex_unlock(&d.rmu);
  d.listener = {&d, on_image};
  ANativeWindow* win = nullptr;
  if (AImageReader_setImageListener(r, &d.listener) != AMEDIA_OK || AImageReader_getWindow(r, &win) != AMEDIA_OK || !win)
    return fail(d, err, n, "camera '%s': no image reader", id);

  d.devcb = {&d, on_lost, on_error};
  switch (ACameraManager_openCamera(m, id, &d.devcb, &d.dev)) {
    case ACAMERA_OK: break;
    case ACAMERA_ERROR_PERMISSION_DENIED: return fail(d, err, n, "access to the camera is denied to this app (Settings > Apps > this app > Permissions > Camera)%s", "");
    case ACAMERA_ERROR_CAMERA_IN_USE: return fail(d, err, n, "camera '%s' is in use by another app", id);
    case ACAMERA_ERROR_MAX_CAMERA_IN_USE: return fail(d, err, n, "camera '%s': too many cameras are in use on this device", id);
    case ACAMERA_ERROR_CAMERA_DISABLED: return fail(d, err, n, "camera '%s' is disabled by a device policy", id);
    case ACAMERA_ERROR_INVALID_PARAMETER: return fail(d, err, n, "no camera '%s' (devices() lists them)", id);
    default: return fail(d, err, n, "camera '%s' could not be opened", id);
  }
  d.sescb = {&d, on_session, on_session, on_session};
  if (ACaptureSessionOutputContainer_create(&d.outs) != ACAMERA_OK || ACaptureSessionOutput_create(win, &d.out) != ACAMERA_OK ||
      ACaptureSessionOutputContainer_add(d.outs, d.out) != ACAMERA_OK || ACameraOutputTarget_create(win, &d.target) != ACAMERA_OK ||
      ACameraDevice_createCaptureRequest(d.dev, TEMPLATE_PREVIEW, &d.req) != ACAMERA_OK || ACaptureRequest_addTarget(d.req, d.target) != ACAMERA_OK)
    return fail(d, err, n, "camera '%s': the preview request could not be made", id);
  if (range[1] > 0) ACaptureRequest_setEntry_i32(d.req, ACAMERA_CONTROL_AE_TARGET_FPS_RANGE, 2, range);
  if (ACameraDevice_createCaptureSession(d.dev, d.outs, &d.sescb, &d.session) != ACAMERA_OK)
    return fail(d, err, n, "camera '%s': the capture session could not be made (in use by another app?)", id);
  if (ACameraCaptureSession_setRepeatingRequest(d.session, nullptr, 1, &d.req, nullptr) != ACAMERA_OK)
    return fail(d, err, n, "camera '%s': the preview could not be started", id);
  *ow = d.w; *oh = d.h;
  *ofps = range[1] > 0 ? range[1] : fps;
  return slot;
}

int cam_backend_state(int, char*, int) { return 1; }   // open() returns once the camera streams

bool cam_backend_take(int b, uint32_t* px, int w, int h, uint32_t* seq) {
  if (b < 0 || b >= MAXS || !cams[b].used) return false;
  Cam& d = cams[b];
  pthread_mutex_lock(&d.mu);
  const bool fresh = d.px && d.seq != *seq && d.w == w && d.h == h;
  if (fresh) { memcpy(px, d.px, (size_t)w * h * 4); *seq = d.seq; }
  pthread_mutex_unlock(&d.mu);
  return fresh;
}

void cam_backend_close(int b) {
  if (b < 0 || b >= MAXS || !cams[b].used) return;
  release(cams[b]);
}

#include "camera.host.cpp"
