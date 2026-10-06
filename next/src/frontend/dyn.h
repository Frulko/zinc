#pragma once
// Dyn: the values of `any` and `unknown`, written in Zinc. A Dyn is a reference to one of the classes of the prelude below
// (undefined, null, boolean, number, string, array, object, and a view of a typed object); the checker converts typed values
// into Dyn and back at the places where the types meet, and rewrites operators, property access and typeof on Dyn operands
// into calls of the helper functions of the prelude. This file produces source text only.
#include <string>
#include <vector>

#include "frontend/check.h"

namespace zn::frontend {

// The classes and helpers every program using `any`, `unknown`, `undefined` or JSON.parse gets.
const char* dynPrelude();

// Names of the generated converters of a type.
std::string dynToName(TypeId t);    // __dynTo<t>(v: T): any
std::string dynFromName(TypeId t);  // __dynFrom<t>(d: any): T

// Source of __dynTo<t> or __dynFrom<t> (a checked conversion); the types whose converters it calls are appended to `deps`.
// `tags` of a class: the type ids a view of it answers to for instanceof (itself and its base classes).
std::string dynConverter(const Checked& c, TypeId t, bool to, std::vector<std::pair<TypeId, bool>>& deps, std::vector<TypeId>& formatters);

// Whether values of the type can be converted to and from Dyn.
bool dynConvertible(const Checked& c, TypeId t);

}  // namespace zn::frontend
