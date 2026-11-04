#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cat > "$t/hold.cpp" <<'CPP'
#include "app/dev_gestures.h"
#include <cassert>
int main() {
  zn::app::HomeHold hold;
  hold.down(0); hold.down(0);
  assert(!hold.poll(1000));
  hold.down(1000);
  assert(!hold.poll(1799));
  assert(hold.poll(1800));
  assert(!hold.poll(3000));
  hold.up(); hold.down(3000);
  hold.up();
  assert(!hold.poll(4000));
  hold.down(4000); hold.down(4000);
  assert(!hold.poll(5000)); // four fingers cancel, even if the fourth is then lifted
  hold.up(); assert(!hold.poll(6000));
  hold.reset();
  hold.down(0); hold.down(0); hold.down(0); hold.reset();
  assert(!hold.poll(1000));
  zn::app::Shake shake;
  for (int i = 0; i < 2000; i += 20) assert(!shake.sample(1.0, i));
  assert(!shake.sample(2.2, 2000));
  for (int i = 2020; i < 3000; i += 20) assert(!shake.sample(2.2, i)); // held force is one peak
  assert(!shake.sample(1.0, 3020));
  assert(!shake.sample(2.2, 4000));
  assert(!shake.sample(1.0, 4020));
  assert(!shake.sample(2.2, 4200));
  assert(!shake.sample(1.0, 4220));
  assert(shake.sample(2.2, 4400));
  assert(!shake.sample(2.2, 4600)); // cooldown
  shake.reset();
  assert(!shake.sample(2.2, 7000));
  assert(!shake.sample(1.0, 7020));
  assert(!shake.sample(2.2, 9000)); // separate bumps do not accumulate
}

CPP
c++ -std=c++20 -I src "$t/hold.cpp" -o "$t/hold"
"$t/hold"
echo 'zinc go gesture: three-finger hold, cancellation, shake peaks and cooldown pass'
