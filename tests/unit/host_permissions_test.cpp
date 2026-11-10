#include "host/permissions.h"

int main() {
  using namespace zn::host::perm;
  configure({}, true, true, ".");
  if (!enforced() || check("fs:read", "private.txt").find("EACCES") != 0) return 1;
  configure({"fs:read", "net:localhost"}, true, true, ".");
  if (!check("fs:read", "private.txt").empty() || !check("net", "localhost").empty()) return 1;
  if (check("fs:write", "private.txt").empty() || check("net", "other.invalid").empty()) return 1;
  configure({}, false, true, ".");
  return enforced() || !check("fs:write", "private.txt").empty();
}
