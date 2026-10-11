// zinc:assets version 2 (ZN-436, docs/reports/games/toolchain-assets-loading.md 6.3 to 6.6): the run-time side of the ZPK packs (src/zpk).
// A mount table of mapped packs searched in order (overlays first, then the base packs of the program), groups (a group is the packs named
// <group>.zpk) loaded and unloaded as a whole with byte progress, reference-counted handles on the loaded entries, two priority queues, the
// decoding on the libuv thread pool with one zstd context per job in flight, a byte budget per turn of the loop for what becomes resident, and
// the resident bytes held against the target's ram budget. The v1 calls (readText, readBytes, exists, list) read the packs' data entries first.
// Private to src/host: sys_host.cpp serves the HostAssets* rows with these functions.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::host::assets {

// ---- v1 through the packs (the base packs are mounted on the first call)
/** The bytes of `name`: resident, else a data entry of the first mounted pack that has it. False when no pack has it (the caller reads the directory). */
bool read(const std::string& name, std::string& out, std::string& err);
bool has(const std::string& name);
/** The names of the data entries of every mounted pack (an imported image is not the file's bytes: it stays out). */
void names(std::vector<std::string>& out);

// ---- mounts
/** Mounts a .zpk, or every .zpk of a directory, in front of the others (an overlay: searched first). The packs mounted, 0 with `err`. */
int mount(const std::string& path, std::string& err);
/** False when it is not mounted or a load is in flight. */
bool unmount(const std::string& path);
/** The groups of the mounted packs, sorted. */
void groups(std::vector<std::string>& out);

// ---- groups and requests
enum Priority { Group = 0, Background = 1 };
/** A request for the group (a pending one is shared and raised to `priority`); 0 with `err`: no such group, or over the ram budget. */
int load(const std::string& group, int priority, std::string& err);
/** Cancels its request; frees the entries no handle holds (the others when their last handle is released). */
void unload(const std::string& group);
int groupState(const std::string& group);   // 0 unloaded, 1 loading, 2 loaded
/** One turn of the scheduler: feeds the workers, makes resident what they decoded (in the order the jobs were queued, up to the turn's byte
 *  budget; a deterministic run waits for them, so every turn ends in the same state). */
void turn();
enum State { Loading = 0, Done = 1, Failed = 2 };
double done(int req);
double total(int req);
int state(int req);
std::string error(int req);
void forget(int req);   // the program saw the request settle

// ---- handles on resident entries
/** A handle on a resident entry (its group loaded); 0 with `err` otherwise. */
int acquire(const std::string& name, std::string& err);
void release(int handle);
const std::string* data(int handle);   // null for a released handle

/** 0 resident bytes, 1 their peak, 2 the ram budget (0: none), 3 groups loaded, 4 packs mounted, 5 jobs queued or in flight. */
double stat(int k);

}  // namespace zn::host::assets
