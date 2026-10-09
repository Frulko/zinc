#pragma once
// The permission manifest at run time (ZN-322): zinc.json "permissions" names what the host modules may do. Without a "permissions" list nothing
// is checked (as before). With one, a call it does not cover warns once per permission while developing (`zinc run`) and is refused, the error
// naming the permission, when enforced (exported apps; ZINC_PERMISSIONS=enforce).
//   net  net:<host>  net:*.<domain>       outgoing requests (fetch) and listening (serve)
//   fs   fs:read  fs:write  fs:read:<root>  fs:write:<root>    files (roots relative to the project, or absolute)
//   process  serial  camera  microphone  location              (checked by their modules)
#include <string>
#include <vector>

namespace zn::host::perm {

void configure(const std::vector<std::string>& entries, bool declared, bool enforce, const std::string& projectDir);
bool enforced();
/** "" when allowed (or only warned about); else the error text, which names the permission. `feature` is net, fs:read, fs:write, process...;
 *  `detail` is the host or the path. */
std::string check(const std::string& feature, const std::string& detail);

}  // namespace zn::host::perm
