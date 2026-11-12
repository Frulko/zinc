#pragma once
// Dyn: the values of `any` and `unknown`, written in Zinc. A Dyn is a reference to one of the classes of the prelude below
// (undefined, null, boolean, number, string, array, object, and a view of a typed object); the checker converts typed values
// into Dyn and back at the places where the types meet, and rewrites operators, property access and typeof on Dyn operands
// into calls of the helper functions of the prelude. This file produces source text only.
#include <string>
#include <vector>
#include <functional>

#include "frontend/check.h"

namespace zn::frontend {

// The classes and helpers every program using `any`, `unknown`, `undefined` or JSON.parse gets.
std::string dynPrelude(bool symbols = false);
const char* iteratorPrelude();
std::string iteratorDynPrelude(bool symbols);

// Names of the generated converters of a type.
std::string dynToName(TypeId t);    // __dynTo<t>(v: T): any
std::string dynFromName(TypeId t);  // __dynFrom<t>(d: any): T
std::string dynDownName(TypeId t);  // __dynDown<t>(d: any): T | null, of a class: the object of a view of a subclass of T (the lowering writes it), null otherwise
std::string dynSubName(TypeId t);   // __dynSub<t>(v: T): any, of a class: the view of the subclass `v` is an instance of (the lowering writes it), undefined for T itself

// Source of __dynTo<t> or __dynFrom<t> (a checked conversion); the types whose converters it calls are appended to `deps`.
// Exact type names used without a converter are appended to `aliases`.
std::string dynConverter(const Ast& ast, const Checked& c, TypeId t, bool to, std::vector<std::pair<TypeId, bool>>& deps, std::vector<TypeId>& formatters, std::vector<TypeId>& aliases,
                         const std::function<std::string(const Member&)>& methodHelper);

// Whether values of the type can be converted to and from Dyn.
bool dynConvertible(const Checked& c, TypeId t);

}  // namespace zn::frontend
