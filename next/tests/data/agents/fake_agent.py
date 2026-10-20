#!/usr/bin/env python3
"""A stand-in for the claude, codex and opencode CLIs (tests/t1/agents_chat.sh, agents_memory.sh), named by the link that
starts it. It logs its arguments, folder and fast-mode switch to $FAKE_AGENT_LOG and prints an answer in that CLI's own
stream format (the versions examples/agents/src/services/agents.ts names). Prompts with a meaning:
  fail     opencode fails (exit 3, a line on stderr)
  replay   prints the stream the real CLI printed (examples/agents/tests/fixtures/<cli>-*.jsonl)
  hang     starts a tool and waits: SIGINT is logged and ignored once, SIGTERM ends it (Escape's escalation)
  markdown Claude answers in markdown (heading, list, inline marks, a fenced block, a table), streamed in small pieces
  flood    $FAKE_FLOOD_EVENTS tool calls carrying $FAKE_FLOOD_MB megabytes of output in all, two of them in lines too long
           to parse (Claude's format)
  slow     Claude runs a Bash tool for $FAKE_SLOW_S seconds (3 by default), then a Read that fails, then answers
Every turn reports its usage as that CLI does; `claude -p /usage` and `codex app-server` answer the plan limits (no model call
in the real CLIs either)."""
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
if name == "claude" and args[:2] == ["-p", "/usage"]:
    text = ("Current session: 8% used \u00b7 resets Oct 20 at 12:59pm (Europe/Paris)\n"
            "Current week (all models): 22% used \u00b7 resets Oct 25 at 11:59am (Europe/Paris)\n")
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "num_turns": 0, "total_cost_usd": 0, "result": text}))
    sys.exit(0)
if name == "codex" and args == ["app-server"]:
    for line in sys.stdin:   # JSON-RPC over stdio: initialize, initialized, account/rateLimits/read
        m = json.loads(line)
        if m.get("id") == 1: out_ = {"id": 1, "result": {"platformOs": "fake"}}
        elif m.get("id") == 2: out_ = {"id": 2, "result": {"rateLimits": {"primary": {"usedPercent": 41, "windowDurationMins": 300, "resetsAt": int(time.time()) + 7200},
                                                         "secondary": {"usedPercent": 12, "windowDurationMins": 10080, "resetsAt": int(time.time()) + 4 * 86400}}}}
        else: continue
        print(json.dumps(out_), flush=True)
    sys.exit(0)
if name == "opencode" and args == ["models"]:
    print("prov/model-a\nprov/model-b")
    sys.exit(0)

prompt = args[args.index("-p") + 1] if name == "claude" else args[-1]
def out(o): print(json.dumps(o), flush=True)
def log(line):
    with open(os.environ["FAKE_AGENT_LOG"], "a") as f: f.write(line + "\n")
def call(i, o, cr, cw):   # Claude's usage of one model call: at message_start, then the final output count at message_delta
    u = {"input_tokens": i, "cache_creation_input_tokens": cw, "cache_read_input_tokens": cr, "output_tokens": 1}
    out({"type": "stream_event", "event": {"type": "message_start", "message": {"model": "claude-test", "usage": u}}})
    out({"type": "stream_event", "event": {"type": "message_delta", "delta": {}, "usage": dict(u, output_tokens=o)}})
def claude_result(text):
    out({"type": "rate_limit_event", "rate_limit_info": {"status": "allowed", "unifiedWindows": {
        "five_hour": {"utilization": 0.08, "resetsAt": int(time.time()) + 3 * 3600}, "seven_day": {"utilization": 0.22, "resetsAt": int(time.time()) + 5 * 86400}}}})
    out({"type": "result", "subtype": "success", "is_error": False, "result": text, "session_id": "s-claude", "total_cost_usd": 0.042,
         "modelUsage": {"claude-test": {"inputTokens": 1200, "outputTokens": 1500, "cacheReadInputTokens": 9000, "cacheCreationInputTokens": 2200,
                                        "costUSD": 0.03, "contextWindow": 200000},
                        "claude-small": {"inputTokens": 300, "outputTokens": 300, "cacheReadInputTokens": 0, "cacheCreationInputTokens": 0,
                                         "costUSD": 0.012, "contextWindow": 200000}}})

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
if name == "claude" and prompt == "slow":
    out({"type": "system", "subtype": "init", "model": "claude-test", "session_id": "s-claude"})
    call(1200, 40, 9000, 2200)
    out({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t-slow", "name": "Bash", "input": {"command": "npm test"}}]}, "parent_tool_use_id": None})
    time.sleep(float(os.environ.get("FAKE_SLOW_S", "3")))
    out({"type": "user", "message": {"content": [{"tool_use_id": "t-slow", "type": "tool_result", "content": "ok"}]}, "parent_tool_use_id": None})
    out({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t-bad", "name": "Read", "input": {"file_path": "missing.ts"}}]}, "parent_tool_use_id": None})
    out({"type": "user", "message": {"content": [{"tool_use_id": "t-bad", "type": "tool_result", "content": "File does not exist.", "is_error": True}]}, "parent_tool_use_id": None})
    call(10, 1460, 11200, 300)
    out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Tests pass."}}})
    claude_result("Tests pass.")
    sys.exit(0)
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

MARKDOWN = (
    "## Build notes\n\nRun **make all** with *care*, then read `build/log.txt` and the [guide](https://example.com/guide).\n\n"
    "- first step\n- second with `code`\n  - nested item\n1. numbered\n\n"
    "> a quoted line\n\n```sh\nmake all\necho done\n```\n\n"
    "| Name | Size |\n|------|-----:|\n| a.ts | 12 |\n| b.ts | 7 |\n\nThat is all.")
if name == "claude" and "markdown" in prompt:
    out({"type": "system", "subtype": "init", "session_id": "s-claude"})
    for k in range(0, len(MARKDOWN), 23):
        out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": MARKDOWN[k:k + 23]}}})
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
    call(1200, 40, 9000, 2200)
    out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Done."}}})
    claude_result("REPEATED")
elif name == "codex":
    sys.stdin.read()   # the real CLI reads stdin while it is open: the app must close it
    out({"type": "thread.started", "thread_id": "t-codex"})
    out({"type": "item.completed", "item": {"id": "item_0", "type": "error", "message": "WARNING about config.toml"}})
    out({"type": "turn.started"})
    out({"type": "item.started", "item": {"id": "item_1", "type": "command_execution", "command": "ls"}})
    out({"type": "item.completed", "item": {"id": "item_2", "type": "agent_message", "text": "Codex says: " + prompt}})
    out({"type": "turn.completed", "usage": {"input_tokens": 21320, "cached_input_tokens": 12288, "cache_write_input_tokens": 0, "output_tokens": 5}})
elif name == "opencode":
    if prompt == "fail":
        print("boom: no provider", file=sys.stderr)
        sys.exit(3)
    out({"type": "step_start", "sessionID": "ses-open", "part": {"type": "step-start"}})
    out({"type": "text", "sessionID": "ses-open", "part": {"type": "text", "text": "opencode says: " + prompt}})
    out({"type": "step_finish", "sessionID": "ses-open", "part": {"type": "step-finish", "cost": 0, "tokens": {"input": 12249, "output": 3, "reasoning": 0, "cache": {"read": 571, "write": 0}}}})
