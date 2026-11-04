#!/bin/sh
# Folder playlist routing: picker and drop both call addFiles.
cd "$(dirname "$0")/../.." || exit 2
node --disable-warning=ExperimentalWarning tests/data/ipod-import/folders.mjs
