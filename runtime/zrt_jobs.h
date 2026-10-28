// zrt/jobs — blocking native work off the main thread, settled as promises on the event loop.
// The pattern every plugin with slow I/O wrote by hand (a pthread, a job queue, a done queue, a Poller, a table of
// pending promises), once:
//
//   zrt::Jobs jobs;                                   // one worker; jobs run one after the other, in order
//   zrt::Promise<zrt::Array<uint8_t>> tracks() override {   // a spec member returning Promise<Track[]> (native records)
//     return jobs.run<zrt::Array<uint8_t>, std::vector<uint8_t>>(
//       [](std::string& err) { std::vector<Track> v = /* the library */; return zn::rec::encode(v); },   // worker thread
//       [](std::vector<uint8_t>& b) { return zn::rec::array(b); });                                         // main thread
//   }
//   jobs.post([n] { if (onProgress) onProgress(n); });  // from the worker: runs on the main thread
//
// Rules: `work` runs on the worker and touches nothing of the Zinc heap (std types, malloc, the library); it reports a
// failure by filling `err` (the promise rejects with it). `finish` and posted functions run on the main thread, inside
// the loop; they capture std types only (they cross the thread boundary). Include it only where threads exist.
// Deterministic runs (ZINC_DETERMINISTIC, ZINC_RECORD, ZINC_REPLAY: docs/guide/06-testing.md) wait at each poll for the jobs
// in flight, so a job started in one turn of the loop settles in the next whatever the machine's load: the frame a result
// shows in is the same on every run.
#pragma once
#include <condition_variable>
#include <cstdlib>
#include <deque>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "zrt.h"   // after a generated header, which must come first

namespace zrt {

class Jobs : public Poller {
 public:
  ~Jobs() override { stop(); }

  /** Runs `work` on the worker, then `finish` with its result on the main thread, which resolves the promise. */
  template<class T, class V> Promise<T> run(std::function<V(std::string&)> work, std::function<T(V&)> finish) {
    if (!registered_) { add_poller(this); registered_ = true; }
    Promise<T> pr = Promise<T>::make_pending();
    uint64_t id = ++seq_;
    Ref<PromiseObj<T>> p = pr.p;
    settle_[id] = [p, finish](void* v, const std::string& err) mutable {
      if (!v) { p->reject(make<Error>(String::from(err.data(), static_cast<uint32_t>(err.size())))); return; }
      p->resolve(finish(*static_cast<V*>(v)));
    };
    enqueue([id, work = std::move(work)](Out& o) {
      o.id = id;
      V* v = new V(work(o.err));
      if (o.err.empty()) { o.v = v; o.del = [](void* x) { delete static_cast<V*>(x); }; } else delete v;
    });
    return pr;
  }
  /** From the worker: `f` runs on the main thread at the next poll. */
  void post(std::function<void()> f) {
    std::lock_guard<std::mutex> l(mu_);
    done_.push_back(Out{0, nullptr, nullptr, {}, std::move(f)});
  }
  bool busy() const { return !settle_.empty(); }

  bool poll() override {
    std::deque<Out> d;
    {
      std::unique_lock<std::mutex> l(mu_);
      if (deterministic()) idle_.wait(l, [this] { return running_ == 0; });
      d.swap(done_);
    }
    for (Out& o : d) {
      if (o.post) { o.post(); check_uncaught(); continue; }
      auto it = settle_.find(o.id);
      if (it != settle_.end()) { auto f = std::move(it->second); settle_.erase(it); f(o.v, o.err.empty() ? std::string("failed") : o.err); }
      if (o.v) o.del(o.v);
    }
    return !settle_.empty() || !d.empty();   // a finished job may have queued another
  }
  void shutdown() override { stop(); settle_.clear(); }

 private:
  static bool deterministic() {
    static const bool on = [] {
      const char* d = std::getenv("ZINC_DETERMINISTIC");
      return (d && *d && *d != '0') || std::getenv("ZINC_RECORD") || std::getenv("ZINC_REPLAY");
    }();
    return on;
  }
  struct Out { uint64_t id = 0; void* v = nullptr; void (*del)(void*) = nullptr; std::string err; std::function<void()> post; };
  void enqueue(std::function<void(Out&)> job) {
    std::lock_guard<std::mutex> l(mu_);
    if (!thread_.joinable()) thread_ = std::thread([this] { loop(); });
    jobs_.push_back(std::move(job));
    running_++;
    cv_.notify_one();
  }
  void loop() {
    for (;;) {
      std::function<void(Out&)> job;
      {
        std::unique_lock<std::mutex> l(mu_);
        cv_.wait(l, [this] { return quit_ || !jobs_.empty(); });
        if (quit_) return;
        job = std::move(jobs_.front());
        jobs_.pop_front();
      }
      Out o;
      job(o);
      std::lock_guard<std::mutex> l(mu_);
      done_.push_back(std::move(o));
      running_--;
      idle_.notify_all();
    }
  }
  void stop() {
    { std::lock_guard<std::mutex> l(mu_); quit_ = true; cv_.notify_one(); }
    if (thread_.joinable()) thread_.join();
  }

  std::mutex mu_;
  std::condition_variable cv_, idle_;
  std::thread thread_;
  int running_ = 0;   // jobs queued or running (under mu_)
  bool quit_ = false, registered_ = false;
  std::deque<std::function<void(Out&)>> jobs_;
  std::deque<Out> done_;
  std::unordered_map<uint64_t, std::function<void(void*, const std::string&)>> settle_;   // main thread only
  uint64_t seq_ = 0;
};

}  // namespace zrt
