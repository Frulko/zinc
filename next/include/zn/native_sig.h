#pragma once
// The part of a native export's signature ("params>result", include/zn/native.h) that a program can call: scalars (i u b d), strings (s), arrays of u8 (B),
// i32 (I), u32 (U), f64 (D), string arrays in (S), callbacks in (c(params>result), scalars, strings and arrays as parameters, a scalar or string result), and a promise
// result (P<t>: the engine passes two more callbacks that settle it). ZN-097 and ZN-167.
#include <cstring>
#include <string>
#include <vector>

namespace zn::nsig {

inline bool paramLetter(char c) { return c != 0 && std::strchr("siubdBIDSU", c) != nullptr; }   // c: a callback, written c(...)
inline bool resultLetter(char c) { return c != 0 && std::strchr("nsiubdBID", c) != nullptr; }
inline bool cbParamLetter(char c) { return c != 0 && std::strchr("siubdBID", c) != nullptr; }
inline bool cbResultLetter(char c) { return c != 0 && std::strchr("nsiubd", c) != nullptr; }

struct Sig {
  std::string params;                 // one letter per parameter; 'c' for a callback
  std::vector<std::string> cbs;       // the inner signature of each callback, in order: "iis>n"
  char result = 'n';                  // n s i u b d B I D, or 'P' for a promise
  char promiseOf = 0;                 // the letter of the value a promise delivers (n for none)
  // A call passes params.size() arguments, then two more callbacks (resolve, reject) when the result is a promise.
  std::size_t arity() const { return params.size() + (result == 'P' ? 2 : 0); }
};

// "i>n": a callback's own signature, parameters and result only.
inline bool parseCallback(const std::string& s, std::string& params, char& result) {
  std::size_t gt = s.find('>');
  if (gt == std::string::npos || gt + 2 != s.size() || !cbResultLetter(s[gt + 1])) return false;
  params = s.substr(0, gt);
  for (char c : params) if (!cbParamLetter(c)) return false;
  result = s[gt + 1];
  return true;
}

// False when the signature uses anything else.
inline bool parse(const char* sig, Sig& out) {
  out = Sig{};
  std::string s = sig;
  std::size_t i = 0;
  while (i < s.size() && s[i] != '>') {
    if (s[i] == 'c') {
      if (i + 1 >= s.size() || s[i + 1] != '(') return false;
      std::size_t close = s.find(')', i + 2);
      if (close == std::string::npos) return false;
      std::string p;
      char r;
      if (!parseCallback(s.substr(i + 2, close - i - 2), p, r)) return false;
      out.params += 'c';
      out.cbs.push_back(s.substr(i + 2, close - i - 2));
      i = close + 1;
    } else {
      if (!paramLetter(s[i])) return false;
      out.params += s[i++];
    }
  }
  if (i >= s.size()) return false;
  ++i;   // the '>'
  if (i < s.size() && s[i] == 'P') {
    if (i + 2 != s.size() || !resultLetter(s[i + 1])) return false;
    out.result = 'P';
    out.promiseOf = s[i + 1];
    return true;
  }
  if (i + 1 != s.size() || !resultLetter(s[i])) return false;
  out.result = s[i];
  return true;
}

}  // namespace zn::nsig
