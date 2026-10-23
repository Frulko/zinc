#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
python3 -B tests/data/agent_logs_eof.py
