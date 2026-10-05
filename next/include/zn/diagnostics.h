#pragma once
// The diagnostics registry: the only place a diagnostic code, title, explanation, fix or example is written.
// Messages, `zinc explain` and docs/diagnostics.md are all generated from this table.
// Every code needs a fixture (tests/golden/*/errors/<name>.ts + .expect); tests/t0/diagnostics.sh enforces it.
#include <string_view>

// X(Name, code, title, why, fix, example)
#define ZN_DIAGNOSTICS(X)                                                                                              \
  X(UnexpectedToken, "Z0001", "Unexpected token",                                                                      \
    "The parser found a token that cannot start or continue the construct before it, or the input ended early.",      \
    "Check the line for a missing operand, bracket or keyword.", "let x = ;")                                          \
  X(Expected, "Z0002", "Expected a specific token",                                                                    \
    "The construct requires a particular token (such as ';', ')' or ':') and found something else.",                  \
    "Insert the missing token, or end the previous statement with ';' or a newline.", "let a = 1\nlet b = 2 3;")       \
  X(BadLiteral, "Z0003", "Invalid or unterminated literal",                                                            \
    "A string, template, regular expression or comment is not closed, or a character is not valid in the source.",    \
    "Close the literal on the same line (strings) or remove the stray character.", "const s = \"abc")                  \
  X(BadAssignTarget, "Z0004", "Invalid assignment target",                                                             \
    "Only a variable, a property (a.b) or an element (a[i]) can be assigned to.",                                     \
    "Assign to a variable or property instead.", "1 + 2 = a;")                                                         \
  X(Unsupported, "Z0005", "Syntax not supported yet",                                                                  \
    "The syntax is valid TypeScript but this engine does not implement it yet.",                                      \
    "Rewrite it with supported syntax, or wait for the task that adds it.", "let f = (x: number) => x;")

namespace zn {

struct DiagInfo {
  const char* code;
  const char* title;
  const char* why;
  const char* fix;
  const char* example;
};

#define X(name, code, title, why, fix, example) inline constexpr const char* kZ##name = code;
ZN_DIAGNOSTICS(X)
#undef X

inline constexpr DiagInfo kDiagnostics[] = {
#define X(name, code, title, why, fix, example) {code, title, why, fix, example},
    ZN_DIAGNOSTICS(X)
#undef X
};

inline const DiagInfo* findDiag(std::string_view code) {
  for (const DiagInfo& d : kDiagnostics)
    if (code == d.code) return &d;
  return nullptr;
}

}  // namespace zn
