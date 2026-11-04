// Keep the runtime's minimal headers separate from the platform shell's STL.
#include "zrt.h"
#include <stdio.h>

extern "C" void zn_legacy_write_info(const char* directory) {
  zrt::String report = zrt::gfx::info_json();
  char path[1100], temporary[1100];
  snprintf(path, sizeof path, "%s/info.json", directory);
  snprintf(temporary, sizeof temporary, "%s/info.json.tmp", directory);
  FILE* file = fopen(temporary, "w");
  if (!file) { perror("Zinc info"); return; }
  bool ok = fwrite(report.ptr(), 1, report.bytes(), file) == report.bytes();
  if (fclose(file)) ok = false;
  if (ok && rename(temporary, path)) perror("Zinc info rename");
}
