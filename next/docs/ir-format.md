# IR text format and ZBC binary format

Two formats are specified here. Both carry a version; a reader refuses a version it does not know with a message that says what to do.

| Format | Written by | Read by | Version | Where |
|---|---|---|---|---|
| IR text | `zinc --emit=ir`, `--emit=ir-rc` (`ir::dump`) | `zinc ir --check` (`ir::parse`) | **1** (`ir::kTextVersion`) | `src/ir/ir.cpp`, `src/ir/parse.cpp` |
| ZBC binary | `zinc --emit=zbc-bin`, `zinc build` | `zinc run file.zbc`, `zinc zbc --check`, the device core | **5** (`kVersion`, magic `ZBC2`) | `src/zbc/zbc.cpp` |

## IR text, version 1

A dump is one text file, UTF-8, lines ended by `\n`. `parse(dump(m))` dumps to the same text; `zinc ir --check file` reads a file, verifies the module and
checks that dumping it gives the file back (the canonical form), so a hand edited file must be written canonically.

```
file      = "zir 1" NL { selector | class | global | function }
selector  = "selector ." sname "(" [ type { "," type } ] ")" "->" type NL
class     = ( "class" | "abstract class" | "interface" ) name [ ":" name ] [ "implements" name { "," name } ]
            [ "{" [ name ":" type { "," name ":" type } ] "}" ]  NL      (an interface has no field list)
            { "  sel ." sname [ "->" "@" name ] NL }                    (the class's selectors, in order; "-> @f" is its vtable entry)
global    = "global @@" name ":" type NL
native    = "native" quoted quoted quoted NL   (module, export, signature: the targets of `callnative #n(%args)`)
function  = "func @" name "(" [ param { "," param } ] ")" "->" type "{" NL { block } "}" NL
param     = "%" N ":" type
block     = "bb" N [ "(" param { "," param } ")" ] ":" NL { "  " inst NL }      (bb0 has no list: its parameters are the function's)
inst      = [ "%" N ":" type "=" ] op operands
```

- **Names** are bare when they hold only letters, digits, `_`, `$` and `.`, otherwise quoted as a string (`"{ a: f64 }"`, `"fn (i32) => i32"`).
- **Selectors** are named by `sname`: the name, and `#k` when k earlier selectors have the same name (another signature).
- **Types**: `void bool str`, the numeric kinds `f64 f32 fx12 fx16 i8 i16 i32 i64 u8 u16 u32 u64 isize usize`, `ref NAME`, `T[]`, `Map<K, V>`, `Set<T>`.
- **Values** are `%N`, numbered per function; every value is defined once (a result, a function or block parameter). Control flow passes arguments to block parameters:
  an edge is `bbN` or `bbN(%a, %b)`.
- **Operands by op**: `const` null, a quoted string, `true`/`false`, an integer or a float (`%.17g`); `call @f(args) [unwind edge]`; `callvirt .sel(args) [unwind edge]`;
  `builtin name(args)`; `rt owner.member(args)` (a row of the runtime table, `include/zn/runtime.h`); `new C`; `instof C %x`; `getfield .N %o`; `setfield .N %o, %v`;
  `getglobal @@g`; `setglobal @@g %v`; `arrnew T`; `br edge`; `condbr %c, edge, edge`; `ret [%v]`; `throw %v`; `unreachable`; every other op is `op %a, %b`.
  The op names are `ir::opName`, the builtin names `zn/builtins.h`, the runtime names the `name` column of the table.
- Layout (`getfield .N`, class order, selector ids, function indexes, the order of the blocks) is part of the text: it is the order of the declarations.

### Version rules

- The version is the number on the first line. Any change to the grammar or the meaning of a line, or a renamed op, builtin or runtime entry, raises it.
- A reader accepts exactly the versions it lists (now: 1). Text before version 1 has no version line (it starts with `class`/`func`): it is refused with
  "no version line ... write the file again with `zinc --emit=ir`". A newer version is refused with "IR text version N is not supported".
- There is no migration: the text is regenerated from the source by the zinc that reads it. `tests/compat/` keeps a dump of every released version (`ir-v0-fib.ir`,
  `ir-v1-fib.ir`) and `tests/t0/irformat.sh` checks each is read or refused as written here. Adding op names, builtins or runtime rows at the end of their tables does not change
  the version; removing or renaming one does.

## ZBC binary, version 7

Little endian. `"ZBC2"` (magic), `u32 version`, then the tables, each a `u32` count and the entries:

| Table | Entry |
|---|---|
| classes | `str name`, `u32 parent` (0xFFFFFFFF none), `u8 flags` (1 interface, 2 abstract), `u8 kind` (0 object, 1 string, 2 array, 3 Map, 4 Set), for a builtin kind `vtype elem, vtype key`, `u32s supers`, `u32 nfields` + `vtype` each, `u32s selectors`, `u32s vtable` |
| selectors | `str name`, `u8 nparams`, `vtype` each, `vtype ret` |
| strings | `str` |
| globals | `vtype` |
| functions | `str name`, `u8 nparams`, `vtype` each, `vtype ret`, `u16 nregs`, `u32 ncode` + `u32` words, `u32 nconsts` + (`u8 class`, `u64 bits`), `u32 nhandlers` + (`u32 at`, `u32 target`, `u16 class`, `u8 reg`) |

| natives (after the functions) | `str module`, `str name`, `str sig` (`params>result`, include/zn/native_sig.h): the loader finds the export in the registry (include/zn/native.h) and refuses a program whose signature differs; `CallNative A,n` calls entry n with the arguments in r[A..] and the result in r[A] |
| profile (after the natives) | `str profile` (the target profile the program was built for: `esp32`, `ps1`...; empty for the host's) and `u32 heap` (its heap budget in bytes, 0 for none): the runtime enforces the budget, in an AOT program too |

`str` is `u32 length` and the bytes; `u32s` is `u32 count` and the values; `vtype` is `u8 class` (0 none, 1 integer, 2 f32, 3 f64, 4 reference) and, for a reference, `u16 class id`.
Instruction words are one 32-bit word each (`include/zn/bytecode.h`); the opcode numbers (`include/zn/opcodes.h`) and the runtime call ids (the row order of `include/zn/runtime.h`) are part of the format.

### Version rules

- The version rises with any change to the layout above, to an opcode's meaning or number, or to the order of the runtime table (a call is encoded by its row number: new rows go at the very end, after the host rows, so no known id moves; a file that uses a row an older core lacks needs the newer core: `arrSortAsc` and `arrSortDesc` are such rows, which the optimizer writes for `sort((a, b) => a - b)` on an f64[]).
- A reader loads exactly its own version. An older file is refused with "ZBC version N is older than the supported version 7: rebuild the program with this zinc"; a newer one with "... is newer ...: update zinc".
- No migration: a ZBC file is a build product (the device core and `zinc run` are always built from the same release as the files they load). The firmware image and the host tools are released together;
  `tests/compat/fib-v6.zbc` is the version 6 reference file (6 added the fixed-point ops MulFx12.., ZN-121); `tests/compat/fib-v5.zbc` (no fixed-point ops) and `tests/compat/fib-v4.zbc` (no natives table) must be refused as older. `tests/t0/irformat.sh` checks both and that other versions are refused with these messages.
- A truncated or corrupted file is rejected by `decode` and `verify` (`zinc zbc --check`), never trusted.
