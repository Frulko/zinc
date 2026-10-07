#pragma once
// Regular expressions for the typed engine (ZN-090) on libregexp of QuickJS-ng (third_party/quickjs-ng): compile with flags, run on a string, read the capture
// positions. Positions are UTF-16 code units, as in JavaScript and in the strings of Zinc.
#include <cstddef>
#include <string>

namespace zn::re {

// A handle (>= 0) for the pattern and flags (dgimsuvy; compiled once per pair), or -1 and error().
int compile(const std::string& source, const std::string& flags);
int captureCount(int handle);                  // groups + 1
std::string groupName(int handle, int index);  // '' for an unnamed group
// 1 match, 0 none, -1 error() (a match abandoned for taking too long, or out of memory). The positions of the match are read with capture() until the next call.
int exec(int handle, const char* utf8, size_t size, int from);
// Every match from `from` on (what a global replace, match or split walks over): the count, or -1 and error(). An empty match moves the position on by one code unit (two for a
// surrogate pair under u or v). allCapture(k) reads the k-th number of the flat result: for match m the 2 * captureCount positions starting at m * 2 * captureCount.
int execAll(int handle, const char* utf8, size_t size, int from);
int allCapture(int k);
int capture(int index);                        // start or end position of capture index/2 (even: start), -1 for a group that did not take part
const std::string& error();

}  // namespace zn::re
