// zinc:telemetry — JSON lines (hello, perf_frame, log, metric, state_snapshot) to UDP, stdout or a file.
// Zero cost when not imported; `zinc monitor` shows the stream live.
#pragma once
namespace zrt { namespace telemetry {
void connect(const String& target);
void counter(const String& name, double delta);
void gauge(const String& name, double value);
void event(const String& name, const String& data);
void expose(const String& name, Fn<double()> get);
bool enabled();
}}
