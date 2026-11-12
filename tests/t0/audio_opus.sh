#!/bin/sh
# Production decoder and null mixer, with an inert installed-source staging check.
set -eu
cd "$(dirname "$0")/../.."
python3 tests/native/audio_opus_test.py "$ZINC"
