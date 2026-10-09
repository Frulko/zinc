#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STATE=/run/zinc-quill-test
LOCK=/tmp/epframebuffer.lock
WAKE=/sys/power
UNIT=zinc-quill-test
VENDOR=/usr/lib/plugins/scenegraph/libqsgepaper.so
export LD_LIBRARY_PATH="$HERE:/usr/lib/plugins/scenegraph"

fail() { echo "quill-test: $*" >&2; exit 1; }
clear_stale_lock() {
    [ -e "$LOCK" ] || return 0
    # QLockFile: pid, application, host, machine ID, boot ID. Never remove a live owner's lock.
    { read -r owner; read -r app; } < "$LOCK"
    case "$owner" in ''|*[!0-9]*|0|1) fail "Unrecognized display lock PID";; esac
    case "$app" in xochitl|quill|scribble) ;; *) fail "Unknown display lock owner: $app";; esac
    if kill -0 "$owner" 2>/dev/null; then fail "Display lock owner $owner is still alive"; fi
    rm -- "$LOCK"
}

case "${1:-launch}" in
launch)
    # All compatibility checks happen before creating a service or stopping xochitl.
    cd "$HERE"
    sha256sum -c SHA256SUMS || fail "Bundle checksum mismatch"
    printf '%s  %s\n' 3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08 "$VENDOR" |
        sha256sum -c - || fail "Untested firmware library"
    /lib/ld-linux-aarch64.so.1 --list "$HERE/scribble" >/dev/null || fail "Missing runtime dependency"
    [ -w "$WAKE/wake_lock" ] && [ -w "$WAKE/wake_unlock" ] || fail "Wakelock unavailable"
    command -v pgrep >/dev/null || fail "pgrep unavailable"
    systemctl is-active --quiet xochitl || fail "xochitl must be running before this test"
    # A fixed unit name also rejects simultaneous launches. No unsupervised fallback.
    exec systemd-run --unit="$UNIT" --collect --service-type=exec \
        --property=RuntimeDirectory=zinc-quill-test \
        --property=RuntimeMaxSec=180 \
        --property=TimeoutStartSec=30 \
        --property=TimeoutStopSec=30 \
        --property=KillMode=control-group \
        --property="ExecStopPost=/bin/sh $HERE/launch.sh restore" \
        /bin/sh "$HERE/launch.sh" session
    ;;
session)
    [ -n "${INVOCATION_ID:-}" ] && [ -d "$STATE" ] || fail "Launch through the supervised service"
    # Mark first so ExecStopPost releases even if interrupted just after acquisition.
    touch "$STATE/wake"
    echo "$UNIT" > "$WAKE/wake_lock"
    grep -qw "$UNIT" "$WAKE/wake_lock" || fail "Wakelock acquisition failed"
    touch "$STATE/restore"
    systemctl stop xochitl || fail "Could not stop xochitl"
    if systemctl is-active --quiet xochitl || pgrep -x xochitl >/dev/null; then
        fail "xochitl still owns the panel"
    fi
    clear_stale_lock
    cd "$HERE"
    exec "$HERE/scribble"
    ;;
restore)
    [ -n "${INVOCATION_ID:-}" ] || fail "Restoration must run under systemd"
    # systemd terminates the service's control group BEFORE ExecStopPost, including on timeout/crash.
    if [ -f "$STATE/restore" ]; then
        if ! pgrep -x xochitl >/dev/null; then clear_stale_lock; fi
        systemctl start xochitl || fail "Restore failed; keeping wakelock. Start xochitl via SSH"
        systemctl is-active --quiet xochitl || fail "xochitl did not restart; keeping wakelock"
        rm "$STATE/restore"
    fi
    if [ -f "$STATE/wake" ]; then
        echo "$UNIT" > "$WAKE/wake_unlock"
        rm "$STATE/wake"
    fi
    ;;
*) fail "Usage: launch.sh [launch]";;
esac
