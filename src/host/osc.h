#pragma once
// OSC 1.0 codec for zinc:osc (ZN-085). Messages travel between the host and Zinc as one packed string:
// address, then one item per argument, all separated by \x1e; an item is "n:<number>" or "s:<text>".
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace zn::osc {

// A message from the packed form; i for integral numbers, f otherwise, s for strings (numbers first, then strings, as zinc:osc declares).
std::string encode(const std::string& packed);
// A datagram (untrusted) into packed messages, bundles flattened; empty when it holds none.
std::vector<std::string> decode(const uint8_t* buf, size_t n);

}  // namespace zn::osc
