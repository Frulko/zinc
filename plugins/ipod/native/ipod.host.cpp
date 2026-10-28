// zinc:ipod for macOS/Linux: the calls of ipod.spec.ts as jobs of one worker thread (runtime/zrt_jobs.h) that owns the
// open database (ipod_core.cpp). Arguments are copied to std types on the program's thread, results are encoded as
// records on the worker and become the engine's arrays back on the loop; progress is posted to the loop.
#include "ipod_core.h"   // first: it brings the generated header
#include "zrt_jobs.h"

namespace {

using Bytes = zrt::Array<uint8_t>;

std::string str(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
zrt::String zs(const std::string& s) { return zrt::String::from(s.data(), static_cast<uint32_t>(s.size())); }
std::vector<std::string> strs(const zrt::Array<zrt::String>& a) {
  std::vector<std::string> v;
  for (int32_t i = 0; a.a && i < a.a->len; i++) v.push_back(str(a.a->data[i]));
  return v;
}

ipod::Library lib;   // the worker's only

struct HostIpod : NativeIpod {
  zrt::Jobs jobs;
  zrt::Fn<void(zrt::String, int32_t, int32_t, zrt::String)> cb;

  /** A job whose result is a record (or a list of them): encoded on the worker. */
  template<class V> zrt::Promise<Bytes> rec(std::function<V(std::string&)> work) {
    return jobs.run<Bytes, std::vector<uint8_t>>([work](std::string& err) { return zn::rec::encode(work(err)); },
                                                 [](std::vector<uint8_t>& b) { return zn::rec::array(b); });
  }
  /** A job that only succeeds or fails. */
  zrt::Promise<zrt::Unit> unit(std::function<bool(std::string&)> work) {
    return jobs.run<zrt::Unit, bool>([work](std::string& err) { return work(err); }, [](bool&) { return zrt::Unit{}; });
  }
  zrt::Promise<zrt::String> text(std::function<std::string(std::string&)> work) {
    return jobs.run<zrt::String, std::string>(work, [](std::string& s) { return zs(s); });
  }
  /** Progress from the worker, delivered on the loop. */
  ipod::Progress progress() {
    return [this](const std::string& phase, int32_t done, int32_t total, const std::string& detail) {
      jobs.post([this, phase, done, total, detail] { if (cb) { auto f = cb; f(zs(phase), done, total, zs(detail)); } });
    };
  }
  static bool need(std::string& err) { if (lib.isOpen()) return true; err = "no iPod is open"; return false; }

  zrt::Promise<Bytes> detect() override { return rec<std::vector<Device>>([](std::string&) { return ipod::detect(); }); }
  zrt::Promise<Bytes> open(zrt::String mountpoint, bool init, zrt::String model, zrt::String name) override {
    std::string mp = str(mountpoint), mo = str(model), nm = str(name);
    return rec<Device>([=](std::string& err) { Device d; if (lib.open(mp, init, mo, nm, err)) lib.device(d, err); return d; });
  }
  zrt::Promise<Bytes> info() override { return rec<Device>([](std::string& err) { Device d; lib.device(d, err); return d; }); }
  zrt::Promise<zrt::Unit> close() override { return unit([](std::string&) { lib.close(); return true; }); }
  zrt::Promise<Bytes> tracks() override { return rec<std::vector<Track>>([](std::string& err) { need(err); return lib.tracks(); }); }
  zrt::Promise<Bytes> playlists() override { return rec<std::vector<Playlist>>([](std::string& err) { need(err); return lib.playlists(); }); }
  zrt::Promise<Bytes> add(Bytes items, zrt::String playlist) override {
    std::vector<TrackInput> in;
    zn::rec::read(items, in);
    std::string pl = str(playlist);
    ipod::Progress p = progress();
    return rec<std::vector<AddResult>>([in, pl, p](std::string& err) { return lib.add(in, pl, p, err); });
  }
  zrt::Promise<Bytes> update(zrt::String id, Bytes fields) override {
    TrackInput in;
    zn::rec::read(fields, in);
    std::string i = str(id);
    return rec<Track>([i, in](std::string& err) { Track t; lib.update(i, in, t, err); return t; });
  }
  zrt::Promise<zrt::Unit> remove(zrt::Array<zrt::String> ids) override { auto v = strs(ids); return unit([v](std::string& err) { return lib.remove(v, err); }); }
  zrt::Promise<zrt::Unit> setArtwork(zrt::String id, zrt::String image) override {
    std::string i = str(id), f = str(image);
    return unit([i, f](std::string& err) { return lib.setArtwork(i, f, err); });
  }
  zrt::Promise<bool> saveArtwork(zrt::String id, zrt::String png) override {
    std::string i = str(id), f = str(png);
    return jobs.run<bool, bool>([i, f](std::string& err) { bool had = false; lib.saveArtwork(i, f, had, err); return had; }, [](bool& b) { return b; });
  }
  zrt::Promise<zrt::String> createPlaylist(zrt::String name) override {
    std::string n = str(name);
    return text([n](std::string& err) { std::string id; lib.createPlaylist(n, id, err); return id; });
  }
  zrt::Promise<zrt::Unit> renamePlaylist(zrt::String id, zrt::String name) override {
    std::string i = str(id), n = str(name);
    return unit([i, n](std::string& err) { return lib.renamePlaylist(i, n, err); });
  }
  zrt::Promise<zrt::Unit> deletePlaylist(zrt::String id) override { std::string i = str(id); return unit([i](std::string& err) { return lib.deletePlaylist(i, err); }); }
  zrt::Promise<zrt::Unit> setPlaylistTracks(zrt::String id, zrt::Array<zrt::String> ids) override {
    std::string i = str(id);
    auto v = strs(ids);
    return unit([i, v](std::string& err) { return lib.setPlaylistTracks(i, v, err); });
  }
  zrt::Promise<zrt::Unit> save() override { ipod::Progress p = progress(); return unit([p](std::string& err) { return lib.save(p, err); }); }
  zrt::Promise<Bytes> snapshots() override { return rec<std::vector<Snapshot>>([](std::string& err) { need(err); return lib.snapshots(); }); }
  zrt::Promise<zrt::Unit> restoreSnapshot(zrt::String id) override {
    std::string i = str(id);
    ipod::Progress p = progress();
    return unit([i, p](std::string& err) { return lib.restoreSnapshot(i, p, err); });
  }
  zrt::Promise<zrt::String> backup(zrt::String dir, bool music) override {
    std::string d = str(dir);
    ipod::Progress p = progress();
    return text([d, music, p](std::string& err) { std::string folder; lib.backup(d, music, folder, p, err); return folder; });
  }
  zrt::Promise<Bytes> restoreBackup(zrt::String folder, zrt::String mountpoint) override {
    std::string f = str(folder), mp = str(mountpoint);
    ipod::Progress p = progress();
    return rec<Device>([f, mp, p](std::string& err) {
      Device d;
      std::string kept;
      if (lib.isOpen() && lib.mountpoint() == mp && !lib.backup("", false, kept, p, err)) return d;   // what is replaced is backed up first
      lib.close();
      if (ipod::restoreBackup(f, mp, p, err) && lib.open(mp, false, "", "", err)) lib.device(d, err);
      return d;
    });
  }
  zrt::Promise<Bytes> specs() override { return rec<std::vector<SpecItem>>([](std::string& err) { need(err); return lib.specs(); }); }
  zrt::Promise<Bytes> artwork(zrt::String id, int32_t size) override {
    std::string i = str(id);
    return rec<Picture>([i, size](std::string& err) { Picture pic; lib.artwork(i, size, pic, err); return pic; });
  }
  zrt::Promise<Bytes> backups(zrt::String dir) override { std::string d = str(dir); return rec<std::vector<Backup>>([d](std::string&) { return ipod::backups(d); }); }
  zrt::Promise<Bytes> check() override { return rec<Check>([](std::string& err) { need(err); return lib.check(); }); }
  zrt::Promise<Bytes> repair() override { ipod::Progress p = progress(); return rec<Check>([p](std::string& err) { Check c; lib.repair(c, p, err); return c; }); }
  zrt::Promise<zrt::Unit> eject(zrt::String mountpoint) override {
    std::string mp = str(mountpoint);
    return unit([mp](std::string& err) { if (lib.mountpoint() == mp) lib.close(); return ipod::eject(mp, err); });
  }
  void onProgress(zrt::Fn<void(zrt::String, int32_t, int32_t, zrt::String)> f) override { cb = f; }
};

}  // namespace

NativeIpod* zinc_create_Ipod() {
  static HostIpod m;
  m.rc = zrt::IMMORTAL;
  return &m;
}
