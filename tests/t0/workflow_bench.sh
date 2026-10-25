#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tools/bench-workflows-macos --self-test
