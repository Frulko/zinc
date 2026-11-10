#include "host/intl_format.h"
#include <cassert>
int main() {
  using namespace zn::host::intl;
  assert(decimal(1.005, 2, 2, true) == "1.01");
  assert(decimal(-1.005, 2, 2, true) == "-1.01");
  assert(decimal(-0.0, 0, 3, true) == "-0");
  assert(decimal(1e21, 0, 3, true) == "1,000,000,000,000,000,000,000");
  assert(decimal(1e-7, 0, 3, true) == "0");
  assert(decimal(999.9996, 0, 3, true) == "1,000");
  assert(decimal(0.125, 2, 2, false) == "0.13");
  assert(canonical("EN-us") == "en-US");
  assert(canonical("de-CH-1901") == "de-CH-1901");
  assert(canonical("en-US-x-private") == "en-US-x-private");
  for (const auto* tag : {"en_US", "en--US", "a", "en-US-u", "en-US-abcde-abcde", "en-abc", "abcd"}) assert(canonical(tag)[0] == '!');
  assert(locale("zz-ZZ\nfr-FR\nen-US", false, "en-US") == (osAvailable() ? "fr-FR" : "en-US"));
  assert(zone("UTC") == "UTC");
  assert(portableDate("en-US", "numeric|numeric|numeric||numeric|numeric|numeric|", "UTC", 0) == "1/1/1970, 12:00:00 AM");
  assert(portableDate("en-US", "|long||||||", "UTC", -0.1) == "January");
  assert(portablePattern("en-US", "|||||2-digit||") == "m");
  assert(portablePattern("en-US", "||||||2-digit|") == "s");
  assert(portableDate("en-US", "|||||2-digit||", "UTC", 54245000) == "4");
  assert(portableDate("en-US", "||||||2-digit|", "UTC", 54245000) == "5");
  assert(portableDate("en-US", "|||||numeric|numeric|", "UTC", 54245000) == "04:05");
  assert(portableDate("en-US", "|long||||||", "UTC", NAN)[0] == '!');
  assert(number("en-US", 1, NAN, 2, true)[0] == '!');
}
