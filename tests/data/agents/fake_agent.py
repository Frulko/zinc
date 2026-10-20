#!/usr/bin/env python3
"""A stand-in for the claude, codex and opencode CLIs (tests/t1/agents_chat.sh), named by the link that starts it.
It logs its arguments, folder and fast-mode switch to $FAKE_AGENT_LOG and prints an answer in that CLI's own stream format
(the versions examples/agents/src/services/agents.ts names). The prompt `fail` makes opencode fail."""
import json, os, sys

name, args = os.path.basename(sys.argv[0]), sys.argv[1:]
with open(os.environ["FAKE_AGENT_LOG"], "a") as log:
    log.write("%s %s cwd=%s fastoff=%s\n" % (name, json.dumps(args), os.getcwd(), os.environ.get("CLAUDE_CODE_DISABLE_FAST_MODE", "")))
if args == ["--version"]:
    print("%s 9.9.9 (fake)" % name)
    sys.exit(0)
if name == "codex" and args[:2] == ["debug", "models"]:
    tiers = [{"id": "priority", "name": "Fast"}]
    print(json.dumps({"models": [
        {"slug": "gpt-test", "display_name": "GPT-Test", "visibility": "list", "service_tiers": tiers,
         "supported_reasoning_levels": [{"effort": "low"}, {"effort": "high"}, {"effort": "ultra"}]},
        {"slug": "gpt-hidden", "display_name": "GPT-Hidden", "visibility": "hide", "service_tiers": [], "supported_reasoning_levels": []},
    ]}))
    sys.exit(0)
if name == "opencode" and args == ["models"]:
    print("prov/model-a\nprov/model-b")
    sys.exit(0)

prompt = args[args.index("-p") + 1] if name == "claude" else args[-1]
def out(o): print(json.dumps(o), flush=True)

if name == "claude":
    out({"type": "system", "subtype": "init", "session_id": "s-claude"})
    for d in ["Hello", " from", " Claude: ", prompt]:
        out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": d}}})
    out({"type": "assistant", "message": {"content": [{"type": "text", "text": "REPEATED"}]}})   # the app must not show it twice
    out({"type": "stream_event", "event": {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "name": "Read"}}})
    out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 2, "delta": {"type": "text_delta", "text": "Done."}}})
    out({"type": "result", "subtype": "success", "is_error": False, "result": "REPEATED", "session_id": "s-claude"})
elif name == "codex":
    sys.stdin.read()   # the real CLI reads stdin while it is open: the app must close it
    out({"type": "thread.started", "thread_id": "t-codex"})
    out({"type": "item.completed", "item": {"id": "item_0", "type": "error", "message": "WARNING about config.toml"}})
    out({"type": "turn.started"})
    out({"type": "item.started", "item": {"id": "item_1", "type": "command_execution", "command": "ls"}})
    out({"type": "item.completed", "item": {"id": "item_2", "type": "agent_message", "text": "Codex says: " + prompt}})
    out({"type": "turn.completed", "usage": {}})
elif name == "opencode":
    if prompt == "fail":
        print("boom: no provider", file=sys.stderr)
        sys.exit(3)
    out({"type": "step_start", "sessionID": "ses-open", "part": {"type": "step-start"}})
    out({"type": "text", "sessionID": "ses-open", "part": {"type": "text", "text": "opencode says: " + prompt}})
