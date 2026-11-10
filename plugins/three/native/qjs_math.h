#pragma once
#include <string>
struct JSContext;
namespace zn::three {
// QuickJS-only context binding and exact-source transform, registered together.
void mathContext(JSContext* ctx);
void mathSource(std::string& source);
}
