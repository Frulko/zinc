#!/usr/bin/env python3
"""Summarises a chrome://webrtc-internals dump (the file of "Create dump" / "Download the PeerConnection updates and stats data") into the
few lines that tell why a video does not show: what arrived, what decoded. No IP address or SDP is printed, so the output can be shared.

    python3 tools/webrtc-dump-summary.py webrtc_internals_dump.txt
"""
import json, re, sys

WANT = ["packetsReceived", "packetsLost", "bytesReceived", "framesReceived", "framesDecoded", "framesDropped", "keyFramesDecoded",
        "pliCount", "firCount", "nackCount", "frameWidth", "frameHeight", "framesPerSecond", "decoderImplementation", "codecId",
        "totalDecodeTime", "freezeCount", "jitterBufferDelay", "totalInterFrameDelay", "qpSum", "insertableStreams", "kind", "mid"]

def last(v):
    try:
        a = json.loads(v) if isinstance(v, str) else v
        return a[-1] if isinstance(a, list) and a else a
    except Exception:
        return v

def main(path):
    d = json.load(open(path))
    pcs = d.get("PeerConnections", {})
    n = 0
    for pid, pc in pcs.items():
        groups = {}
        for key, s in pc.get("stats", {}).items():
            m = re.match(r"(.+)-([A-Za-z]+)$", key)
            if not m or m.group(2) not in WANT:
                continue
            g = m.group(1)
            if "inbound" not in g and "recv" not in g:
                continue
            groups.setdefault(g, {})[m.group(2)] = last(s.get("values"))
        for g, v in sorted(groups.items()):
            if v.get("kind") == "audio" or "packetsReceived" not in v and "framesDecoded" not in v:
                continue
            n += 1
            print(f"[{pid} {g}]")
            for k in WANT:
                if k in v:
                    print(f"  {k}: {v[k]}")
    if n == 0:
        print("no inbound video stream in this dump (the viewer was not receiving one: was the stream opened while the dump was recording?)")

main(sys.argv[1])
