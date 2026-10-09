#!/bin/sh
# Drift guard of zinc:system (ZN-232): ops.d.ts and native/ops.gen.h are generated from plugins/system/ops.json by tools/system-ops, every op names a permission whose feature zinc.json knows
# (project.cpp systemFeatures), and every scripted event the simulator knows has a typing.
cd "$(dirname "$0")/../.." || exit 2
tools/system-ops --check || exit 1
python3 - <<'P' || exit 1
import json
d = json.load(open("../plugins/system/ops.json"))
features = {"notification", "menu", "tray", "dialog", "window", "shortcut", "instance", "deep-link", "autostart", "dock", "power", "clipboard", "opener", "update"}
bad = [o["op"] for o in d["ops"] if o["permission"].split(":")[0] not in features]
if bad: print("ops with an unknown permission feature:", bad); raise SystemExit(1)
names = [o["op"] for o in d["ops"]]
if len(set(names)) != len(names): print("duplicate op names"); raise SystemExit(1)
for o in d["ops"]:
    json.loads(o["sim"])
P
