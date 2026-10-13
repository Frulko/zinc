// LeapC test double: SDK-owned hand memory is invalidated by the next poll.
#include <LeapC.h>
#include <cstring>
#include <cstdlib>
static int step;
static bool sdkAlive = true;
struct SdkLifetime { ~SdkLifetime() { sdkAlive = false; } };
static LEAP_HAND hands[2];
static LEAP_TRACKING_EVENT tracking;
static LEAP_VECTOR v(float x, float y, float z) { LEAP_VECTOR r{}; r.x = x; r.y = y; r.z = z; return r; }
eLeapRS LEAP_CALL LeapCreateConnection(const LEAP_CONNECTION_CONFIG*, LEAP_CONNECTION* out) {
  static SdkLifetime lifetime;
  (void)lifetime;
  step = 0; *out = reinterpret_cast<LEAP_CONNECTION>(&step); return eLeapRS_Success;
}
eLeapRS LEAP_CALL LeapOpenConnection(LEAP_CONNECTION) { return eLeapRS_Success; }
void LEAP_CALL LeapCloseConnection(LEAP_CONNECTION) { if (!sdkAlive) std::abort(); }
void LEAP_CALL LeapDestroyConnection(LEAP_CONNECTION) {}
eLeapRS LEAP_CALL LeapPollConnection(LEAP_CONNECTION, uint32_t timeout, LEAP_CONNECTION_MESSAGE* event) {
  if (timeout != 0) std::abort();
  std::memset(hands, 0, sizeof(hands));
  std::memset(event, 0, sizeof(*event));
  const int n = step++;
  if (n == 0) { event->type = eLeapEventType_Connection; return eLeapRS_Success; }
  if (n == 1) {
    for (int i = 0; i < 2; ++i) {
      hands[i].id = 40 + i; hands[i].type = i ? eLeapHandType_Right : eLeapHandType_Left;
      hands[i].pinch_strength = 0.9f; hands[i].grab_strength = 0.3f;
      hands[i].palm.position = v(100.0f + i, 200.0f, 30.0f);
      hands[i].arm.next_joint = v(90.0f, 180.0f, 25.0f);
      for (int f = 0; f < 5; ++f) for (int b = 0; b < 4; ++b) {
        hands[i].digits[f].bones[b].prev_joint = v(float(f * 10 + b), 150.0f, 0.0f);
        hands[i].digits[f].bones[b].next_joint = v(float(f * 10 + b + 1), 170.0f, 1.0f);
      }
    }
    tracking = {}; tracking.tracking_frame_id = 123; tracking.framerate = 90; tracking.nHands = 2; tracking.pHands = hands;
    event->type = eLeapEventType_Tracking; event->tracking_event = &tracking;
    return eLeapRS_Success;
  }
  if (std::getenv("LEAP_TEST_STALE")) return eLeapRS_Timeout;
  if (n == 4) { tracking.tracking_frame_id++; tracking.nHands = 0; event->type = eLeapEventType_Tracking; event->tracking_event = &tracking; return eLeapRS_Success; }
  if (n == 6) { event->type = eLeapEventType_ConnectionLost; return eLeapRS_Success; }
  return eLeapRS_Timeout;
}
