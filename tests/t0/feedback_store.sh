#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ "$(uname)" = Darwin ] || { echo 'skipped: Foundation feedback store'; exit 77; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
c++ -std=c++20 -fobjc-arc -framework Foundation -I src/app tests/native/feedback_store.mm src/app/ios_feedback_store.mm -o "$t/check"
"$t/check" "$t/data"
echo 'feedback store: per-app separation, timestamp, Unicode, validation and write failure pass'
