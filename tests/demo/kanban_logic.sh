#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export KANBAN_TEST_DATA="$(pwd)/tests/data/kanban"
"$Z" run tests/data/kanban/unit.ts
command -v backlog >/dev/null || { echo 'kanban: backlog CLI needed for the live integration check'; exit 77; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/backlog/tasks"
cat > "$tmp/backlog.config.yml" <<'EOF'
project_name: "Kanban Watch Test"
default_status: "Backlog"
statuses: ["Backlog", "Ready", "In Progress", "Review", "Done"]
task_prefix: "zn"
backlog_directory: "backlog"
filesystem_only: true
remote_operations: false
auto_commit: false
EOF
cat > "$tmp/backlog/tasks/zn-001 - Watch.md" <<'EOF'
---
id: ZN-001
title: Watch fixture
status: Backlog
assignee: []
created_date: '2026-10-22 10:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A watch fixture for the Kanban integration test.
<!-- SECTION:DESCRIPTION:END -->
EOF
KANBAN_REPO="$tmp" timeout 20 "$Z" run tests/data/kanban/watch.ts
KANBAN_REPO="$tmp" KANBAN_AUTHOR='Kanban Test' timeout 20 "$Z" run tests/data/kanban/write.ts
(cd "$tmp" && backlog task edit ZN-001 --title "zinc:ui as light and free as React Native's primitives" \
  --ac 'First original criterion' --ac 'Second original criterion' --ac 'Third original criterion' --check-ac 1 \
  --plan 'Original implementation plan.' --notes 'Original implementation notes, with **Markdown**.' --final-summary 'Original result.' --plain >/dev/null)
KANBAN_REPO="$tmp" KANBAN_AUTHOR='Kanban Test' ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20000 ZINC_SIZE=1560x940 \
  timeout 30 "$Z" run tests/data/kanban/editor.ts
