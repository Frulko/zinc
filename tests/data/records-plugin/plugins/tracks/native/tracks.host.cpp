// The fixture of native records (ZN-850): the generated structs of tracks.spec.ts, encoded on a worker thread for the promise (std types only,
// no zrt there), and on the program's thread for the rest.
#include "zinc_native_tracks.h"
#include <pthread.h>
#include <unistd.h>

namespace {
Track make(int i) {
  Track t;
  t.title = "track " + std::to_string(i);
  t.ms = 1000.5 * i;
  t.plays = 4000000000u + i;
  t.fav = i % 2 == 1;
  if (i % 2 == 0) t.art = Art{64 * (i + 1), 48};
  t.tags = {"a" + std::to_string(i), "b"};
  t.cover = {uint8_t(i), 255};
  if (i == 1) t.note = "é ok";
  return t;
}
std::vector<Track> many(int n) { std::vector<Track> v; for (int i = 0; i < n; ++i) v.push_back(make(i)); return v; }

// a promise settled from the loop with bytes a thread made
struct Job { int n; std::vector<uint8_t> out; bool done = false; };
pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
void* work(void* p) {
  Job* j = static_cast<Job*>(p);
  std::vector<uint8_t> bytes = zn::rec::encode(many(j->n));   // the worker: std types only
  usleep(10000);
  pthread_mutex_lock(&mu); j->out = std::move(bytes); j->done = true; pthread_mutex_unlock(&mu);
  return nullptr;
}
}  // namespace

struct HostTracks : NativeTracks, zrt::Poller {
  Job* job = nullptr;
  zrt::Promise<zrt::Array<uint8_t>> pending;
  zrt::Array<uint8_t> first() override { return zn::rec::array(zn::rec::encode(make(0))); }
  zrt::Array<uint8_t> list(int32_t n) override { return zn::rec::array(zn::rec::encode(many(n))); }
  zrt::Promise<zrt::Array<uint8_t>> later(int32_t n) override {
    pending = zrt::Promise<zrt::Array<uint8_t>>::make_pending();
    job = new Job{n, {}};
    pthread_t t;
    pthread_create(&t, nullptr, work, job);
    pthread_detach(t);
    zrt::add_poller(this);
    return pending;
  }
  bool poll() override {
    if (!job) return false;
    pthread_mutex_lock(&mu);
    bool done = job->done;
    pthread_mutex_unlock(&mu);
    if (!done) return true;
    pending.p->resolve(zn::rec::array(job->out));   // the program's thread: the engine's array
    delete job;
    job = nullptr;
    return false;
  }
  zrt::String describe(zrt::Array<uint8_t> b) override {
    Track t;
    if (!zn::rec::read(b, t)) return zrt::String::from("bad", 3);
    std::string s = t.title + " " + std::to_string(int(t.ms)) + " " + std::to_string(t.plays) + (t.fav ? " fav" : " -") + (t.art ? " art " + std::to_string(t.art->w) : " no-art") +
                    " tags " + std::to_string(t.tags.size()) + " cover " + std::to_string(t.cover.size()) + (t.note ? " note " + *t.note : " no-note");
    return zrt::String::from(s.data(), uint32_t(s.size()));
  }
  zrt::Array<uint8_t> echo(zrt::Array<uint8_t> b) override {
    std::vector<Track> v;
    if (!zn::rec::read(b, v)) v.clear();
    for (Track& t : v) t.title += "!";
    return zn::rec::array(zn::rec::encode(v));
  }
  zrt::Array<uint8_t> newAsOld() override { return zn::rec::array(zn::rec::encode(New{7, "seven"})); }   // a newer writer: the spec reads Old
  zrt::Array<uint8_t> oldAsNew() override { return zn::rec::array(zn::rec::encode(Old{8})); }            // an older writer: the spec reads New
  int32_t readOld(zrt::Array<uint8_t> b) override { Old o; return zn::rec::read(b, o) ? o.id : -1; }    // the program wrote New
  zrt::String readNew(zrt::Array<uint8_t> b) override { New n; if (!zn::rec::read(b, n)) return zrt::String::from("bad", 3); std::string s = std::to_string(n.id) + " [" + n.label + "]"; return zrt::String::from(s.data(), uint32_t(s.size())); }
};

NativeTracks* zinc_create_Tracks() { static HostTracks m; m.rc = zrt::IMMORTAL; return &m; }
