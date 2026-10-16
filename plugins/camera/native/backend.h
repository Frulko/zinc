#pragma once
// The capture backend of a platform: camera.macos.mm (AVFoundation, also iOS through camera.ios.mm), camera.linux.cpp (V4L2, also the
// Raspberry Pi's), camera.android.cpp (the NDK's camera2). Each defines
// CAM_BACKEND and includes camera.host.cpp, which alone has no camera but the fake one. Frames are 0x00RRGGBB pixels (BGRX in memory), the
// format of zinc:gfx runtime images; the backend fills them on its own thread, the host takes the newest on the program's.
#include <stdint.h>

struct CamDevice { char id[256]; char name[256]; const char* position; };   // position: "front" "back" "external" "unknown"

/** 0 undetermined, 1 granted, 2 denied. `ask` shows the system's question when undetermined (answered later). */
int cam_backend_permission(bool ask);
/** Fills up to `max` devices, returns how many. */
int cam_backend_list(CamDevice* out, int max);
/** Opens the camera `id` near w x h at fps; a backend handle >= 0 and the format it delivers, or -1 and the reason in `err`. */
int cam_backend_open(const char* id, int w, int h, int fps, int* ow, int* oh, double* ofps, char* err, int n);
/** 1 running, 0 still starting (a backend may start the camera off the program's thread), -1 failed: the reason in `err`. */
int cam_backend_state(int b, char* err, int n);
/** Copies the newest frame into px (w * h pixels, the format of open) when its sequence number is not `*seq`; true when copied. */
bool cam_backend_take(int b, uint32_t* px, int w, int h, uint32_t* seq);
void cam_backend_close(int b);
