// zinc:microphone for macos, linux and ios: capture devices of miniaudio (Core Audio, PulseAudio, ALSA; the copy of plugins/audio/vendor),
// each filling a buffer on miniaudio's thread that read() empties on the program's thread, and the fake microphone.
// The fake microphone ("Zinc Fake Microphone"): a triangle wave whose loudness steps every 20 ms block, plus a little noise, a function of
// the sample index only (sample(), written again in microphone.sim.ts), one block per read() call. It is the only microphone with
// ZINC_FAKE_MICROPHONE=1 (or plugins.microphone.fake) and in a deterministic run (ZINC_DETERMINISTIC, unless ZINC_FAKE_MICROPHONE=0 or
// ZINC_REALTIME), and the one devices() gives when the machine has none.
// Privacy: a real device is only opened once access is granted (mic_permission, microphone.macos.mm on macOS), so a program never stops
// on a question it did not ask; a background run (ZINC_BACKGROUND) never asks.
#define ZRT_HOSTED_CPP
#include "zinc_native_microphone.h"
#include "../../audio/vendor/miniaudio.h"
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

#ifndef ZP_MICROPHONE_FAKE
#define ZP_MICROPHONE_FAKE 0
#endif

#ifndef MIC_PERMISSION   // no privacy question on this platform (Linux: the audio group): granted
int mic_permission(bool) { return 1; }
#endif

namespace {
const char FS = '\x1f', RS = '\x1e';
const char* FAKE_ID = "zinc:fake-microphone";
const char* FAKE_NAME = "Zinc Fake Microphone";
const int POLL_MS = 20;

struct Mic {
  bool used = false, fake = false, started = false;
  int rate = 0, ch = 0;
  long long n = 0;   // fake: the next sample frame
  double lvl = 0;
  ma_device dev;
  pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
  std::vector<float> pending;   // captured, not read yet (at most one second)
};
Mic* mics[16];
std::string err;
ma_context ctx;
bool ctxOk = false, ctxTried = false;

const char* env(const char* k) { const char* v = getenv(k); return v ? v : ""; }
bool no_fake() { return !strcmp(env("ZINC_FAKE_MICROPHONE"), "0"); }
bool fake_only() {
  if (no_fake()) return false;
  if (*env("ZINC_FAKE_MICROPHONE")) return true;
  return ZP_MICROPHONE_FAKE || (*env("ZINC_DETERMINISTIC") && !*env("ZINC_REALTIME"));
}
bool refused() {
  char why[512];
  if (!zn_host_permission || !zn_host_permission("microphone", "microphone", why, sizeof why)) return false;
  err = std::string("microphone: ") + why;
  return true;
}
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
Mic* at(int32_t h) { return h >= 0 && h < 16 && mics[h] ? mics[h] : nullptr; }
zrt::Array<double> nums(const double* v, int32_t n) {
  zrt::Array<double> r = zrt::Array<double>::with_cap(n);
  if (n > 0) memcpy(r.a->data, v, sizeof(double) * n);
  r.a->len = n;
  return r;
}

// Sample frame `n` of the fake microphone at `rate`: a triangle of period 100 samples, its amplitude 0.05 to 0.5 by 20 ms block, and noise
// of +-0.01 from an LCG of n. Integers and one rounding to float, so microphone.sim.ts makes the same samples.
float sample(long long n, int rate) {
  const long long block = n / (rate / 50);
  const int t = (int)(n % 100), tri = t < 50 ? t : 100 - t;
  const uint32_t x = (uint32_t)n * 1103515245u + 12345u;
  const double noise = (double)((x >> 16) & 0x7fff) / 32768.0 - 0.5;
  return (float)((double)(block % 10 + 1) / 20.0 * ((double)tri / 25.0 - 1.0) + noise * 0.02);
}

ma_context* context() {
  if (!ctxTried) {
    ctxTried = true;
    ma_context_config cc = ma_context_config_init();
#ifdef MIC_IOS_SESSION   // iOS: the audio session of a call (microphone.ios.mm)
    cc.coreaudio.sessionCategory = ma_ios_session_category_play_and_record;
    cc.coreaudio.sessionCategoryOptions = ma_ios_session_category_option_default_to_speaker | ma_ios_session_category_option_allow_bluetooth;
#endif
    ctxOk = ma_context_init(nullptr, 0, &cc, &ctx) == MA_SUCCESS;
  }
  return ctxOk ? &ctx : nullptr;
}
// A device's id as text: the backend's own name for it (Core Audio's UID, PulseAudio's and ALSA's names), else its place in the list.
std::string id_of(const ma_device_info& d, int i) {
  switch (ctx.backend) {
    case ma_backend_coreaudio: return d.id.coreaudio;
    case ma_backend_pulseaudio: return d.id.pulse;
    case ma_backend_alsa: return d.id.alsa;
    default: return "device:" + std::to_string(i);
  }
}
void on_input(ma_device* d, void*, const void* in, ma_uint32 frames) {
  Mic* m = (Mic*)d->pUserData;
  const float* s = (const float*)in;
  const size_t n = (size_t)frames * m->ch, cap = (size_t)m->rate * m->ch;
  pthread_mutex_lock(&m->mu);
  m->pending.insert(m->pending.end(), s, s + n);
  if (m->pending.size() > cap) m->pending.erase(m->pending.begin(), m->pending.begin() + (m->pending.size() - cap));   // a program that stops reading loses the oldest
  pthread_mutex_unlock(&m->mu);
}
}  // namespace

struct HostMicrophone : NativeMicrophone {
  int32_t permission(bool ask) override {
    err.clear();
    if (refused()) return 2;
    if (fake_only()) return 1;
    const char* bg = getenv("ZINC_BACKGROUND");
    const bool quiet = bg && *bg && strcmp(bg, "0");   // a background run never brings up the system's question
    const int s = mic_permission(ask && !quiet);
    return s == 0 && ask && quiet ? 3 : s;
  }
  zrt::String devices() override {
    err.clear();
    if (refused()) return str("");
    std::string out;
    if (!fake_only() && context()) {
      ma_device_info* infos = nullptr;
      ma_uint32 count = 0;
      if (ma_context_get_devices(&ctx, nullptr, nullptr, &infos, &count) == MA_SUCCESS)
        for (ma_uint32 i = 0; i < count; i++) out += id_of(infos[i], (int)i) + FS + infos[i].name + RS;
    }
    if (out.empty() && !no_fake()) out = std::string(FAKE_ID) + FS + FAKE_NAME + RS;
    return str(out);
  }
  zrt::String error() override { return str(err); }
  int32_t open(zrt::String idIn, int32_t rate, int32_t ch) override {
    err.clear();
    if (refused()) return -1;
    std::string dev = cstr(idIn);
    rate = rate <= 0 ? 48000 : rate < 8000 ? 8000 : rate > 192000 ? 192000 : rate;
    ch = ch <= 0 ? 1 : ch > 2 ? 2 : ch;
    int32_t slot = 0;
    while (slot < 16 && mics[slot]) slot++;
    if (slot == 16) { err = "microphone: too many microphones open (16)"; return -1; }
    if (dev.empty()) {   // the first microphone devices() lists
      std::string all = cstr(devices());
      if (!err.empty()) return -1;
      if (all.empty()) { err = "microphone: no microphone on this machine"; return -1; }
      dev = all.substr(0, all.find(FS));
    }
    Mic* m = new Mic();
    m->rate = rate; m->ch = ch;
    if (dev == FAKE_ID && !no_fake()) m->fake = true;
    else if (fake_only()) { delete m; err = "microphone: no microphone '" + dev + "' (only the fake microphone '" + FAKE_ID + "' with ZINC_FAKE_MICROPHONE or in a deterministic run)"; return -1; }
    else {
      switch (mic_permission(false)) {
        case 1: break;
        case 0: delete m; err = "microphone: access to the microphone was not asked yet: call requestPermission() first"; return -1;
        default: delete m; err = "microphone: access to the microphone is denied to this app (System Settings > Privacy & Security > Microphone)"; return -1;
      }
      ma_device_info* infos = nullptr;
      ma_uint32 count = 0;
      const ma_device_id* pick = nullptr;
      if (context() && ma_context_get_devices(&ctx, nullptr, nullptr, &infos, &count) == MA_SUCCESS)
        for (ma_uint32 i = 0; i < count && !pick; i++) if (id_of(infos[i], (int)i) == dev) pick = &infos[i].id;
      if (!pick) { delete m; err = "microphone: no microphone '" + dev + "' (devices() lists them)"; return -1; }
      ma_device_config c = ma_device_config_init(ma_device_type_capture);
      c.capture.pDeviceID = pick;
      c.capture.format = ma_format_f32;
      c.capture.channels = (ma_uint32)ch;
      c.sampleRate = (ma_uint32)rate;
      c.dataCallback = on_input;
      c.pUserData = m;
      if (ma_device_init(&ctx, &c, &m->dev) != MA_SUCCESS) { delete m; err = "microphone: '" + dev + "' cannot be opened"; return -1; }
      if (ma_device_start(&m->dev) != MA_SUCCESS) { ma_device_uninit(&m->dev); delete m; err = "microphone: '" + dev + "' does not start (in use?)"; return -1; }
      m->started = true;
    }
    m->used = true;
    mics[slot] = m;
    return slot;
  }
  zrt::Array<double> format(int32_t h) override {
    Mic* m = at(h);
    double v[3] = {0, 0, 0};
    if (m) { v[0] = m->rate; v[1] = m->ch; v[2] = POLL_MS; }
    return nums(v, 3);
  }
  zrt::Array<double> read(int32_t h) override {
    Mic* m = at(h);
    if (!m) return nums(nullptr, 0);
    std::vector<float> got;
    if (m->fake) {
      const int frames = m->rate / 50;
      got.resize((size_t)frames * m->ch);
      for (int f = 0; f < frames; f++, m->n++) for (int c = 0; c < m->ch; c++) got[(size_t)f * m->ch + c] = sample(m->n, m->rate);
    } else {
      pthread_mutex_lock(&m->mu);
      got.swap(m->pending);
      pthread_mutex_unlock(&m->mu);
    }
    if (got.empty()) return nums(nullptr, 0);
    zrt::Array<double> r = zrt::Array<double>::with_cap((int32_t)got.size());
    double sum = 0;
    for (size_t i = 0; i < got.size(); i++) { const double s = got[i]; r.a->data[i] = s; sum += s * s; }
    r.a->len = (int32_t)got.size();
    m->lvl = sqrt(sum / (double)got.size());
    if (m->lvl > 1) m->lvl = 1;
    return r;
  }
  double level(int32_t h) override { Mic* m = at(h); return m ? m->lvl : 0; }
  void close(int32_t h) override {
    Mic* m = at(h);
    if (!m) return;
    if (m->started) ma_device_uninit(&m->dev);   // stops it and waits for the callback
    delete m;
    mics[h] = nullptr;
  }
};

NativeMicrophone* zinc_create_Microphone() {
  static HostMicrophone inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
