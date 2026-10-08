#!/bin/sh
# Fuzzing gate (ZN-147): 60 seconds per libFuzzer target (parse, check, zbc, native) with ASan and UBSan; a crash, a timeout or a leak fails the gate. Needs a clang with libFuzzer (Homebrew llvm).
cd "$(dirname "$0")/../.." || exit 2
[ -x "$(brew --prefix llvm 2>/dev/null)/bin/clang++" ] || [ -n "$LLVM" ] || { echo "skipped: no clang with libFuzzer (brew install llvm)"; exit 77; }
rm -f tests/fuzz/crashes/*
tools/fuzz all "${FUZZ_SECONDS:-60}" || exit 1
