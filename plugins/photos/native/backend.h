#pragma once
// The photo library of a platform: photos.macos.mm (PhotoKit, also iOS through photos.ios.mm) defines PH_BACKEND and includes photos.host.cpp,
// which alone has the fake library only. Listing runs on the program's thread; a load or a save is a job the backend finishes on whatever
// queue PhotoKit answers on: it fills the job, then stores its state last (release), and the program's thread polls it (acquire).
#include <stdint.h>
#include <atomic>
#include <memory>
#include <string>
#include <vector>

struct PhJob {
  std::atomic<int> state{0};    // 0 running, 1 done, -1 failed
  int w = 0, h = 0;
  std::vector<uint32_t> px;     // a load: w * h pixels, 0x00RRGGBB (BGRX in memory), the format of zinc:gfx runtime images
  std::string result;           // a save: the new asset's id; a failure: why
};
struct PhAlbum { std::string id, title, kind; int count = 0; };
struct PhAsset { std::string id, type; double date = 0; int w = 0, h = 0; bool located = false; double lat = 0, lon = 0; };

/** level 0 read and write, 1 add only. 0 undetermined, 1 granted, 2 denied, 3 limited; `ask` shows the system's question when undetermined. */
int ph_backend_permission(int level, bool ask, std::string& err);
/** Shows the sheet that changes a limited selection; the job is done when it closes. False where there is none. */
bool ph_backend_manage_limited(std::shared_ptr<PhJob> job);
bool ph_backend_albums(std::vector<PhAlbum>& out, std::string& err);
bool ph_backend_assets(const std::string& album, int offset, int limit, std::vector<PhAsset>& out, std::string& err);
/** The picture of asset `id` fitted in w x h (w, h > 0). */
void ph_backend_load(const std::string& id, int w, int h, std::shared_ptr<PhJob> job);
/** PNG or JPEG bytes into the library, and into the user album `album` unless it is empty. */
void ph_backend_save(std::vector<uint8_t> bytes, const std::string& album, std::shared_ptr<PhJob> job);
