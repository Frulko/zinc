#!/bin/sh
# AppLoad's entry: the session under the display lease. xochitl comes back on every way out; a 2 s press on power ends it from anywhere; 30 min at most.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LD_LIBRARY_PATH="$HERE/bin:/usr/lib/plugins/scenegraph" exec /home/root/zinc/bin/lease launch --max 1800 --vendor-sha256 07aa9327f725288a5df5aebc33ea4b151c27d97d3b850279947ddddf3dd8ddec "$HERE/session.sh"
