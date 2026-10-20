// Two independent LeapC devices; SDK memory is invalidated on every poll.
#include <LeapC.h>
#include <cstring>
#include <cstdlib>
#include <cstdint>
static int step;
static bool sdkAlive = true;
static bool opened[2], subscribed[2];
struct SdkLifetime { ~SdkLifetime() { sdkAlive = false; } };
static LEAP_HAND hands[2];
static LEAP_TRACKING_EVENT tracking;
static LEAP_DEVICE_EVENT device;
static LEAP_VECTOR v(float x, float y, float z) { LEAP_VECTOR r{}; r.x = x; r.y = y; r.z = z; return r; }
static int slot(LEAP_DEVICE h) { return int(reinterpret_cast<uintptr_t>(h)) - 1; }
eLeapRS LEAP_CALL LeapCreateConnection(const LEAP_CONNECTION_CONFIG* config, LEAP_CONNECTION* out) {
  if (!config || !(config->flags & eLeapConnectionConfig_MultiDeviceAware)) std::abort();
  static SdkLifetime lifetime; (void)lifetime;
  step = 0; *out = reinterpret_cast<LEAP_CONNECTION>(&step); return eLeapRS_Success;
}
eLeapRS LEAP_CALL LeapOpenConnection(LEAP_CONNECTION) { return eLeapRS_Success; }
void LEAP_CALL LeapCloseConnection(LEAP_CONNECTION) {
  if (!sdkAlive || opened[0] || opened[1] || subscribed[0] || subscribed[1]) std::abort();
}
void LEAP_CALL LeapDestroyConnection(LEAP_CONNECTION) {}
eLeapRS LEAP_CALL LeapOpenDevice(LEAP_DEVICE_REF ref, LEAP_DEVICE* out) {
  int i = int(ref.id) - 10; if (i < 0 || i > 1 || opened[i]) std::abort();
  opened[i] = true; *out = reinterpret_cast<LEAP_DEVICE>(uintptr_t(i + 1)); return eLeapRS_Success;
}
void LEAP_CALL LeapCloseDevice(LEAP_DEVICE h) { const int i = slot(h); if (subscribed[i]) std::abort(); opened[i] = false; }
eLeapRS LEAP_CALL LeapSubscribeEvents(LEAP_CONNECTION, LEAP_DEVICE h) { subscribed[slot(h)] = true; return eLeapRS_Success; }
eLeapRS LEAP_CALL LeapUnsubscribeEvents(LEAP_CONNECTION, LEAP_DEVICE h) { subscribed[slot(h)] = false; return eLeapRS_Success; }
eLeapRS LEAP_CALL LeapGetDeviceInfo(LEAP_DEVICE h, LEAP_DEVICE_INFO* info) {
  std::strcpy(info->serial, slot(h) == 0 ? "TEST-A" : "TEST-B"); return eLeapRS_Success;
}
static void frame(LEAP_CONNECTION_MESSAGE* event, int source, int count, int id) {
  if (!subscribed[source]) std::abort();
  for (int i = 0; i < count; ++i) {
    // IDs deliberately overlap across devices.
    hands[i].id = 40 + i; hands[i].type = i ? eLeapHandType_Right : eLeapHandType_Left;
    hands[i].pinch_strength = 0.9f; hands[i].grab_strength = 0.3f;
    hands[i].palm.position = v(100.0f + i + source * 200, 200, 30);
    hands[i].arm.next_joint = v(90, 180, 25);
    for (int f = 0; f < 5; ++f) {
      hands[i].digits[f].is_extended = f == 1 || f == 2;
      for (int b = 0; b < 4; ++b) {
        hands[i].digits[f].bones[b].prev_joint = v(float(f * 10 + b), 150, 0);
        hands[i].digits[f].bones[b].next_joint = v(float(f * 10 + b + 1), 170, 1);
      }
    }
  }
  tracking = {}; tracking.tracking_frame_id = id; tracking.framerate = 90; tracking.nHands = count; tracking.pHands = hands;
  event->type = eLeapEventType_Tracking; event->tracking_event = &tracking; event->device_id = 10 + source;
}
eLeapRS LEAP_CALL LeapPollConnection(LEAP_CONNECTION, uint32_t timeout, LEAP_CONNECTION_MESSAGE* event) {
  if (timeout != 0) std::abort();
  std::memset(hands, 0, sizeof(hands)); std::memset(event, 0, sizeof(*event));
  const int n = step++;
  if (n == 0) { event->type = eLeapEventType_Connection; return eLeapRS_Success; }
  if (n == 1 || n == 2 || n == 3) {
    device = {}; device.device.id = n == 2 ? 11 : 10; event->device_event = &device; event->type = eLeapEventType_Device;
    return eLeapRS_Success; // Includes duplicate discovery of A; event.device_id remains zero.
  }
  if (n == 4 || n == 5) { frame(event, n - 4, 2, 123); return eLeapRS_Success; }
  if (std::getenv("LEAP_TEST_STALE")) {
    if (n == 7) { frame(event, 1, 2, 124); return eLeapRS_Success; } // B fresh, A alone expires.
    return eLeapRS_Timeout;
  }
  if (n == 8) { frame(event, 0, 0, 124); return eLeapRS_Success; }
  if (n == 10) { device.device.id = 10; event->type = eLeapEventType_DeviceLost; event->device_event = &device; return eLeapRS_Success; }
  if (n == 12) { event->type = eLeapEventType_ConnectionLost; return eLeapRS_Success; }
  return eLeapRS_Timeout;
}
