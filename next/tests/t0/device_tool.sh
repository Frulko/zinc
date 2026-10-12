#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
tools/device selftest
