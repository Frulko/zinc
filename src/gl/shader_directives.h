#pragma once
#include <regex>
#include <string>

namespace zn::gl {
inline std::size_t shaderLineEnd(const std::string& source, std::size_t begin) {
  return source.find_first_of("\r\n", begin);
}
inline std::size_t shaderNextLine(const std::string& source, std::size_t end) {
  if (end == std::string::npos) return source.size();
  const auto next = end + 1;
  return next < source.size() && (source[next] == '\r' || source[next] == '\n') && source[next] != source[end] ? next + 1 : next;
}

// ESSL 3.00 section 3.1 phase 4: one LF per physical newline, before preprocessing.
inline std::string shaderPhysicalNewlines(const std::string& source) {
  std::string out;
  out.reserve(source.size());
  for (std::size_t i = 0; i < source.size();) {
    if (source[i] == '\r' || source[i] == '\n') {
      out += '\n';
      i = shaderNextLine(source, i);
    } else out += source[i++];
  }
  return out;
}

// Keep offsets and physical lines: callers also use this view to edit the original source.
inline std::string shaderCommentMask(const std::string& source, bool& closed) {
  std::string out = source;
  closed = true;
  // Splicing precedes comment recognition; retain raw offsets for every consumer.
  const auto skipSplices = [&](std::size_t i) {
    while (i + 1 < source.size() && source[i] == '\\' && (source[i + 1] == '\r' || source[i + 1] == '\n'))
      i = shaderNextLine(source, i + 1);
    return i;
  };
  for (std::size_t i = 0; (i = skipSplices(i)) < source.size();) {
    const auto next = skipSplices(i + 1);
    const bool line = source[i] == '/' && next < source.size() && source[next] == '/';
    if (!line && !(source[i] == '/' && next < source.size() && source[next] == '*')) { ++i; continue; }
    const std::size_t start = i;
    i = skipSplices(next + 1);
    if (line) {
      while (i < source.size() && source[i] != '\r' && source[i] != '\n') i = skipSplices(i + 1);
    } else {
      closed = false;
      while (i < source.size()) {
        const auto end = skipSplices(i + 1);
        if (source[i] == '*' && end < source.size() && source[end] == '/') { i = end + 1; closed = true; break; }
        i = end;
      }
    }
    for (std::size_t k = start; k < i; ++k) if (out[k] != '\n' && out[k] != '\r') out[k] = ' ';
  }
  return out;
}

struct ShaderDirectives {
  int version = 100;
  std::size_t versionBegin = std::string::npos, versionEnd = std::string::npos;
  std::string error;
};

inline ShaderDirectives shaderDirectives(const std::string& source) {
  ShaderDirectives result;
  bool closed;
  const std::string mask = shaderCommentMask(source, closed);
  const auto fail = [&](std::size_t line, const char* why) {
    result.error = "ERROR: 0:" + std::to_string(line) + ": '#version' : " + why;
  };
  if (!closed) {
    std::size_t line = 1;
    for (auto end = shaderLineEnd(source, 0); end != std::string::npos; end = shaderLineEnd(source, shaderNextLine(source, end))) ++line;
    result.error = "ERROR: 0:" + std::to_string(line) + ": '' : unterminated comment";
    return result;
  }
  static const std::regex name(R"(^[ \t\r]*#[ \t]*version\b)");
  static const std::regex declaration(R"(^[ \t\r]*#[ \t]*version[ \t]+(100|300)([ \t]+es)?[ \t\r]*$)");
  for (std::size_t begin = 0, line = 1; begin < source.size(); ++line) {
    const auto end = shaderLineEnd(source, begin);
    const std::string text = mask.substr(begin, end == std::string::npos ? end : end - begin);
    if (std::regex_search(text, name)) {
      std::smatch match;
      if (result.versionBegin != std::string::npos) { fail(line, "duplicate version directive"); return result; }
      if (!std::regex_match(text, match, declaration) || (match[1] == "100" && match[2].matched) || (match[1] == "300" && !match[2].matched)) { fail(line, "unsupported or malformed version directive"); return result; }
      result.version = match[1] == "300" ? 300 : 100;
      if (result.version == 300 && (line != 1 || end == std::string::npos || !std::regex_match(source.substr(begin, end - begin), declaration))) { fail(line, "ESSL 3.00 version directive must occupy the first line"); return result; }
      result.versionBegin = begin;
      result.versionEnd = end == std::string::npos ? source.size() : end;
    }
    if (end == std::string::npos) break;
    begin = shaderNextLine(source, end);
  }
  return result;
}
}  // namespace zn::gl
