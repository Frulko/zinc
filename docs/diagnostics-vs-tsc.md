# Diagnostics: how they differ from tsc and from the prototype

Zinc Next reports its own codes (`zinc explain <code>`, the list is `docs/diagnostics.md`), one error per cause, as `file:line:col: error Zxxxx: title: detail`.
`zinc check --json <file>` prints the same diagnostics as a JSON array in the shape of the prototype and of LSP (`uri`, `range.start` with 0-based `line` and `character`, `code`,
`severity` 1, `message`) and exits 1 when there is an error.

| What | tsc / prototype | Zinc Next |
|---|---|---|
| Codes | `TS####` for semantics, `Z1xxx/Z4xxx/Z5xxx/Z9xxx` for the language subset | `Z0001-5` syntax, `Z0101-0119` semantics, `Z1xxx` constructs the language forbids (the prototype's numbers: Z1001 `var`, Z1002 `arguments`, Z1003 `eval`, Z1005 `with`, Z1007 `delete`, Z1009 `import()`, Z1010 prototype mutation, Z1011 holes in arrays, Z1015 `globalThis`), `Z9xxx` not supported yet (Z9011 labels, Z9026 `in`) |
| Regular expressions | Z1008 | supported (ZN-090): no code |
| `// @ts-ignore`, `// @ts-expect-error` | honoured by tsc | **not honoured**: they are comments (decision D20) |
| Unused variables, unreachable code | tsc options | no diagnostic |
| `number | string` unions | Z9001 in the prototype | accepted |
| Several errors for one cause | possible | never: a repeated report at the same place is dropped |
| Machine number kinds (`i32`, `f64`, ...) | not in tsc | assignments between kinds are checked (Z0103) |
