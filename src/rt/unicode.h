#pragma once
// Unicode for strings (ZN-091) on libunicode of QuickJS-ng (third_party/quickjs-ng): full case mapping, normalization and a root-collation subset for localeCompare.
// All on UTF-16 code units, like the strings of Zinc.
#include <string>

namespace zn::uni {

std::u16string upper(const std::u16string& s);                 // toUpperCase with the special casing (ß -> SS)
std::u16string lower(const std::u16string& s);                 // toLowerCase with the special casing (İ, and a final sigma)
// form: 0 NFC, 1 NFD, 2 NFKC, 3 NFKD. false for a form the engine does not know.
std::u16string normalize(const std::u16string& s, int form);
// -1, 0 or 1: the order ICU's root collation gives for the common cases (ignorable controls, punctuation < symbols < digits < letters, letters by base letter, then
// accents, then lowercase before uppercase); other scripts follow Latin in code point order.
int collate(const std::u16string& a, const std::u16string& b);

}  // namespace zn::uni
