#pragma once
// board.json (ZN-294): a superset of Wokwi's diagram.json. Parts with `id/type/left/top/rotate/attrs`, connections as `["a:PIN", "b:PIN", "color", [routing]]`; the top-level `zinc` object
// (mcu, profile, firmware, buses, clock) is ours and is ignored by readers of diagram.json. Loading keeps every field it does not understand, so a file saved by us loads in Wokwi unchanged.
#include <functional>
#include <string>
#include <vector>

namespace zn::sim {

struct BoardPart {
  std::string id, type;
  double left = 0, top = 0, rotate = 0;
  bool hasLeft = false, hasTop = false, hasRotate = false;
  std::string attrs = "{}";    // the attrs object as compact JSON text
  std::string extra;           // other members of the part (compact JSON object members, "" when none)
};
struct BoardConnection {
  std::string from, to, color;
  std::string routing = "[]";  // compact JSON text
};
struct Board {
  int version = 1;
  std::string author, editor;
  std::string zinc;            // the `zinc` extension object as compact JSON text ("" when absent)
  std::vector<BoardPart> parts;
  std::vector<BoardConnection> connections;
  std::string extra;           // other top-level members (dependencies, serialMonitor...) as compact JSON members
};

struct BoardDiag { std::string where, message; };

// Parses `text`; false with `err` on malformed JSON or a malformed shape. Unknown part types are not an error here: validate() names them.
bool parseBoard(const std::string& text, Board& out, std::string& err);
// The canonical text: members in a fixed order, parts and connections in file order, two-space indent. parse(save(b)) saves to the same text.
std::string saveBoard(const Board& b);
// A part type is known when the registry says so (aliases such as wokwi-led resolve to zn-led there; the core knows no names).
using TypeKnown = std::function<bool(const std::string& type)>;
std::vector<BoardDiag> validateBoard(const Board& b, const TypeKnown& known);

}  // namespace zn::sim
