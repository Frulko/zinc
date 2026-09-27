#include "zrt.h"
#include "mod/telemetry.h"
#include "mod/sock.h"
#include <stdio.h>
#include <stdlib.h>
#ifndef ZRT_PLATFORM
#define ZRT_PLATFORM "unknown"
#endif

namespace zrt { namespace telemetry {
static int mode = -1;  // -1 not initialised, 0 off, 1 udp, 2 stdout, 3 file
static int fd = -1;
static sockaddr_in dst;
static FILE* out = nullptr;
static uint32_t seq = 0;
struct Exposed { String name; Fn<double()> get; };
static Exposed exposed[64];
static int nexposed = 0;
static double last_snap = 0, last_frame = 0;

static void line(StrBuilder& b) {
  if (mode == 1) sendto(fd, b.buf, b.len, 0, (sockaddr*)&dst, sizeof dst);
  else if (mode >= 2) { b.ch('\n'); fwrite(b.buf, 1, b.len, out); fflush(out); }
}
static void head(StrBuilder& b, const char* type) {
  b.cstr("{\"type\":\""); b.cstr(type); b.cstr("\",\"ts\":"); str_num(b, now_ms()); b.cstr(",\"seq\":"); to_s(b, (int64_t)seq++); b.cstr(",\"payload\":");
}
static void snapshot() {
  if (!nexposed) return;
  StrBuilder b; head(b, "state_snapshot"); b.cstr("{\"vars\":{");
  for (int i = 0; i < nexposed; i++) { if (i) b.ch(','); json_str(b, exposed[i].name); b.ch(':'); json(b, exposed[i].get()); }
  b.cstr("}}}"); line(b);
}
static void on_frame() {
  double t = now_ms();
  StrBuilder b; head(b, "perf_frame");
  b.cstr("{\"fps\":"); str_num(b, last_frame > 0 ? (double)(int64_t)(10000.0 / (t - last_frame)) / 10.0 : 0);
  b.cstr(",\"frame_ms\":"); str_num(b, (double)stats.frame_us / 1000.0);
  b.cstr(",\"draw_cmds\":"); to_s(b, stats.draw_cmds);
  b.cstr(",\"live_objects\":"); to_s(b, live_objects);
  b.cstr(",\"allocs\":"); to_s(b, alloc_count); b.cstr("}}");
  last_frame = t;
  line(b);
  if (t - last_snap >= 100) { last_snap = t; snapshot(); }
}
static void on_log(int level, const char* s, uint32_t n) {
  static const char* names[] = {"log", "info", "debug", "warn", "error", "trace"};
  StrBuilder b; head(b, "log"); b.cstr("{\"level\":\""); b.cstr(names[level]); b.cstr("\",\"message\":");
  json_str(b, String::from(s, n)); b.cstr("}}"); line(b);
}
struct Sampler : Poller { bool poll() override { double t = now_ms(); if (t - last_snap >= 100) { last_snap = t; snapshot(); } return false; } };
static void drop() { for (int i = 0; i < nexposed; i++) { exposed[i].get = nullptr; exposed[i].name = String(); } nexposed = 0; }
static void open(const char* target) {
  mode = 0;
  at_finish(drop);
  if (!target || !*target) return;
  if (!strncmp(target, "udp://", 6)) {
    char host[256]; strncpy(host, target + 6, sizeof host - 1); host[sizeof host - 1] = 0;
    char* colon = strrchr(host, ':'); int port = colon ? atoi(colon + 1) : 9999; if (colon) *colon = 0;
    if (!sock::resolve(host, port, &dst)) return;
    fd = sock::udp_bind(0); mode = 1;
  } else if (!strcmp(target, "stdout")) { out = stdout; mode = 2; }
  else if (!strncmp(target, "file:", 5)) { out = fopen(target + 5, "ab"); mode = out ? 3 : 0; }
  if (!mode) return;
  telemetry_frame = on_frame;
  telemetry_log = on_log;
  add_poller(new (alloc(sizeof(Sampler))) Sampler());
  StrBuilder b; head(b, "hello"); b.cstr("{\"version\":\"0.1\",\"platform\":\"" ZRT_PLATFORM "\",\"features\":[\"perf\",\"logs\",\"state\",\"metrics\"]}}");
  line(b);
}
static bool ensure() { if (mode < 0) open(getenv("ZINC_TELEMETRY")); return mode > 0; }
void connect(const String& target) { sock::CStr t(target); if (mode > 0) return; open(t.c()); }
bool enabled() { return ensure(); }
static void metric(const char* kind, const String& name, double v) {
  if (!ensure()) return;
  StrBuilder b; head(b, "metric"); b.cstr("{\"kind\":\""); b.cstr(kind); b.cstr("\",\"name\":"); json_str(b, name); b.cstr(",\"value\":"); json(b, v); b.cstr("}}");
  line(b);
}
void counter(const String& name, double delta) { metric("counter", name, delta); }
void gauge(const String& name, double value) { metric("gauge", name, value); }
void event(const String& name, const String& data) {
  if (!ensure()) return;
  StrBuilder b; head(b, "event"); b.cstr("{\"name\":"); json_str(b, name); b.cstr(",\"data\":"); json_str(b, data); b.cstr("}}");
  line(b);
}
void expose(const String& name, Fn<double()> get) {
  ensure();
  if (nexposed < 64) { exposed[nexposed].name = name; exposed[nexposed].get = get; nexposed++; }
}
}}
