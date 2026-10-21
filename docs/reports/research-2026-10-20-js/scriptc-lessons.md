# scriptc (vercel-labs): what Zinc can learn

Status: research only. Date 2026-10-20. Sources: the repository at commit `efb54c4` ([github.com/vercel-labs/scriptc](https://github.com/vercel-labs/scriptc)), its `docs/content`, and the npm package `scriptc` 0.3.6 run on the development Mac. Tags: **[V]** run here, **[W]** read in their repository, **[I]** inference.

## What it is [W]

TypeScript and JavaScript compiled to native executables and WASI. The frontend is the TypeScript checker itself (typescript-go, TS 7); lowering to a typed IR (generics specialised, unions tagged, closures with explicit captures); LLVM 22 backend; a C runtime in precompiled packs; reference counting with a cycle collector. No JavaScript engine at run time ("There is no runtime JavaScript engine tier"); QuickJS only runs `comptime` calls inside the compiler. **scriptc 0.2 had one**: `--dynamic` embedded QuickJS in the executable to run the code and packages that did not compile; 0.3 removed it ("Compilation is native-only", `CHANGELOG.md`; `docs/content/docs/dependencies.mdx`, "Upgrading from scriptc 0.2"). The documents give no reason; for Zinc's hybrid idea ([hybrid-engines-dom.md](hybrid-engines-dom.md)) it is the one precedent of a native compiler that tried an embedded engine as fallback and dropped it. npm packages compile with the program: TypeScript sources, or JavaScript with types inferred from it and from its declarations. About 610,000 lines including vendored mbedTLS; the installed package weighs 213 MB.

## The same library on both compilers [V]

kirari (see [typescript-as-written.md](typescript-as-written.md)), `scriptc coverage`:

| Scope | Zinc `zinc check` | scriptc `coverage` |
|---|---|---|
| JavaScript + TypeScript grammars | 2 parse errors, then 78 errors | 642/646 statements (99%), 4 blockers |
| All 48 languages | not measured | 1431/1461 (97%), 30 blockers |

scriptc does not compile kirari as is either. Its blockers: generators driven by `next(value)` (SC1071/SC1090, 13 sites), `RegExpExecArray.index` (SC2020), `Object.defineProperty` (SC2020), a function stored in a record field (SC2001), object spread of `T | undefined` (SC1090), and two crashes of typescript-go itself (SC0004). The rest of Zinc's 78 errors (inference, `Record`, truthiness, narrowing, `&&` values) do not exist there because the checker is TypeScript's own.

## Lessons that transfer

1. **A coverage report instead of a flat list of errors** [W]. Percentage of statements that compile, one group per root cause with its first sites and a hint, unreached code apart, cascades attached to their origin (`SC2004: uses of 'lines' inherit the blocker on its declaration`), "differs from Node" sites. Many of Zinc's 78 errors are cascades; a `zinc check --coverage` that groups them is cheap and changes the experience of someone bringing an npm package.
2. **The zero-cost gate** [W]. A compatibility change must leave IR, LLVM and release executables byte-identical for programs that do not use the construct (`--allow=<regex>` names the exceptions); compile time within tolerance. Exactly the guard Zinc needs before loosening its checker: the AOT C++ of the corpus must not move.
3. **Differential corpus, one program per feature** [W]. 3,316 programs run under Node and natively, stdout/stderr/exit code byte-identical. Zinc carries its oracle in the binary (`--engine quickjs`), and `tools/diff-matrix` already compares at milestones; the rule to borrow is "a compatibility feature lands with a program compared on both engines".
4. **Typed generator channels** [W]. Confirms the design of [typescript-as-written.md](typescript-as-written.md) §3.
5. **Divergences documented and diagnosed where observable** [W]. Records converted to a narrower shape are copied, key order is per type; `SC6001`/`SC6002` fire where a program can see the difference. Applies to a `Record` lowered to a `Map`.
6. **Contract types erased at run time** [W]. `Int32`, `NoThrow<T>`, `Immutable<T>`, `Acyclic`, `ProgramLifetime` from `@scriptc/types` with `import type`: Node ignores them, the compiler proves and uses them. Zinc's `i32`/`u8` play this role but make a program invalid for plain `tsc` without Zinc's declarations.
7. **A compatibility inventory with a status contract** [W]: supported / partial / refused / by-design / not-implemented, generated from Node's API docs, no positive claim without a test.
8. **Compile a package from its TypeScript source** [W]: `--provenance-sources` fetches the source at the commit named by the package's npm provenance attestation, so a package written in TypeScript compiles from its types instead of from its published JavaScript. For Zinc's typed engines this turns many "JavaScript" packages back into TypeScript.
9. **A dynamic tier compiled natively** [W]: code on `any`/untyped values becomes native code with runtime checks and property lookups; `--explain-dynamic` lists why each function is dynamic. Zinc's `Dyn` (design §5.2, gradual profile) is the same idea.

## What not to copy [I]

- The architecture: LLVM, typescript-go and 213 MB of toolchain are the opposite of one binary, modest machines and compiling on the device.
- No JS engine at run time: Zinc's QuickJS engine and `zinc:script` (D22) are its best fallback for code that does not type.

## The one structural question it raises [I]

Three quarters of Zinc's errors on kirari come from its own checker's gaps. Two ways: close them, measured against `tsc` with `tools/oracle`; or ask `tsc`/typescript-go for the types at build time on the development machine while keeping Zinc's frontend on the device. The second deserves its own scored decision.
