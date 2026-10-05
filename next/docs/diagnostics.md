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
