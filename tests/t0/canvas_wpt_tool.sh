#!/bin/sh
# Pure runner checks with synthetic callbacks and a fake pixel context, no WPT run.
set -eu
cd "$(dirname "$0")/../.."
python3 tools/canvas-wpt --self-test
