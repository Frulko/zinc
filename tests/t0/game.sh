#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
for engine in interp quickjs native; do
  case $engine in interp) flag=--interp ;; quickjs) flag='--engine quickjs' ;; native) flag='--native' ;; esac
  got=$(ZINC_HEADLESS=1 timeout 20 "$Z" run tests/data/game/main.ts $flag 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | grep -q '^game: ok$' || { echo "$got"; exit 1; }
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=12 ZINC_INPUT="$PWD/tests/data/game/actions.input" timeout 20 "$Z" run tests/data/game/actions.ts $flag 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | grep -q '^actions: ok$' || { echo "$got"; exit 1; }
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5 ZINC_INPUT="$PWD/tests/data/game/focus.input" timeout 20 "$Z" run tests/data/game/focus.ts $flag 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | grep -q '^focus: ok$' || { echo "$got"; exit 1; }
  echo "game: $engine ok"
done
