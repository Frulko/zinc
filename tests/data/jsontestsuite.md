# JSONTestSuite (ZN-092)

`jsontestsuite.tar.xz`: `test_parsing/` of nst/JSONTestSuite at commit 1ef36fa01286573e846ac449e8683f8833c5b26a (318 files: 95 y_, 188 n_, 35 i_), sha256
9a8f3f888a235f0225ea8f8502a7c34695d8606cda854d6bc322f2a766329afc. `tests/t1/jsontestsuite.sh` runs JSON.parse over the files: all 95 y_ are accepted, all 188 n_ rejected.
The 35 i_ files (the standard leaves the answer open) are accepted or rejected as in `jsontestsuite.expected`, which is also what Node's JSON.parse answers for every file:
numbers out of range parse (to Infinity or 0) and UTF-8 problems in strings are accepted as bytes, an unpaired surrogate escape is accepted, nesting up to 1000 levels is
accepted (beyond that the parse fails), a BOM, a lone high surrogate in UTF-8 and the other structural oddities are rejected like Node does.
