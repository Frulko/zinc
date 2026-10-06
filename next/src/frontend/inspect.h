#pragma once
// console.log of values that are not numbers, booleans or strings: the checker rewrites the argument into a call of a
// formatter written in Zinc itself and compiled with the program, so the output follows Node's util.inspect (single-line
// when it fits in 80 columns, numeric arrays in columns, depth 2) on every back end and needs nothing in the VM.
// This file only produces source text; the checker names, parses and checks it.
#include <string>
#include <vector>

#include "frontend/check.h"

namespace zn::frontend {

// Names the generated code uses for the formatter, the alias of the type, and the class symbol of a type.
std::string inspectFmtName(TypeId t);    // __fmt<id>: (v, ctx, level) => string
std::string inspectLogName(TypeId t);    // __log<id>: (v) => string, the function a console.log argument is rewritten to
std::string inspectAliasName(TypeId t);  // __T<id>
std::string inspectClassName(TypeId t);  // __C<id>: the class, for instanceof

// Helpers shared by every formatter (quoting, grouping, line breaking), as source text.
const char* inspectPrelude();

// Whether values of the type can be formatted: numbers, booleans, strings, arrays, tuples, records, classes (with their
// subclasses), interfaces (through their implementations), Map, Set, functions and `T | null`.
bool inspectable(const Checked& c, TypeId t);

// The source of __fmt<t> (and, when `withLog`, __log<t>). Types whose formatters it calls are appended to `deps`; the
// class types named with instanceof are appended to `classes`.
std::string inspectFunction(const Checked& c, TypeId t, bool withLog, std::vector<TypeId>& deps, std::vector<TypeId>& classes);

}  // namespace zn::frontend
