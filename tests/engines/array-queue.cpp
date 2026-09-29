#include "../../runtime/zrt.h"
#include <cassert>
int main() {
  auto numbers=zrt::Array<int32_t>::with_cap(2);numbers.push(7);numbers.push(9);
  assert(numbers.unshift(numbers.ref(1))==3);
  assert(numbers.get(0)==9 && numbers.get(1)==7 && numbers.get(2)==9);
  auto strings=zrt::Array<zrt::String>::with_cap(4);
  strings.push(zrt::String::from("first",5));strings.push(zrt::String::from("second",6));
  strings.unshift(strings.ref(1));
  assert(strings.get(0)==zrt::String::from("second",6));
  assert(strings.get(1)==zrt::String::from("first",5));
  assert(strings.get(2)==zrt::String::from("second",6));
}
