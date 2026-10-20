#!/usr/bin/env python3
"""A stand-in for the claude, codex and opencode CLIs (tests/t1/agents_chat.sh, agents_memory.sh), named by the link that
starts it. It logs its arguments, folder and fast-mode switch to $FAKE_AGENT_LOG and prints an answer in that CLI's own
stream format (the versions examples/agents/src/services/agents.ts names). Prompts with a meaning:
  fail     opencode fails (exit 3, a line on stderr)
  replay   prints the stream the real CLI printed (examples/agents/tests/fixtures/<cli>-*.jsonl)
  hang     starts a tool and waits: SIGINT is logged and ignored once, SIGTERM ends it (Escape's escalation)
  flood    $FAKE_FLOOD_EVENTS tool calls carrying $FAKE_FLOOD_MB megabytes of output in all, two of them in lines too long
           to parse (Claude's format)"""
import glob, json, os, signal, sys, time

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
def log(line):
    with open(os.environ["FAKE_AGENT_LOG"], "a") as f: f.write(line + "\n")

if prompt == "replay":
    here = os.path.dirname(os.path.realpath(__file__))
    for path in glob.glob(os.path.join(here, "../../../../examples/agents/tests/fixtures/%s-*.jsonl" % name)):
        sys.stdout.write(open(path).read())
    sys.exit(0)
if prompt == "hang":
    def on_int(sig, frame):
        log("%s got SIGINT" % name)
        signal.signal(signal.SIGINT, signal.SIG_DFL)   # the next one ends it
    def on_term(sig, frame):
        log("%s got SIGTERM" % name)
        sys.exit(143)
    signal.signal(signal.SIGINT, on_int)
    signal.signal(signal.SIGTERM, on_term)
    out({"type": "system", "subtype": "init", "session_id": "s-claude"})
    out({"type": "stream_event", "event": {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "t-hang", "name": "Bash"}}})
    while True: time.sleep(0.05)
if prompt == "flood":
    events, mb = int(os.environ.get("FAKE_FLOOD_EVENTS", "20000")), int(os.environ.get("FAKE_FLOOD_MB", "200"))
    big = 6 * 1024 * 1024   # two outputs of this size: longer than the app's line cap (4 MiB)
    each = max(0, (mb * 1024 * 1024 - 2 * big) // max(1, events - 2))
    chunk = ("0123456789abcdef" * (each // 16 + 1))[:each]
    out({"type": "system", "subtype": "init", "session_id": "s-claude"})
    for i in range(events):
        tid = "t%d" % i
        out({"type": "stream_event", "event": {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": tid, "name": "Bash"}}})
        out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": '{"command": "cat part%d"}' % i}}})
        body = ("Z" * big) if i in (events // 3, 2 * events // 3) else chunk
        out({"type": "user", "message": {"role": "user", "content": [{"tool_use_id": tid, "type": "tool_result", "content": body}]}, "parent_tool_use_id": None})
        if i % 50 == 0:
            for d in ["Step ", str(i), " done. "]:
                out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": d}}})
    out({"type": "result", "subtype": "success", "is_error": False, "result": "", "session_id": "s-claude"})
    sys.exit(0)

if name == "claude":
    out({"type": "system", "subtype": "init", "session_id": "s-claude"})
    for d in ["Hello", " from", " Claude: ", prompt]:
        out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": d}}})
    out({"type": "assistant", "message": {"content": [{"type": "text", "text": "REPEATED"}]}})   # the app must not show it twice
    out({"type": "stream_event", "event": {"type": "message_start"}})
    out({"type": "stream_event", "event": {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "t-read", "name": "Read"}}})
    out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": '{"file_path": "CLAUDE.md"}'}}})
    out({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t-read", "name": "Read", "input": {"file_path": "CLAUDE.md"}}]}, "parent_tool_use_id": None})
    out({"type": "user", "message": {"content": [{"tool_use_id": "t-read", "type": "tool_result", "content": "# Test project"}]}, "parent_tool_use_id": None})
    out({"type": "stream_event", "event": {"type": "content_block_start", "index": 2, "content_block": {"type": "tool_use", "id": "t-agent", "name": "Agent"}}})
    out({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t-agent", "name": "Agent", "input": {"description": "Look around", "subagent_type": "Explore", "prompt": "List the files"}}]}, "parent_tool_use_id": None})
    out({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t-sub", "name": "Glob", "input": {"pattern": "*.md"}}]}, "parent_tool_use_id": "t-agent"})
    out({"type": "user", "message": {"content": [{"tool_use_id": "t-sub", "type": "tool_result", "content": "CLAUDE.md\nAGENTS.md"}]}, "parent_tool_use_id": "t-agent"})
    out({"type": "user", "message": {"content": [{"tool_use_id": "t-agent", "type": "tool_result", "content": [{"type": "text", "text": "Two markdown files."}]}]}, "parent_tool_use_id": None})
    out({"type": "stream_event", "event": {"type": "message_start"}})
    out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Done."}}})
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
