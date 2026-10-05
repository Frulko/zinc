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
let f = (x: number) => x;
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
