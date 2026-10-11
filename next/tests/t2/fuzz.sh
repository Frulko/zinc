#!/bin/sh
# Fuzzing gate (ZN-147, ZN-433): 60 seconds per libFuzzer target (parse, check, zbc, native, zpk) with ASan and UBSan; a crash, a timeout or a leak fails the gate. Needs a clang with libFuzzer (Homebrew llvm) or, on macOS, Apple's clang and the libFuzzer that tools/libfuzzer builds.
cd "$(dirname "$0")/../.." || exit 2
[ -x "$(brew --prefix llvm 2>/dev/null)/bin/clang++" ] || [ -n "$LLVM" ] || [ "$(uname)" = Darwin ] || { echo "skipped: no clang with libFuzzer (brew install llvm)"; exit 77; }
rm -f tests/fuzz/crashes/*
tools/fuzz all "${FUZZ_SECONDS:-60}" || exit 1
