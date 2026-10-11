// zinc:midi for macos and linux: RtMidi (vendor/RtMidi.h) behind a table of handles. No platform call of our own: RtMidi talks to CoreMIDI and
// ALSA, receives on its own thread and queues the messages; read() takes them from that queue on the program's thread.
#define ZRT_HOSTED_CPP   // zrt.h takes <new> from the standard library, which RtMidi includes too
#include "zinc_native_midi.h"
#include "../vendor/RtMidi.h"
#include <stdio.h>
#include <string.h>
#include <string>
#include <vector>

namespace {
const int MAXPORT = 64;
const unsigned QUEUE = 4096;   // messages kept between two read()s: a clock at 300 BPM is 120 a second, a fader sweep a few hundred
struct Port { RtMidiIn* in = nullptr; RtMidiOut* out = nullptr; };
Port opened[MAXPORT];
RtMidiIn* lister_in;     // unopened, to list the ports
RtMidiOut* lister_out;
char err_msg[300];
bool failed;             // set by RtMidi's error callback during a call (it would throw without one)

zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
void on_error(RtMidiError::Type type, const std::string& text, void*) {
  if (type == RtMidiError::WARNING || type == RtMidiError::DEBUG_WARNING) return;
  snprintf(err_msg, sizeof err_msg, "%s", text.c_str());
  failed = true;
}
// A new RtMidi object, or null with err_msg set (no MIDI system on this machine: no ALSA sequencer, the MIDI server refused).
template <class T> T* make() {
  failed = false;
  T* m = nullptr;
  try { m = new T(RtMidi::UNSPECIFIED, "Zinc"); } catch (RtMidiError& e) { snprintf(err_msg, sizeof err_msg, "%s", e.getMessage().c_str()); return nullptr; }
  m->setErrorCallback(on_error);
  return m;
}
template <> RtMidiIn* make<RtMidiIn>() {
  failed = false;
  RtMidiIn* m = nullptr;
  try { m = new RtMidiIn(RtMidi::UNSPECIFIED, "Zinc", QUEUE); } catch (RtMidiError& e) { snprintf(err_msg, sizeof err_msg, "%s", e.getMessage().c_str()); return nullptr; }
  m->setErrorCallback(on_error);
  m->ignoreTypes(false, false, true);   // system exclusive and clock are delivered; active sensing (a byte every 300 ms) is not
  return m;
}
// The port number of a name now ('' = the first port), or -1.
int find(RtMidi* m, const std::string& name) {
  unsigned n = m->getPortCount();
  for (unsigned i = 0; i < n; i++) if (name.empty() || m->getPortName(i) == name) return (int)i;
  return -1;
}
}  // namespace

struct HostMidi : NativeMidi {
  zrt::String ports(bool input) override {
    std::string all;
    RtMidi* m = input ? (RtMidi*)(lister_in ? lister_in : (lister_in = make<RtMidiIn>())) : (RtMidi*)(lister_out ? lister_out : (lister_out = make<RtMidiOut>()));
    if (!m) return str(all);
    unsigned n = m->getPortCount();
    for (unsigned i = 0; i < n; i++) { all += m->getPortName(i); all += '\n'; }
    return str(all);
  }
  int32_t open(bool input, zrt::String nameIn, bool virtualPort) override {
    std::string name(nameIn.ptr(), nameIn.bytes());
    int32_t h = 0;
    while (h < MAXPORT && (opened[h].in || opened[h].out)) h++;
    if (h == MAXPORT) { snprintf(err_msg, sizeof err_msg, "too many MIDI ports open (64)"); return -1; }
    RtMidi* m = input ? (RtMidi*)make<RtMidiIn>() : (RtMidi*)make<RtMidiOut>();
    if (!m) return -1;
    if (virtualPort) m->openVirtualPort(name);
    else {
      int at = find(m, name);
      if (at < 0) { failed = true; snprintf(err_msg, sizeof err_msg, name.empty() ? "no MIDI %s port%s" : "no MIDI %s port named '%s'", input ? "input" : "output", name.c_str()); }
      else m->openPort((unsigned)at, input ? "Zinc in" : "Zinc out");
    }
    if (failed) { if (input) delete (RtMidiIn*)m; else delete (RtMidiOut*)m; return -1; }   // RtMidi's own destructor is protected
    if (input) opened[h].in = (RtMidiIn*)m; else opened[h].out = (RtMidiOut*)m;
    return h;
  }
  zrt::String error() override { return str(err_msg); }
  zrt::Array<uint8_t> read(int32_t h) override {
    std::vector<unsigned char> msg;
    if (h >= 0 && h < MAXPORT && opened[h].in) opened[h].in->getMessage(&msg);
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap((int32_t)msg.size());
    if (!msg.empty()) memcpy(r.a->data, msg.data(), msg.size());
    r.a->len = (int32_t)msg.size();
    return r;
  }
  bool send(int32_t h, zrt::Array<uint8_t> bytes) override {
    if (h < 0 || h >= MAXPORT || !opened[h].out || bytes.length() <= 0) return false;
    failed = false;
    opened[h].out->sendMessage((const unsigned char*)bytes.a->data, (size_t)bytes.length());
    return !failed;
  }
  void close(int32_t h) override {
    if (h < 0 || h >= MAXPORT) return;
    delete opened[h].in; delete opened[h].out;   // closes the port, removes a virtual one
    opened[h].in = nullptr; opened[h].out = nullptr;
  }
};

NativeMidi* zinc_create_Midi() {
  static HostMidi inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
