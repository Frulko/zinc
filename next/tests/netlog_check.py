#!/usr/bin/env python3
"""The scripted DevTools client of tests/t0/netlog.sh (ZN-370): usage netlog_check.py <quit port> <har file> <tls: 0|1> <inspector port>.
Enables the Network domain on the inspector of tests/golden/host/netlog.tsx, checks the events, the bodies and the masking, asks the program to quit, then
checks the HAR file it wrote: the same requests, the fields Chrome's HAR importer reads, no credential."""
import importlib.machinery, importlib.util, json, os, sys, time, urllib.request

here = os.path.dirname(os.path.abspath(__file__))
loader = importlib.machinery.SourceFileLoader("cdp_probe", os.path.join(here, "..", "tools", "cdp-probe"))
probe = importlib.util.module_from_spec(importlib.util.spec_from_loader("cdp_probe", loader)); loader.exec_module(probe)
quit_port, har_path, tls, inspector = int(sys.argv[1]), sys.argv[2], sys.argv[3] == "1", int(sys.argv[4])
SECRETS = ["s3cret-token", "cookie-secret", "server-secret"]

def fail(msg):
    print("netlog:", msg); sys.exit(1)
def need(cond, msg):
    if not cond: fail(msg)

# ---- 1. the Network events
events = []
closed = lambda ev: sum(1 for e in ev if e.get("method") == "Network.webSocketClosed") >= 2   # the WebSocket, then the MQTT client: the program's last step
probe.ws(inspector, "/zinc", [{"id": 1, "method": "Network.enable", "params": {}}], events, closed)
net = [e for e in events if e.get("method", "").startswith("Network.")]
def of(method, rid=None): return [e["params"] for e in net if e["method"] == "Network." + method and (rid is None or e["params"]["requestId"] == rid)]
def request(part):
    r = [p for p in of("requestWillBeSent") if part in p["request"]["url"]]
    need(len(r) == 1, "expected one request for %s, got %d" % (part, len(r)))
    return r[0]
def response(rid):
    r = of("responseReceived", rid)
    need(len(r) == 1 and len(of("loadingFinished", rid)) == 1, "request %s has no response or did not finish" % rid)
    return r[0]["response"]

echo = request("/echo")
need(echo["request"]["method"] == "POST" and echo["request"].get("postData") == '{"ask":"zinc"}', "the POST body is missing: %s" % json.dumps(echo["request"]))
heads = {k.lower(): v for k, v in echo["request"]["headers"].items()}
need(heads.get("authorization") == "***" and heads.get("x-trace") == "visible" and "host" in heads, "request headers: %s" % heads)
er = response(echo["requestId"])
need(er["status"] == 200 and er["mimeType"] == "application/json", "echo response: %s" % json.dumps(er)[:200])
need({k.lower(): v for k, v in er["headers"].items()}.get("set-cookie") == "***", "Set-Cookie is not masked")
t = er["timing"]
need(0 <= t["dnsEnd"] <= t["connectEnd"] <= t["sendEnd"] <= t["receiveHeadersEnd"] and t["sslStart"] == -1, "http timing: %s" % t)
need(response(request("/old")["requestId"])["status"] == 302 and response(request("/new")["requestId"])["status"] == 200, "the redirect is not two entries")
refused = request("/refused")
need(any("ECONNREFUSED" in p["errorText"] for p in of("loadingFailed", refused["requestId"])), "the refused fetch did not fail")

sockets = {p["url"]: p["requestId"] for p in of("webSocketCreated")}
wsid = next((i for u, i in sockets.items() if u.startswith("ws://127.0.0.1:") and u.endswith("/chat?room=1")), None)
mqid = next((i for u, i in sockets.items() if u.startswith("mqtt://127.0.0.1:")), None)
need(wsid and mqid, "WebSocket or MQTT entry missing: %s" % list(sockets))
def frames(kind, rid): return [p["response"]["payloadData"] for p in of(kind, rid) if p["response"]["opcode"] == 1]
need(of("webSocketHandshakeResponseReceived", wsid)[0]["response"]["status"] == 101, "no WebSocket handshake response")
need(frames("webSocketFrameSent", wsid) == ["hello ws"] and frames("webSocketFrameReceived", wsid) == ["echo hello ws"], "WebSocket frames: %s / %s" % (frames("webSocketFrameSent", wsid), frames("webSocketFrameReceived", wsid)))
pub = "PUBLISH zn/room/temp 21.5 hello mqtt"
need(pub in frames("webSocketFrameSent", mqid) and "SUBSCRIBE zn/#" in frames("webSocketFrameSent", mqid) and pub in frames("webSocketFrameReceived", mqid), "MQTT frames: %s" % of("webSocketFrameSent", mqid))

ids = [echo["requestId"]]
if tls:
    sec = request("/secure")
    need({k.lower(): v for k, v in sec["request"]["headers"].items()}.get("cookie") == "***", "Cookie is not masked")
    sr = response(sec["requestId"]); st = sr["timing"]
    need(sr["securityState"] == "secure" and 0 <= st["dnsEnd"] <= st["sslStart"] < st["sslEnd"] <= st["sendEnd"] <= st["receiveHeadersEnd"], "TLS timing: %s" % st)
    ids.append(sec["requestId"])
bodies = probe.ws(inspector, "/zinc", [{"id": 10 + k, "method": "Network.getResponseBody", "params": {"requestId": i}} for k, i in enumerate(ids)] +
                  [{"id": 20, "method": "Network.getRequestPostData", "params": {"requestId": ids[0]}}])
need(bodies[0]["result"] == {"body": '{"echo":{"ask":"zinc"}}', "base64Encoded": False}, "getResponseBody: %s" % bodies[0])
need(bodies[-1]["result"]["postData"] == '{"ask":"zinc"}', "getRequestPostData: %s" % bodies[-1])
if tls: need(bodies[1]["result"]["body"] == "here /secure", "TLS body: %s" % bodies[1])
for s in SECRETS: need(s not in json.dumps(events), "the events expose %s" % s)
cdp_urls = sorted([p["request"]["url"] for p in of("requestWillBeSent")] + list(sockets))
print("AC1 ok: %d requests in the Network domain (fetch with bodies, redirect, failure, WebSocket and MQTT frames)" % len(cdp_urls))
if tls: print("AC3 ok: TLS timing dns %.1f connect %.1f ssl %.1f..%.1f first byte %.1f ms; Authorization, Cookie, Set-Cookie masked" % (st["dnsEnd"], st["sslStart"], st["sslStart"], st["sslEnd"], st["receiveHeadersEnd"]))
else: print("AC3 partly: masking checked, TLS not run (no openssl 3.4+)")

# ---- 2. the HAR file, written when the program ends
urllib.request.urlopen("http://127.0.0.1:%d/quit" % quit_port, timeout=5).read()
for _ in range(100):
    if os.path.exists(har_path) and os.path.getsize(har_path) > 0: break
    time.sleep(0.05)
text = open(har_path).read()
log = json.loads(text)["log"]
need(log["version"] == "1.2" and log["creator"]["name"] == "zinc", "HAR header")
for e in log["entries"]:   # what Chrome's importer (devtools-frontend HARFormat) and the HAR 1.2 specification require
    time.strptime(e["startedDateTime"][:19], "%Y-%m-%dT%H:%M:%S")
    need(isinstance(e["time"], (int, float)) and e["time"] >= 0 and isinstance(e["cache"], dict), "HAR entry time / cache")
    q, r, tm = e["request"], e["response"], e["timings"]
    need(all(k in q for k in ("method", "url", "httpVersion", "cookies", "headers", "queryString", "headersSize", "bodySize")), "HAR request fields: %s" % list(q))
    need(all(k in r for k in ("status", "statusText", "httpVersion", "cookies", "headers", "content", "redirectURL", "headersSize", "bodySize")), "HAR response fields: %s" % list(r))
    need("size" in r["content"] and "mimeType" in r["content"] and all(isinstance(tm[k], (int, float)) for k in ("send", "wait", "receive")), "HAR content / timings")
    need(all(set(h) == {"name", "value"} for h in q["headers"] + r["headers"]), "HAR headers")
har_urls = sorted(e["request"]["url"] for e in log["entries"] if "/quit" not in e["request"]["url"])
need(har_urls == cdp_urls, "the HAR lists %s, the Network domain %s" % (har_urls, cdp_urls))
by = {e["request"]["url"].split("/", 3)[-1] if e["request"]["url"].startswith("http") else e["request"]["url"].split(":")[0]: e for e in log["entries"]}
need(by["echo?user:pw@x"]["request"]["postData"]["text"] == '{"ask":"zinc"}' and by["echo?user:pw@x"]["response"]["content"]["text"] == '{"echo":{"ask":"zinc"}}', "HAR bodies")
need(by["old"]["response"]["redirectURL"] == "/new" and by["refused"]["response"]["status"] == 0, "HAR redirect / failure")
need([m["data"] for m in by["ws"]["_webSocketMessages"] if m["opcode"] == 1] == ["hello ws", "echo hello ws"] and by["ws"]["_resourceType"] == "websocket", "HAR WebSocket messages")
need(pub in [m["data"] for m in by["mqtt"]["_webSocketMessages"]], "HAR MQTT messages")
if tls: need(by["secure"]["timings"]["ssl"] > 0 and by["secure"]["timings"]["connect"] >= by["secure"]["timings"]["ssl"], "HAR TLS timings: %s" % by["secure"]["timings"])
for s in SECRETS: need(s not in text, "the HAR exposes %s" % s)
print("AC2 ok: HAR 1.2 with the same %d requests, bodies, messages and timings" % len(har_urls))
