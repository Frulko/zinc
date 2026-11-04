#!/usr/bin/env python3
"""Explicit hardware check: the paired iPhone running rn-showcase, with its native keyboard."""
import json
from pathlib import Path
import subprocess

tool = Path(__file__).resolve().parents[2] / "tools/ios-legacy-device"

def call(*args):
    return subprocess.check_output([str(tool), *map(str, args)], text=True)

def state():
    return json.loads(call("keyboard-state"))

observed = []
try:
    call("tap", 160, 440)
    for action in ("return", "done"):
        call("tap", 120, 200)
        before = state()
        assert before["firstResponder"] and before["inset"] > 0, before
        assert "submit=blurAndSubmit" in before["traits"], before
        call(action)
        after = state()
        assert not after["firstResponder"] and after["inset"] == 0, after
        observed.append({"action": action, "before": before, "after": after})
    call("tap", 120, 280)
    email = state()
    assert email["firstResponder"] and email["keyboardType"] == 7 and "type=email" in email["traits"], email
    observed.append({"email": email})
finally:
    call("done")
    call("up")
print(json.dumps(observed, indent=2))
