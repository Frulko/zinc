#include "frontend/diagnostics.h"

#include <algorithm>

#include "frontend/lexer.h"
#include "zn/diagnostics.h"

namespace zn::frontend {

std::string nearest(std::string_view name, const std::vector<std::string>& candidates) {
  std::string best;
  std::size_t bestD = std::min(name.size(), std::max<std::size_t>(2, name.size() / 3) + 1);   // 2 edits (a swap of two letters) on a short name, never the whole name
  for (const std::string& c : candidates) {
    std::vector<std::size_t> row(c.size() + 1);   // Levenshtein, one row
    for (std::size_t j = 0; j <= c.size(); ++j) row[j] = j;
    for (std::size_t i = 1; i <= name.size(); ++i) {
      std::size_t diag = row[0];
      row[0] = i;
      for (std::size_t j = 1; j <= c.size(); ++j) {
        std::size_t up = row[j];
        row[j] = std::min({up + 1, row[j - 1] + 1, diag + (name[i - 1] == c[j - 1] ? 0 : 1)});
        diag = up;
      }
    }
    if (row[c.size()] < bestD && c != name) { bestD = row[c.size()]; best = c; }
  }
  return best;
}

std::string hint(const std::vector<Diag>& diags) {
  if (diags.empty()) return "";
  const DiagInfo* info = findDiag(diags[0].code);
  std::string out = "zinc: " + std::to_string(diags.size()) + (diags.size() == 1 ? " error." : " errors, start with the first.");
  if (info) out += std::string(" ") + std::string(info->fix) + " `zinc explain " + std::string(info->code) + "` shows an example.";
  return out;
}

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
  std::string out = "# Diagnostics\n\nGenerated from `include/zn/diagnostics.h` by `zinc explain --markdown`. Do not edit.\n";
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
