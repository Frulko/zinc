// zinc:ipod core: the iPod operations over libgpod, in plain C++ (std types only), so they run on the worker thread
// and can be tested without the engine (tests/native/ipod_core_test.cpp). Every function returns false (or empty) and
// fills `err` on failure; none of them throws.
#pragma once

// The records are the structs zinc generates from ipod.spec.ts (the spec is their one definition); this header comes
// first in a file, as a generated header must.
#include "zinc_native_ipod.h"
#include <functional>

namespace ipod {

using ::AddResult; using ::Check; using ::Device; using ::Playlist; using ::Snapshot; using ::Track; using ::TrackInput;

/** phase, done, total, detail */
using Progress = std::function<void(const std::string&, int32_t, int32_t, const std::string&)>;

std::vector<Device> detect();
/** What the volume at `mountpoint` is, without opening its database. */
bool describe(const std::string& mountpoint, Device& out, std::string& err);

/** Builds iPod_Control/Device/SysInfoExtended when missing: read from the iPod over USB (vendor request 0x40), else a
 *  minimal plist from SysInfo, the model table and the USB serial (the FireWire GUID). True when the file exists after. */
bool ensureSysInfoExtended(const std::string& mountpoint, std::string& err);
/** The plist of a minimal SysInfoExtended (what libgpod reads from it); `artwork` holds its AlbumArt,
 *  ImageSpecifications and ChapterImageSpecs keys (libgpod's table for the model, see ipod_sysinfo.c). */
std::string sysInfoExtendedPlist(const std::string& serial, const std::string& firewireGuid, const std::string& modelNumber, int familyId, const std::string& artwork);

/** The one open database (the worker owns it). */
class Library {
 public:
  ~Library();
  bool open(const std::string& mountpoint, bool init, const std::string& model, const std::string& name, std::string& err);
  void close();
  bool isOpen() const { return db_ != nullptr; }
  const std::string& mountpoint() const { return mp_; }
  bool device(Device& out, std::string& err);
  std::vector<Track> tracks();
  std::vector<Playlist> playlists();
  std::vector<AddResult> add(const std::vector<TrackInput>& items, const std::string& playlist, const Progress& progress, std::string& err);
  bool update(const std::string& id, const TrackInput& in, Track& out, std::string& err);
  bool remove(const std::vector<std::string>& ids, std::string& err);
  bool setArtwork(const std::string& id, const std::string& image, std::string& err);
  bool saveArtwork(const std::string& id, const std::string& png, bool& had, std::string& err);
  bool createPlaylist(const std::string& name, std::string& id, std::string& err);
  bool renamePlaylist(const std::string& id, const std::string& name, std::string& err);
  bool deletePlaylist(const std::string& id, std::string& err);
  bool setPlaylistTracks(const std::string& id, const std::vector<std::string>& trackIds, std::string& err);
  /** Snapshot of the current files, then itdb_write. */
  bool save(const Progress& progress, std::string& err);
  std::vector<Snapshot> snapshots();
  bool restoreSnapshot(const std::string& id, std::string& err);
  bool backup(const std::string& dir, bool music, std::string& folder, const Progress& progress, std::string& err);
  Check check();
  bool repair(Check& after, const Progress& progress, std::string& err);

 private:
  void* db_ = nullptr;   // Itdb_iTunesDB*
  std::string mp_;
  bool writable(std::string& err);
};

/** Copies a backup folder onto the iPod at `mountpoint` (database files, and the music when the backup has it). */
bool restoreBackup(const std::string& folder, const std::string& mountpoint, const Progress& progress, std::string& err);
/** sync, unmount and power off the volume. */
bool eject(const std::string& mountpoint, std::string& err);

}  // namespace ipod
