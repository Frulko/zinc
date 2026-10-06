# Diagnostics

Generated from `next/include/zn/diagnostics.h` by `zinc explain --markdown`. Do not edit.

## Z0001: Unexpected token

The parser found a token that cannot start or continue the construct before it, or the input ended early.

Fix: Check the line for a missing operand, bracket or keyword.

```ts
let x = ;
```

## Z0002: Expected a specific token

The construct requires a particular token (such as ';', ')' or ':') and found something else.

Fix: Insert the missing token, or end the previous statement with ';' or a newline.

```ts
let a = 1
let b = 2 3;
```

## Z0003: Invalid or unterminated literal

A string, template, regular expression or comment is not closed, or a character is not valid in the source.

Fix: Close the literal on the same line (strings) or remove the stray character.

```ts
const s = "abc
```

## Z0004: Invalid assignment target

Only a variable, a property (a.b) or an element (a[i]) can be assigned to.

Fix: Assign to a variable or property instead.

```ts
1 + 2 = a;
```

## Z0005: Syntax not supported yet

The syntax is valid TypeScript but this engine does not implement it yet.

Fix: Rewrite it with supported syntax, or wait for the task that adds it.

```ts
function* g() { }
```

## Z0101: Cannot find name

The identifier is not declared in this scope, or is declared later in the same scope.

Fix: Declare it before use, or fix the spelling.

```ts
let a = b;
```

## Z0102: Duplicate declaration

A name can be declared only once per scope.

Fix: Rename one of the declarations.

```ts
let a = 1;
let a = 2;
```

## Z0103: Type is not assignable

The value's type cannot be used where another type is expected. Machine numeric kinds (i32, f64, ...) are distinct: only lossless widening is implicit, and conditions must be boolean.

Fix: Convert explicitly or change the declared type.

```ts
let a: i32 = "x";
```

## Z0104: Wrong number of arguments

A call must pass every required parameter and no more than the function declares.

Fix: Add or remove arguments.

```ts
function f(a: i32): i32 { return a; }
f(1, 2);
```

## Z0105: Expression is not callable

Only functions and methods can be called, and only classes can be used with new.

Fix: Call a function, or remove the parentheses.

```ts
let a = 1;
a();
```

## Z0106: Property does not exist

The type has no member with this name, or the builtin library does not provide it yet.

Fix: Check the name against the type's declaration.

```ts
let a = 1;
a.foo;
```

## Z0107: Operator cannot be applied to these types

The operands' types do not support the operator.

Fix: Convert the operands or use another operator.

```ts
let a = 1 - "x";
```

## Z0108: Cannot assign to a constant

A const binding or read-only member cannot be reassigned.

Fix: Declare it with let, or do not assign.

```ts
const a = 1;
a = 2;
```

## Z0109: Cannot infer a type

Parameters, class fields and non-void function results need an annotation, and a declaration needs an initializer, when the type cannot be inferred.

Fix: Add a type annotation.

```ts
function f(a: i32) {
  return a;
}
```

## Z0110: Not all code paths return a value

A function with a non-void return type must return on every path.

Fix: Add a final return.

```ts
function f(a: i32): i32 {
  if (a > 0) return 1;
}
```

## Z0111: Field is not initialized

A field without an initializer must be assigned in the constructor.

Fix: Initialize it or assign it in the constructor.

```ts
class A {
  x: i32;
}
```

## Z0112: Not allowed in this context

break and continue need an enclosing loop, return needs a function, this needs a class.

Fix: Move the statement.

```ts
break;
```

## Z0113: Expression cannot be indexed or iterated

Only arrays can be indexed or used with for...of for now.

Fix: Use an array.

```ts
let a = 1;
a[0];
```

## Z0114: Invalid class hierarchy or override

A class must extend a class, an override must keep the base member's kind and type, and the hierarchy must not loop.

Fix: Match the base class member, or rename the member.

```ts
class A { f(): i32 { return 1; } }
class B extends A { f(): string { return "x"; } }
```

## Z0115: Abstract member misused

Abstract classes cannot be instantiated, abstract members belong in abstract classes, and a concrete class must implement every abstract member it inherits.

Fix: Implement the member, or make the class abstract.

```ts
abstract class A { abstract f(): i32; }
class B extends A { }
```

## Z0116: Class does not implement the interface

A class that declares `implements I` must have a public member for every member of I with the same type.

Fix: Add the missing member or fix its type.

```ts
interface I { f(): i32; }
class A implements I { }
```

## Z0117: Member is not accessible

A private member is visible only inside its class, a protected member inside its class and subclasses.

Fix: Use a public member or access it from inside the class.

```ts
class A { private x: i32 = 1; }
const a = new A();
console.log(a.x);
```

## Z0118: Invalid super call

A derived class constructor must start with `super(...)`, and `super` is only valid in a derived class.

Fix: Call super(...) as the first statement of the constructor.

```ts
class A { }
class B extends A {
  x: i32 = 1;
  constructor() { this.x = 2; }
}
```

## Z0119: Cannot find module

An import must name a file relative to the importing file ('./x' or '../x'); `.ts`, `.tsx` and `/index.ts` are tried.

Fix: Fix the path or create the file.

```ts
import { x } from './missing';
```

## Z1006: `any` is not allowed in a strict profile

A strict profile (the line `// zinc-profile: strict` at the top of the entry file, or `--strict`) keeps every value statically typed: `any` and the untyped result of JSON.parse are the gradual (Dyn) part of the language.

Fix: Give the value a type, use `unknown` and narrow it, or drop the strict profile.

```ts
// zinc-profile: strict
const x: any = 1;
console.log(x);
```
