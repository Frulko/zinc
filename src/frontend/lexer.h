#pragma once
// Lexer for the TypeScript subset (+ JSX). Positions are byte offsets into the source; columns are bytes, not UTF-16.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace zn::frontend {

enum class Tok : std::uint8_t {
  Eof,
  Error,         // unterminated string, template, regex, comment, or a stray character
  Ident,         // includes contextual keywords (type, of, async, from, ...)
  PrivateName,   // #name
  Keyword,       // reserved words only
  Number,
  BigInt,
  String,
  Regex,
  Punct,         // `>` is always a single token; the parser merges `>>`, `>=`, ... (as TypeScript does)
  TemplateNoSub, // `abc`
  TemplateHead,  // `abc${
  TemplateMiddle,// }abc${
  TemplateTail,  // }abc`
  JsxText,
};

struct Token {
  Tok kind;
  std::uint32_t start;  // byte offset of the first byte
  std::uint32_t end;    // one past the last byte
};

// Tokens exclude whitespace and comments; the last token is Eof. With `jsx`, tags, attributes and children are tokenised
// (JsxText for children text), tracking nesting itself since the lexer has no parser to ask.
std::vector<Token> lex(std::string_view src, bool jsx);

struct LineCol {
  std::uint32_t line;  // 1-based
  std::uint32_t col;   // 1-based, in bytes
};
LineCol lineCol(std::string_view src, std::uint32_t offset);

// Empty if the tokens cover the source exactly (every gap is whitespace or comments, tokens ordered and in range) and
// there is no Error token; otherwise a description of the first problem.
std::string check(std::string_view src, const std::vector<Token>& toks);

// One line per token: `line:col kind text`, text escaped and cut at 60 bytes.
std::string dump(std::string_view src, const std::vector<Token>& toks);

}  // namespace zn::frontend
