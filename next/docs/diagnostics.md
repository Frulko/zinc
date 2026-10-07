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

Parameters and class fields need an annotation, a declaration needs an initializer, and a function that calls itself needs a return type, when the type cannot be inferred.

Fix: Add a type annotation.

```ts
function f(a) {
  return 1;
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

## Z1001: `var` is not supported

`var` hoists and has function scope, which a typed engine cannot give a static meaning to.

Fix: Use `let` (reassigned) or `const`.

```ts
var x = 1;
console.log(x);
```

## Z1002: `arguments` is not supported

The `arguments` object is an untyped list of every argument.

Fix: Use explicit parameters, or a rest parameter.

```ts
function f(): number { return arguments.length; }
```

## Z1003: `eval` is not supported

A program is compiled ahead of time: there is no engine to run text at run time.

Fix: Parse the data (JSON.parse) or call a function.

```ts
eval('1 + 1');
```

## Z1005: `with` is not supported

`with` changes name resolution at run time.

Fix: Name the object: `o.x` instead of `with (o) { x }`.

```ts
with ({}) { }
```

## Z1007: `delete` is not supported

A typed object has a fixed list of fields: a field cannot be removed.

Fix: Use a Map (`map.delete(key)`), or set the field to null.

```ts
const o = { a: 1 };
delete o.a;
```

## Z1009: Dynamic `import()` is not supported

Every module of a program is known when it is compiled.

Fix: Use a static `import` at the top of the file.

```ts
import('./x').then(() => {});
```

## Z1010: Prototype mutation is not supported

Classes have a fixed shape; `prototype` and `__proto__` cannot be written or read.

Fix: Declare a method in the class, or extend it.

```ts
class A { }
A.prototype.x = 1;
```

## Z1011: Arrays with holes are not supported

An array is a contiguous list: `[1, , 2]` would need a value that is not there.

Fix: Write the value, `null`, or `undefined`.

```ts
const a = [1, , 2];
```

## Z1015: `globalThis` is not supported

There is no global object whose properties can be added or read by name.

Fix: Import what you need, or keep it in a module.

```ts
console.log(globalThis);
```

## Z9011: Labeled statements are not supported yet

`break label` and `continue label` are not implemented yet.

Fix: Use a flag, or move the inner loop into a function.

```ts
outer: for (let i = 0; i < 2; i++) { }
```

## Z9026: The `in` operator is not supported on a typed value

The properties of a typed object are fixed, so `"a" in o` is known when compiling.

Fix: Use `Map.has(key)`, or compare to the field.

```ts
const o = { a: 1 };
console.log('a' in o);
```

## Z5010: A native member uses a type the native ABI cannot carry yet

A native module is called with scalars (i32, u32, boolean, f64), strings, and arrays of u8, i32 and f64; its Spec lists the members. Callbacks, promises, resources and other number kinds are not expressible yet.

Fix: Change the member to use one of those types.

```ts
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { f(m: Map<string, i32>): void }
const n = requireNative<Spec>('Fixture');
```

## Z5011: The native module is not linked into this engine

requireNative<Spec>('Name') needs the module registered in the engine (or a stand-in next to the spec, x.next.ts or x.sim.ts) with the export and signature the Spec describes.

Fix: Link the module, add a stand-in, or fix the Spec to match the module.

```ts
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { f(): void }
const n = requireNative<Spec>('Nowhere');
```

## Z4001: The value cannot be represented in fixed point

Under a fixed-point profile (`--profile ps1`, or `// zinc-profile: ps1`) `number` is Q20.12: no Infinity and no NaN, so Math.min() and Math.max() with no argument (which are Infinity and -Infinity) have no value.

Fix: Give the call at least one argument.

```ts
// zinc-profile: ps1
console.log(Math.max());
```

## Z1006: `any` is not allowed in a strict profile

A strict profile (the line `// zinc-profile: strict` at the top of the entry file, or `--strict`) keeps every value statically typed: `any` and the untyped result of JSON.parse are the gradual (Dyn) part of the language.

Fix: Give the value a type, use `unknown` and narrow it, or drop the strict profile.

```ts
// zinc-profile: strict
const x: any = 1;
console.log(x);
```
