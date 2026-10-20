#!/usr/bin/env python3
"""Prints n TCP ports that are free on 127.0.0.1 right now: usage free_ports.py [n]. For the tests that listen (ZN-633): no fixed port, so the same test can
run in two trees at once."""
import socket, sys
socks = [socket.socket() for _ in range(int(sys.argv[1]) if len(sys.argv) > 1 else 1)]
for s in socks: s.bind(("127.0.0.1", 0))   # all held until every number is known, so they differ
print(*[s.getsockname()[1] for s in socks])
