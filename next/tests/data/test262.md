# test262 subset (ZN-090)

`test262-regexp.tar.xz` holds `harness/` and these parts of `test/` of tc39/test262 at commit c8c798898646638cd0c24879f8e0374e847e7d74:
`built-ins/RegExp` (without `property-escapes/generated`, 613 files of Unicode data tests, 3.4 MB), `built-ins/String/prototype/{match,matchAll,replace,replaceAll,search,split}`
and `language/literals/regexp`. sha256 of the archive: 05cec6b33b376bc0d6533b470848dd3e4f6374976f732550970e46c9f1a7fed8 .
Run it with `tools/test262` (or `tests/run --tier t1 --only test262_regexp`). Result when recorded: 2557 tests, 2533 pass (99.06 %), 24 fail, all listed with a reason in
`test262-regexp.failing`.
