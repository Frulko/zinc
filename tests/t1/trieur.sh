#!/bin/sh
# zinc:trieur: examples/trieur runs trieur's own deck code (third_party/trieur, unchanged) on QuickJS. A scripted session on the Links demo files a
# card by key, undoes it, drags one onto a tile (the genie flies it there), files three more by key and takes the suggestion with Enter; each
# demo page opens and files a card; the light scheme and French follow the computer. Frame hashes in tests/golden/trieur/hashes.txt.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_STEPS=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
while read -r name lang scheme frames input; do
  printf "$input" | tr '|' '\n' > "$tmp/in"
  out=$(cd examples/trieur && ZINC_STORAGE="$tmp/st-$name" LANG=$lang ZINC_SCHEME=$scheme ZINC_FRAMES=$frames ZINC_INPUT="$tmp/in" ZINC_FRAMEHASH=last "$ZINC" run . 2>&1)
  echo "$out" | grep -q "Uncaught" && { echo "trieur $name: $(echo "$out" | grep -A3 Uncaught)"; fail=1; continue; }
  got=$(echo "$out" | grep framehash | awk '{print $5}')
  want=$(grep "^$name " tests/golden/trieur/hashes.txt | awk '{print $2}')
  [ "$got" = "$want" ] || { echo "trieur $name: $got, recorded $want"; fail=1; }
done <<'S'
links en_US.UTF-8 dark 240 20 key a|50 key Backspace|80 move 640 380|81 down|83 move 760 420|85 move 880 460|87 move 1000 500|89 move 1100 520|90 move 1140 528|95 up|130 key s|150 key s|170 key d|200 key Enter
layouts fr_FR.UTF-8 light 90 5 move 100 151|6 down|7 up|20 move 400 28|21 down|22 up|40 key a
mail en_US.UTF-8 light 70 5 move 100 205|6 down|7 up|30 key a
study fr_FR.UTF-8 dark 70 5 move 100 259|6 down|7 up|20 move 740 300|21 down|22 up|40 key d
S
[ $fail -eq 0 ] && echo "trieur: ok"
exit $fail
