// zinc:ipod core: the iPod operations over libgpod, in plain C++ (std types only), so they run on the worker thread
// and can be tested without the engine (tests/native/ipod_core_test.cpp). Every function returns false (or empty) and
// fills `err` on failure; none of them throws.
#pragma once

// The records are the structs zinc generates from ipod.spec.ts (the spec is their one definition); this header comes
// first in a file, as a generated header must.
#include "zinc_native_ipod.h"
#include <functional>

namespace ipod {

using ::AddResult; using ::DownloadResult; using ::Backup; using ::Check; using ::Device; using ::Extra; using ::PhotoAlbum; using ::Picture; using ::Playlist; using ::Snapshot; using ::SpecItem; using ::Track; using ::TrackInput;

/** phase, done, total, detail */
using Progress = std::function<void(const std::string&, int32_t, int32_t, const std::string&)>;

/** Mounted iPods, then those plugged in by USB but not mounted (connection "usb", described from their USB SysInfoExtended). */
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
  bool save(const Progress& progress, std::string& err);
  /** The restore points of this iPod: its backups on the computer (the automatic ones taken before a session's first change too). */
  std::vector<Snapshot> snapshots();
  /** Puts back the database of one of snapshots() and reopens. */
  bool restoreSnapshot(const std::string& id, const Progress& progress, std::string& err);
  /** A backup in `dir`/<serial>/<date> ('' = backupRoot()); `music` syncs the music into `dir`/<serial>/Music. */
  bool backup(const std::string& dir, bool music, std::string& folder, const Progress& progress, std::string& err);
  std::vector<SpecItem> specs();
  /** The cover at about size x size; out.width 0 when the track has none. */
  bool artwork(const std::string& id, int32_t size, Picture& out, std::string& err);
  /** The Photo Database, read at the first call after open(). */
  std::vector<PhotoAlbum> photoAlbums(std::string& err);
  bool photo(const std::string& id, int32_t size, Picture& out, std::string& err);
  std::vector<Extra> extras();
  /** Copies tracks into `dir` as Artist/Album/NN Title.ext; a file of the same size already there is skipped. Reads the iPod only. */
  std::vector<DownloadResult> download(const std::vector<std::string>& ids, const std::string& dir, const Progress& progress, std::string& err);
  Check check();
  bool repair(Check& after, const Progress& progress, std::string& err);

 private:
  void* db_ = nullptr;   // Itdb_iTunesDB*
  std::string mp_;
  void* photos_ = nullptr;   // Itdb_PhotoDB*, read on demand
  bool photosRead_ = false;
  bool backedUp_ = false;   // the database was copied to the computer since open(): the session's restore point
  /** Refuses a change on a read-only iPod, and takes the automatic backup before the first change of the session. */
  bool writable(std::string& err, const Progress& progress = nullptr);
};

/** Where backups go by default: $ZINC_IPOD_BACKUPS, else $ZINC_HOME/ipod, else ~/.zinc/ipod. */
std::string backupRoot();
/** The backups in `dir` ('' = backupRoot()) and its iPod folders, newest first. */
std::vector<Backup> backups(const std::string& dir);
/** Deletes a backup folder; refused unless it is a backup (its Info.plist) inside backupRoot(). */
bool deleteBackup(const std::string& folder, std::string& err);
/** A name made safe for a file on any disk (FAT32, HFS+, ext4): no / \ : * ? " < > | nor control characters, no leading dot or
 *  space, no trailing dot or space, at most 120 bytes (cut on a UTF-8 boundary); `fallback` when nothing is left. */
std::string safeName(const std::string& name, const std::string& fallback);
/** Copies a backup folder onto the iPod at `mountpoint`: its database, and the music files it refers to that the iPod lacks (from the
 *  backup's shared Music folder). The iPod's own description (iPod_Control/Device) is never replaced. */
bool restoreBackup(const std::string& folder, const std::string& mountpoint, const Progress& progress, std::string& err);
/** Mounts the disk `device` (a BSD name such as disk4, sdb2 on Linux), or with '' every iPod disk plugged in but not mounted
 *  (macOS: the external disks whose media name says iPod). Changes nothing on the iPod. */
bool mount(const std::string& device, std::string& err);
/** sync, unmount and power off the volume. */
bool eject(const std::string& mountpoint, std::string& err);

}  // namespace ipod
