#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
for engine in interp quickjs native; do
  case $engine in interp) flag=--interp ;; quickjs) flag='--engine quickjs' ;; native) flag='--native' ;; esac
  got=$(ZINC_HEADLESS=1 timeout 20 "$Z" run tests/data/game/main.ts $flag 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | grep -q '^game: ok$' || { echo "$got"; exit 1; }
  echo "game: $engine ok"
done
