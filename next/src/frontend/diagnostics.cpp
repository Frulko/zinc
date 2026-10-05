#include "frontend/diagnostics.h"

#include "frontend/lexer.h"
#include "zn/diagnostics.h"

namespace zn::frontend {

std::string format(const Diag& d, std::string_view src, std::string_view file) {
  LineCol lc = lineCol(src, d.pos);
  const DiagInfo* info = findDiag(d.code);
  std::string out = std::string(file) + ":" + std::to_string(lc.line) + ":" + std::to_string(lc.col) + ": error " + d.code + ": " +
                    (info ? info->title : "unknown diagnostic");
  if (!d.detail.empty()) out += ": " + d.detail;
  return out;
}

std::string explain(std::string_view code) {
  const DiagInfo* d = findDiag(code);
  if (!d) return "";
  return std::string(d->code) + ": " + d->title + "\n\nWhy: " + d->why + "\nFix: " + d->fix + "\n\nExample:\n" + d->example + "\n";
}

std::string markdown() {
  std::string out = "# Diagnostics\n\nGenerated from `next/include/zn/diagnostics.h` by `zinc explain --markdown`. Do not edit.\n";
  for (const DiagInfo& d : kDiagnostics) {
    out += std::string("\n## ") + d.code + ": " + d.title + "\n\n" + d.why + "\n\nFix: " + d.fix + "\n\n```ts\n" + d.example + "\n```\n";
  }
  return out;
}

std::string codes() {
  std::string out;
  for (const DiagInfo& d : kDiagnostics) out += std::string(d.code) + "\n";
  return out;
}

}  // namespace zn::frontend
