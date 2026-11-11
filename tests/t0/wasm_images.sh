#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
timeout 10 node tests/wasm/images.mjs
